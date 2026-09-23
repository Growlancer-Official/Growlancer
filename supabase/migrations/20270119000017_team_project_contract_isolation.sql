-- ═══════════════════════════════════════════════════════════════════════════
-- Team Projects: make the "N independent contracts" promise actually hold
--
-- Asked to verify that one member's dispute / refund / milestone outcome never
-- touches another member's escrow. Reading every live writer of `escrow` first
-- (all 17 `UPDATE escrow` sites) showed the *design* is contract-scoped: each
-- write keys on `WHERE contract_id = …`, and the escrow RLS policy is
-- participants-only. The runtime probe in scripts/e2e/pentest-privileges.mjs
-- (§16) drives a 3-role team project to prove it. Doing that turned up three
-- real defects, all fixed here:
--
-- ─── F1 (BLOCKER): a team contract could never be created ──────────────────
-- `create_team_role_contract` inserts `project_id = NULL` by design — a team
-- role has no client `projects` row, it links through `team_project_id` — but
-- `contracts.project_id` is NOT NULL. Every call dies with
-- `23502 null value in column "project_id" … violates not-null constraint`,
-- reproduced against production. So Team Projects has never been able to hire
-- anyone: the isolation question could not even be asked of a real team
-- contract. The team tables themselves were created live (the repo migration
-- 20261229000000 is a one-character stub), so this drifted in unnoticed.
--
-- ─── F2 (HIGH): any signed-in user could attach a contract to someone else's team project ──
-- The RPC checked `p_client_id <> auth.uid()` and that the *role* belongs to the
-- team project — never that the team project belongs to the caller. It is
-- SECURITY DEFINER, so RLS does not protect it: another client could create a
-- contract (and a fake "You've been hired!" notification to an arbitrary
-- freelancer) on a stranger's team project. The guard was also NULL-unsafe
-- (`NULL <> uuid` is NULL, falsy) like the ones fixed in 20270119000016.
--
-- ─── F3 (HIGH): the hourly auto-release marked milestones paid but never paid ──
-- `auto_release_milestone` (the service-role cron path) calls `release_escrow`,
-- whose live definition had lost the service-role bypass that
-- 20261211000000 added — it now only checks `p_client_id IS DISTINCT FROM
-- auth.uid()`, and `auth.uid()` is NULL for the cron, so the call raised
-- 'Unauthorized'. `auto_release_milestone` catches that exception and returns
-- `escrow_released: false`, so production observably did: milestone flipped to
-- 'released', escrow left 'funded', freelancer wallet credited 0.00, and the
-- client's aggregate `escrow_balance` left holding phantom funds — phantom funds
-- that every other contract's release/refund then subtracts from with
-- GREATEST(..., 0). That is the one place a member's milestone outcome could
-- reach another member's accounting, and it is closed here.
--
-- ─── Flagged, deliberately NOT changed ────────────────────────────────────
-- `freeze_contract` / `unfreeze_contract` set `wallets.is_frozen` for BOTH
-- parties, which in a team project is the one shared client wallet; unfreezing
-- contract A therefore clears the flag a freeze on contract B owns. It is a real
-- cross-contract coupling, but `wallets.is_frozen` has **no readers** anywhere in
-- the app or edge code (only the generated types mention it), so there is no
-- behaviour to correct today — changing admin fraud-freeze semantics with zero
-- runtime effect is exactly the kind of "fix" that quietly alters intent. Report
-- §16.6 records the pattern for when something reads it.
--
-- Verification: the DDL/RPC changes are asserted here (catalog-level), and the
-- *functional* proof — hire through the real RPC, then dispute/refund/release
-- members independently and check every other member's escrow row, contract row
-- and wallet — runs against the deployed database via
-- `node scripts/e2e/pentest-privileges.mjs` (wired into backend-deploy.yml).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. F1 — a team contract has no client project row; allow that.
--    (Only permits NULLs: every non-team contract keeps its project_id, and
--    inner joins by project_id correctly skip team contracts.)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.contracts ALTER COLUMN project_id DROP NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. F2 — ownership + NULL-safe guard + one role = one contract.
--    Patched from the live definition (anchors must match verbatim, else this
--    migration aborts instead of silently changing nothing).
-- ───────────────────────────────────────────────────────────────────────────
DO $patch$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'create_team_role_contract';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'create_team_role_contract not found — cannot patch';
  END IF;

  IF v_src NOT LIKE '%Team project not found for this client%' THEN
    v_new := replace(
      v_src,
      '  -- Role must belong to this team project and be fillable',
      '  -- NULL-safe: an anonymous caller has no auth.uid(), and NULL <> uuid is' || chr(10) ||
      '  -- NULL (falsy), so a bare inequality never rejects them.' || chr(10) ||
      '  IF auth.uid() IS NULL THEN' || chr(10) ||
      '    RAISE EXCEPTION ''Unauthorized'';' || chr(10) ||
      '  END IF;' || chr(10) || chr(10) ||
      '  -- The team project must belong to the caller. This function is SECURITY' || chr(10) ||
      '  -- DEFINER, so RLS does not protect it: without this check any signed-in' || chr(10) ||
      '  -- user could attach a contract — and a fake "you''ve been hired"' || chr(10) ||
      '  -- notification — to another client''s team project.' || chr(10) ||
      '  IF NOT EXISTS (' || chr(10) ||
      '    SELECT 1 FROM public.team_projects' || chr(10) ||
      '     WHERE id = p_team_project_id AND client_id = p_client_id' || chr(10) ||
      '  ) THEN' || chr(10) ||
      '    RAISE EXCEPTION ''Team project not found for this client'';' || chr(10) ||
      '  END IF;' || chr(10) || chr(10) ||
      '  -- Role must belong to this team project and be fillable'
    );
    IF v_new = v_src THEN
      RAISE EXCEPTION 'create_team_role_contract auth anchor did not match';
    END IF;
    v_src := v_new;
  END IF;

  IF v_src NOT LIKE '%One role = one contract%' THEN
    v_new := replace(
      v_src,
      '  INSERT INTO public.escrow (contract_id, client_id, freelancer_id, amount, status)' || chr(10) ||
      '  VALUES (v_contract_id, p_client_id, p_freelancer_id, p_amount, ''pending'');',
      '  INSERT INTO public.escrow (contract_id, client_id, freelancer_id, amount, status)' || chr(10) ||
      '  VALUES (v_contract_id, p_client_id, p_freelancer_id, p_amount, ''pending'');' || chr(10) || chr(10) ||
      '  -- One role = one contract: the role stops being hireable. Without this the' || chr(10) ||
      '  -- same role could be hired repeatedly and a client would end up with two' || chr(10) ||
      '  -- contracts (two escrows) for one seat.' || chr(10) ||
      '  UPDATE public.team_project_roles' || chr(10) ||
      '     SET status = ''filled'', matched_freelancer_id = p_freelancer_id, updated_at = now()' || chr(10) ||
      '   WHERE id = p_team_project_role_id;'
    );
    IF v_new = v_src THEN
      RAISE EXCEPTION 'create_team_role_contract role-status anchor did not match';
    END IF;
    v_src := v_new;
  END IF;

  EXECUTE v_src;
END
$patch$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. F3 — restore the service-role path in release_escrow.
--    The JWT role claim is set by Supabase Auth only, so a browser cannot forge
--    it; this is the same guard 20261211000000 used before the function was
--    re-created without it.
-- ───────────────────────────────────────────────────────────────────────────
DO $patch2$
DECLARE
  v_src text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'release_escrow';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'release_escrow not found — cannot patch';
  END IF;

  IF v_src LIKE '%request.jwt.claim.role%' THEN
    RETURN; -- already patched (idempotent re-run)
  END IF;

  v_new := replace(
    v_src,
    '  IF p_client_id IS DISTINCT FROM auth.uid() THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Unauthorized'';' || chr(10) ||
    '  END IF;',
    '  -- Service-role callers (the hourly milestone-auto-release cron and admin' || chr(10) ||
    '  -- paths) have no auth.uid(); the JWT role claim is unforgeable from a' || chr(10) ||
    '  -- browser. Without this branch the cron marked milestones released and' || chr(10) ||
    '  -- never paid the freelancer (escrow left funded, wallet credited 0.00).' || chr(10) ||
    '  IF COALESCE(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''' || chr(10) ||
    '     AND p_client_id IS DISTINCT FROM auth.uid() THEN' || chr(10) ||
    '    RAISE EXCEPTION ''Unauthorized'';' || chr(10) ||
    '  END IF;'
  );

  IF v_new = v_src THEN
    RAISE EXCEPTION 'release_escrow auth anchor did not match';
  END IF;

  EXECUTE v_new;
END
$patch2$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Assertions (catalog-level; the functional proof is the runtime probe).
-- ───────────────────────────────────────────────────────────────────────────
DO $assert$
DECLARE
  v_nullable text;
BEGIN
  -- 4a. F1 — a team-shaped contract can hold a NULL project_id.
  SELECT is_nullable INTO v_nullable
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'contracts' AND column_name = 'project_id';
  IF v_nullable <> 'YES' THEN
    RAISE EXCEPTION 'contracts.project_id is still NOT NULL — team role contracts cannot be created';
  END IF;

  -- 4b. F2 — all three parts of the patch are present.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'create_team_role_contract'
       AND p.prosrc LIKE '%Team project not found for this client%'
       AND p.prosrc LIKE '%auth.uid() IS NULL%'
       AND p.prosrc LIKE '%One role = one contract%'
       AND p.prosrc LIKE '%''filled''%'
  ) THEN
    RAISE EXCEPTION 'create_team_role_contract is not fully patched';
  END IF;

  -- 4c. F3 — the service-role branch exists and the owner check still does.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'release_escrow'
       AND p.prosrc LIKE '%request.jwt.claim.role%'
       AND p.prosrc LIKE '%Unauthorized%'
       AND p.prosrc LIKE '%You do not own this contract%'
  ) THEN
    RAISE EXCEPTION 'release_escrow patch incomplete — the cron path or the owner check is missing';
  END IF;

  -- 4d. The team role status the new code writes is actually allowed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.team_project_roles'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%filled%'
  ) THEN
    RAISE EXCEPTION 'team_project_roles.status cannot hold ''filled''';
  END IF;
END
$assert$;
