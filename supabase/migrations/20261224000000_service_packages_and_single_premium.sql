-- ═══════════════════════════════════════════════════════════════════════════
-- GROWLANCER — SERVICE PACKAGING + SINGLE PREMIUM PLAN + ESCROW WIRING
-- Model (final, agreed):
--   • Every service = 3 package tiers (Basic/Standard/Premium) — free for all
--     freelancers, NO subscription gate on packaging or visibility.
--   • Platform commission = flat 5%, paid by the CLIENT on top of the package
--     total. No other platform fee.
--   • Freelancer Premium = ₹299/month, single flat plan, purely optional
--     (AI + productivity tools only — never ranking/visibility/packaging).
--   • Payout processing 2% (Razorpay/PayPal actual cost) is separate & shown
--     separately at withdrawal.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. SERVICES — package tiers + addons + milestone mode
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS packages JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS addons JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS milestone_mode TEXT NOT NULL DEFAULT 'single'
    CHECK (milestone_mode IN ('single', 'multi'));

COMMENT ON COLUMN public.services.packages IS
  'Package tiers. Shape: [{"tier":"basic"|"standard"|"premium","title","price","delivery_days","revisions","deliverables":string[]}] — price in INR, server-authoritative for escrow.';
COMMENT ON COLUMN public.services.addons IS
  'Optional paid extras. Shape: [{"id","title","price","type":"extra_revision"|"fast_delivery"|"extra"}] — prices server-authoritative.';
COMMENT ON COLUMN public.services.milestone_mode IS
  'single = one combined milestone (default); multi = one milestone per deliverable in the selected package.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. CREATE SERVICE PURCHASE CONTRACT — SECURITY DEFINER
--    Server-side price authority: the client only sends the TIER NAME and
--    ADDON IDS. Prices are read from the services row — a client can never
--    pay a price the freelancer did not publish.
-- ───────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_service_purchase_contract(uuid, uuid, text, text[]);

CREATE OR REPLACE FUNCTION public.create_service_purchase_contract(
  p_service_id uuid,
  p_client_id uuid,
  p_tier text,
  p_addon_ids text[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service RECORD;
  v_pkg JSONB;
  v_addon JSONB;
  v_pkg_price NUMERIC := 0;
  v_addons_total NUMERIC := 0;
  v_amount NUMERIC := 0;
  v_fee NUMERIC := 0;
  v_contract_id uuid;
  v_workspace_id uuid;
  v_milestones JSONB := '[]'::jsonb;
  v_title TEXT;
  v_delivery_days INT;
  v_revisions INT;
  v_deliverables JSONB;
  v_milestone JSONB;
  v_i INT;
  v_elem JSONB;
  v_addon_row JSONB;
BEGIN
  -- Owner/validation: caller must be the client (checked by edge fn) — here we
  -- still verify the service exists, is active and belongs to a real freelancer.
  SELECT s.*, p.name AS freelancer_name INTO v_service
  FROM public.services s
  JOIN public.profiles p ON p.id = s.freelancer_id AND p.deleted_at IS NULL
  WHERE s.id = p_service_id AND s.active = true;

  IF v_service.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service not found or inactive');
  END IF;

  -- Tier must be one of the published packages (server-side price authority).
  IF v_service.packages IS NULL OR jsonb_typeof(v_service.packages) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Service has no published packages');
  END IF;

  SELECT * INTO v_pkg FROM jsonb_array_elements(v_service.packages) AS pkg
  WHERE pkg->>'tier' = p_tier;

  IF v_pkg IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', format('Package tier "%s" not found on this service', p_tier));
  END IF;

  v_pkg_price := COALESCE((v_pkg->>'price')::NUMERIC, 0);
  IF v_pkg_price <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid package price');
  END IF;
  v_title := COALESCE(v_pkg->>'title', initcap(p_tier));
  v_delivery_days := COALESCE((v_pkg->>'delivery_days')::INT, 7);
  v_revisions := COALESCE((v_pkg->>'revisions')::INT, 0);
  v_deliverables := COALESCE(v_pkg->'deliverables', '[]'::jsonb);

  -- Addons — only published addon IDs, prices read from the service row.
  IF p_addon_ids IS NOT NULL AND array_length(p_addon_ids, 1) > 0 THEN
    IF v_service.addons IS NULL OR jsonb_typeof(v_service.addons) <> 'array' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Requested addons but service has none');
    END IF;
    FOR v_i IN 1 .. array_length(p_addon_ids, 1) LOOP
      SELECT * INTO v_addon_row FROM jsonb_array_elements(v_service.addons) AS a
      WHERE a->>'id' = p_addon_ids[v_i];
      IF v_addon_row IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', format('Addon "%s" not found on this service', p_addon_ids[v_i]));
      END IF;
      v_addons_total := v_addons_total + COALESCE((v_addon_row->>'price')::NUMERIC, 0);
    END LOOP;
  END IF;

  v_amount := v_pkg_price + v_addons_total;
  v_fee := round(v_amount * 0.05, 2); -- flat 5% platform fee, client pays on top

  -- Milestones: single (one combined) or multi (one per deliverable).
  IF v_service.milestone_mode = 'multi' AND jsonb_array_length(v_deliverables) > 0 THEN
    v_milestones := '[]'::jsonb;
    FOR v_i IN 0 .. jsonb_array_length(v_deliverables) - 1 LOOP
      v_elem := v_deliverables->v_i;
      v_milestone := jsonb_build_object(
        'title', COALESCE(v_elem->>'title', v_elem->>'text', format('Deliverable %s', v_i + 1)),
        'amount', round(v_amount / (jsonb_array_length(v_deliverables))::NUMERIC, 2),
        'status', 'pending',
        'delivered_at', NULL,
        'auto_release_hours', 72
      );
      v_milestones := v_milestones || jsonb_build_array(v_milestone);
    END LOOP;
    -- Put rounding remainder on the last milestone so the total matches exactly.
    v_milestones := jsonb_set(
      v_milestones,
      ARRAY[(jsonb_array_length(v_milestones) - 1)::TEXT, 'amount'],
      to_jsonb(v_amount - round(v_amount / (jsonb_array_length(v_milestones))::NUMERIC, 2) * (jsonb_array_length(v_milestones) - 1))
    );
  ELSE
    v_milestones := jsonb_build_array(jsonb_build_object(
      'title', v_title,
      'amount', v_amount,
      'status', 'pending',
      'delivered_at', NULL,
      'auto_release_hours', 72
    ));
  END IF;

  -- Create the contract (escrow-protected; funded after payment capture).
  INSERT INTO public.contracts (
    freelancer_id, client_id, amount, platform_fee, freelancer_amount,
    status, milestones, start_date
  ) VALUES (
    v_service.freelancer_id, p_client_id, v_amount, v_fee, v_amount,
    'pending', v_milestones, current_date
  )
  RETURNING id INTO v_contract_id;

  -- Workspace + members (mirrors create_contract_with_escrow).
  INSERT INTO public.workspaces(contract_id, client_id, lead_freelancer_id, status)
  VALUES (v_contract_id, p_client_id, v_service.freelancer_id, 'active')
  ON CONFLICT (contract_id) DO UPDATE SET status = 'active', updated_at = now()
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_members(workspace_id, user_id, role) VALUES
    (v_workspace_id, p_client_id, 'client'),
    (v_workspace_id, v_service.freelancer_id, 'lead')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;

  -- Notify both parties (real time).
  INSERT INTO public.notifications (user_id, type, title, message, link) VALUES
    (p_client_id, 'contract', 'Contract created',
     'Your order for "' || v_service.title || '" (' || v_title || ') is ready. Fund the escrow to start.', '/client/contracts'),
    (v_service.freelancer_id, 'contract', 'New order received',
     'A client ordered "' || v_service.title || '" (' || v_title || ', ₹' || round(v_amount)::text || '). Fund it in the workspace to begin.', '/dashboard/contracts');

  RETURN jsonb_build_object(
    'success', true,
    'contract_id', v_contract_id,
    'workspace_id', v_workspace_id,
    'amount', v_amount,
    'platform_fee', v_fee,
    'client_total', round((v_amount + v_fee)::NUMERIC, 2),
    'milestones', v_milestones
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_service_purchase_contract(uuid, uuid, text, text[]) TO authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. SUBSCRIPTION PLANS — single flat ₹299/month Premium plan
--    Deactivate every legacy tier (pro_starter_*, pro_yearly, ai_*, client_pro_*)
--    and upsert the one plan the app now sells.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.subscription_plans (id, name, description, price, interval, role, features, is_active, ai_messages_limit, ai_priority, trial_days)
VALUES
  ('premium_monthly', 'Premium', 'AI writing, AI assistant, profile optimization & advanced analytics — ₹299/month, cancel anytime', 299, 'month', 'freelancer',
   '["AI writing (titles, descriptions, cover letters) — unlimited","AI assistant & priority support","AI profile optimization","Advanced analytics","Verified badge","Cancel anytime — no lock-in"]'::jsonb,
   true, 1000, true, 0)
ON CONFLICT (id) DO UPDATE SET
  price = 299, interval = 'month', role = 'freelancer',
  features = EXCLUDED.features, is_active = true, ai_messages_limit = 1000, ai_priority = true;

-- Deactivate all legacy paid plans — the ONLY paid plan is premium_monthly (₹299).
UPDATE public.subscription_plans SET is_active = false
WHERE id IN ('pro_monthly', 'pro_yearly', 'ai_monthly', 'ai_yearly',
             'pro_starter_monthly', 'pro_starter_yearly',
             'client_pro_monthly', 'client_pro_yearly');

-- Free plans stay active (₹0) for both roles.
UPDATE public.subscription_plans SET is_active = true WHERE price = 0;
