-- ═══════════════════════════════════════════════════════════════════════════
-- HOTFIX: reconcile subscriptions hardening with the LIVE schema
--
-- Three live-DB issues surfaced in E2E verification:
--   1. A client INSERT policy still exists on public.subscriptions (created
--      directly on the live DB under a different name than the one dropped in
--      20270102000000) — a browser INSERT of status='active' passes RLS and is
--      only stopped today by an unrelated profiles guard. The H1 free-Pro
--      bypass is therefore NOT closed on live: all client INSERT/DELETE
--      policies must be dropped regardless of name (creation goes through the
--      create_user_subscription RPC only).
--   2. The live table dropped the legacy columns end_date and auto_renew, but
--      the 20270102000000 client update guard still references NEW.end_date /
--      NEW.auto_renew → every browser UPDATE (including the legitimate cancel
--      toggle on cancel_at_period_end) aborts with 42703.
--   3. The migrations' table shape drifted from live. App code uses
--      subscription_end_date / expiry_date (live columns); nothing references
--      end_date / auto_renew anymore, so both schemas are aligned by dropping
--      them where they still exist.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Drop ALL client INSERT/DELETE policies on subscriptions (whatever their
--    names — live-only policies are not represented in this repo).
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'subscriptions'
      AND cmd IN ('INSERT', 'DELETE')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.subscriptions', pol.policyname);
  END LOOP;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Align table shape: drop the legacy columns (absent on the authoritative
--    live schema; no application or migration code references them).
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS end_date;
ALTER TABLE public.subscriptions DROP COLUMN IF EXISTS auto_renew;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Rewrite the client update guard without the removed columns. Browser
--    sessions may toggle cancel_at_period_end only; status/plan/dates/payment
--    fields stay server-authoritative. Server-side writers (no JWT) and our
--    SECURITY DEFINER RPCs (session GUC) are unaffected.
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_subscription_client_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Server-side writers (edge functions / cron / service role) have no user
  -- JWT → auth.uid() IS NULL → always allowed.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Our own SECURITY DEFINER RPCs (create_user_subscription,
  -- pay_subscription_with_wallet) mark the transaction with a session flag so
  -- their internal state transitions are allowed. No client-callable path can
  -- set this flag without running the RPC itself.
  IF current_setting('app.subscription_internal_write', true) = 'internal' THEN
    RETURN NEW;
  END IF;

  -- Otherwise: the browser may ONLY toggle cancel_at_period_end (cancel /
  -- renew). Any change to status / plan / dates / payment fields is rejected.
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
     OR NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.start_date IS DISTINCT FROM OLD.start_date
     OR NEW.subscription_start_date IS DISTINCT FROM OLD.subscription_start_date
     OR NEW.subscription_end_date IS DISTINCT FROM OLD.subscription_end_date
     OR NEW.expiry_date IS DISTINCT FROM OLD.expiry_date
     OR NEW.trial_start_date IS DISTINCT FROM OLD.trial_start_date
     OR NEW.trial_end_date IS DISTINCT FROM OLD.trial_end_date
     OR NEW.payment_provider IS DISTINCT FROM OLD.payment_provider
     OR NEW.payment_subscription_id IS DISTINCT FROM OLD.payment_subscription_id THEN
    RAISE EXCEPTION 'Subscription status and billing fields can only be changed by the server after payment';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_client_update_guard ON public.subscriptions;
CREATE TRIGGER trg_subscription_client_update_guard
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_subscription_client_update_guard();
