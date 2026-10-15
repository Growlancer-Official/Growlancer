-- TRUTHFUL PLAN FEATURES — every advertised benefit must be one the product honours.
--
-- WHY (claim audit, 2026-10-13): every user-facing claim was cross-checked against
-- the implementation. `subscription_plans` is the pricing page's benefit list, and it
-- was advertising capabilities that do not exist — including on the plan that is
-- LIVE today (`premium_monthly`, Rs 299/month):
--
--   "AI writing ... — unlimited"       -> ai-writer caps Pro at PRO_DAILY_LIMIT = 100/day
--   "Advanced analytics"               -> the analytics dashboard is FREE for everyone,
--                                          so it is not a Premium unlock at all
--   "AI assistant & priority support"  -> support is the AI assistant plus a contact form
--   "Verified badge"                   -> the Verified badge comes from KYC, never a plan
--
-- The inactive rows were worse, because a single `is_active` flip would publish them:
--   "Priority AI project matching", "Featured profile placement"
--        -> pay-to-win ranking. Ranking and matching are 100% merit-based and a paid
--           flag must never influence them (non-negotiable). `is_pro` is in fact
--           never read by any score/ordering expression — so these strings promise
--           something the platform deliberately will not do.
--   "24/7 priority support"            -> no 24/7 human support exists.
--   "Up to $10,000/month withdrawal limit"
--        -> payouts are not enabled at all (RazorpayX Payouts returns 404), and the
--           platform is INR-first, so a USD ceiling is doubly wrong.
--
-- This migration makes the DATA truthful. It deliberately does NOT change prices,
-- billing intervals, trial lengths or which rows are active — those are the
-- founder's business decisions (tracked in docs/LAUNCH-READINESS.md). Prices shown:
-- the active freelancer plan stays Rs 299/month, exactly as documented.
--
-- NOTE on the pattern: the "unlimited writing" claim appears in BOTH word orders
-- ("Unlimited AI writing" and "AI writing (…) — unlimited"). A proximity window
-- around the word `writing` is the only shape that catches both, and it is applied
-- PER ARRAY ELEMENT (never to the concatenated list) so that a truthful
-- "Unlimited AI assistant messages" sitting next to an "AI writing …" entry can
-- never be mistaken for a false claim.
--
-- Guarded by src/test/truthfulPlanClaims.test.ts, which reads this file and the UI
-- surfaces together so the copy and the data cannot drift apart.

-- ── 1. The live plan: only benefits we actually deliver ──────────────────────
UPDATE public.subscription_plans
   SET features = jsonb_build_array(
         'Unlimited AI assistant messages',
         'AI writing — 100 generations per day (Free: 5 per day)',
         'Pro badge on your public profile',
         'Cancel anytime — no lock-in'
       ),
       description = 'AI assistant messages with no monthly cap, AI writing at 100 generations per day, and a Pro badge on your public profile.',
       updated_at = now()
 WHERE id = 'premium_monthly';

-- ── 2. Scrub every other row so a future flip cannot publish a false promise ──
-- Forbidden = claims the product cannot honour (false capability) OR that would
-- break the merit-based ranking promise (paid placement/priority).
DO $cleanup$
DECLARE
  -- Bare `priority` / `featured` / `boost` are forbidden outright: in a plan
  -- benefit list they can only ever mean paid placement, paid support priority or
  -- a ranking boost, none of which this platform does. This also catches the
  -- descriptions ("Unlock priority matching and unlimited AI messages") that a
  -- narrower "priority ai|project matching" pattern let through.
  v_forbidden text := '(unlimited[[:space:]]+(ai[[:space:]]+)?writing'
                   || '|writing[^;]{0,60}unlimited'
                   || '|advanced[[:space:]]+analytics'
                   || '|priority'
                   || '|featured'
                   || '|boost'
                   || '|24/7'
                   || '|verified[[:space:]]+(badge|expert)'
                   || '|top[[:space:]]+of[[:space:]]+(search|results|client)'
                   || '|withdrawal[[:space:]]+limit'
                   || '|\$[0-9])';
  v_row record;
  v_kept jsonb;
  v_removed text[];
BEGIN
  FOR v_row IN
    SELECT id, features, description FROM public.subscription_plans
  LOOP
    -- Keep only the feature entries that carry no forbidden claim.
    v_kept := COALESCE((
      SELECT jsonb_agg(f)
        FROM jsonb_array_elements_text(COALESCE(v_row.features, '[]'::jsonb)) AS f
       WHERE f !~* v_forbidden
    ), '[]'::jsonb);

    IF v_kept IS DISTINCT FROM COALESCE(v_row.features, '[]'::jsonb) THEN
      UPDATE public.subscription_plans SET features = v_kept, updated_at = now()
       WHERE id = v_row.id;
    END IF;

    -- A description that still advertises a false/paid-ranking claim is replaced
    -- with neutral, verifiable wording rather than left misleading.
    IF COALESCE(v_row.description, '') ~* v_forbidden THEN
      UPDATE public.subscription_plans
         SET description = 'AI assistant and AI writing tools for freelancers.',
             updated_at = now()
       WHERE id = v_row.id;
    END IF;
  END LOOP;

  -- Client AI is FREE FOR LIFETIME and must never be sold (business rule). A plan
  -- row advertising a message allowance for clients is the shape of a future
  -- paywall, so it is replaced with the promise the product actually keeps.
  UPDATE public.subscription_plans
     SET features = jsonb_build_array(
           'AI assistant — free for life (fair-use limits)',
           'AI-powered freelancer matching — free for life',
           'No paywall on client AI features'
         ),
         description = 'Client AI tools are free for life — matching, the AI assistant and AI writing for project posts.',
         updated_at = now()
   WHERE id = 'client_free';

  SELECT array_agg(DISTINCT m[1])
    INTO v_removed
    FROM public.subscription_plans p,
         LATERAL regexp_matches(
           array_to_string(
             ARRAY(SELECT jsonb_array_elements_text(COALESCE(p.features, '[]'::jsonb)))
             || ARRAY[COALESCE(p.description, '')],
             ' '
           ),
           v_forbidden, 'gi'
         ) AS m;

  RAISE NOTICE 'plan claims removed: %', COALESCE(array_to_string(v_removed, ', '), '(none)');
END
$cleanup$;

-- ── 3. Fail closed: no false or pay-to-win claim may survive ─────────────────
-- Checked PER ARRAY ELEMENT (and per description) so the error names the exact
-- offending row + string, and so a truthful neighbour entry cannot be blamed.
DO $assert$
DECLARE
  v_forbidden text := '(unlimited[[:space:]]+(ai[[:space:]]+)?writing'
                   || '|writing[^;]{0,60}unlimited'
                   || '|advanced[[:space:]]+analytics'
                   || '|priority'
                   || '|featured'
                   || '|boost'
                   || '|24/7'
                   || '|verified[[:space:]]+(badge|expert)'
                   || '|top[[:space:]]+of[[:space:]]+(search|results|client)'
                   || '|withdrawal[[:space:]]+limit'
                   || '|\$[0-9])';
  v_row record;
  v_feature text;
  v_bad text[] := '{}';
  v_active_freelancer int;
BEGIN
  FOR v_row IN SELECT id, features, description FROM public.subscription_plans LOOP
    FOR v_feature IN
      SELECT jsonb_array_elements_text(COALESCE(v_row.features, '[]'::jsonb))
    LOOP
      IF v_feature ~* v_forbidden THEN
        v_bad := v_bad || (v_row.id || ': ' || v_feature);
      END IF;
    END LOOP;

    IF COALESCE(v_row.description, '') ~* v_forbidden THEN
      v_bad := v_bad || (v_row.id || ' (description): ' || COALESCE(v_row.description, ''));
    END IF;
  END LOOP;

  IF array_length(v_bad, 1) > 0 THEN
    RAISE EXCEPTION 'false/pay-to-win plan claims still present: %', array_to_string(v_bad, ' | ');
  END IF;

  -- The documented model is ONE paid freelancer plan at Rs 299/month — assert we did
  -- not (and nothing else did) activate a second tier or a yearly variant. The free
  -- tier is a separate, correctly-active row, so only price > 0 plans are counted
  -- here (counting every active freelancer row is what the first dry run flagged).
  SELECT count(*) INTO v_active_freelancer
    FROM public.subscription_plans
   WHERE role = 'freelancer' AND is_active = true AND price > 0;

  IF v_active_freelancer <> 1 THEN
    RAISE EXCEPTION 'expected exactly 1 active PAID freelancer plan, found %', v_active_freelancer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_plans
     WHERE role = 'freelancer' AND is_active = true
       AND price = 299 AND interval = 'month'
  ) THEN
    RAISE EXCEPTION 'the active freelancer plan must stay Rs 299/month';
  END IF;

  -- The live plan must actually advertise the real writing cap, not "unlimited".
  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_plans
     WHERE id = 'premium_monthly'
       AND array_to_string(
             ARRAY(SELECT jsonb_array_elements_text(features)), ' ')
           ILIKE '%100 generations per day%'
  ) THEN
    RAISE EXCEPTION 'active plan must state the real AI writing cap (100/day)';
  END IF;

  -- Client AI must remain unpriced and unlimited-by-design for clients.
  IF NOT EXISTS (
    SELECT 1 FROM public.subscription_plans
     WHERE id = 'client_free' AND price = 0
  ) THEN
    RAISE EXCEPTION 'client_free must stay free (client AI is free for life)';
  END IF;

  -- Client AI is free for life, so no ACTIVE paid client plan may ever exist.
  -- Inactive legacy rows are left in place (activating or deleting them is the
  -- founder's business call), but the flip that would publish a client paywall
  -- fails the deploy right here.
  IF EXISTS (
    SELECT 1 FROM public.subscription_plans
     WHERE role = 'client' AND is_active = true AND price > 0
  ) THEN
    RAISE EXCEPTION 'no active paid CLIENT plan may exist — client AI is free for life';
  END IF;
END
$assert$;
