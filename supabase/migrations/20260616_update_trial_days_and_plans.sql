-- Update subscription plan trial days:
-- Freelancer: 14-day free trial (industry standard for freelancer platforms)
-- Client: 7-day free trial (standard for hiring platforms)

-- Update freelancer plans to 14-day trial
UPDATE public.subscription_plans
SET trial_days = 14,
    description = '14-day free trial. Unlimited AI messages and priority matching.'
WHERE role = 'freelancer'
  AND price > 0
  AND trial_days = 7;

-- Update client plans to stay at 7-day trial
UPDATE public.subscription_plans
SET description = '7-day free trial. Find the best freelancers with AI-powered hiring.'
WHERE role = 'client'
  AND price > 0
  AND trial_days = 7;

-- Ensure the subscriptions table has realtime enabled for live updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public'
    AND tablename = 'subscriptions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.subscriptions;
  END IF;
END;
$$;

-- Add a policy so the subscription notification RPC can be called
CREATE OR REPLACE FUNCTION public.notify_subscription_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM pg_notify(
    'subscription_changes',
    json_build_object(
      'user_id', NEW.user_id,
      'status', NEW.status,
      'plan_id', NEW.plan_id
    )::text
  );
  RETURN NEW;
END;
$$;

-- Trigger to send realtime notification on subscription changes
DROP TRIGGER IF EXISTS trg_subscription_change_notify ON public.subscriptions;
CREATE TRIGGER trg_subscription_change_notify
  AFTER INSERT OR UPDATE OF status, plan_id, cancel_at_period_end
  ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_subscription_change();
