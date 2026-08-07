-- Billing realtime: the client Settings → Billing tab shows saved cards live.
-- Without this publication entry, adding/removing a tokenized card only
-- appears after a manual refresh (same pattern as transactions/razorpay_orders,
-- which are already published).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'saved_payment_cards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.saved_payment_cards;
  END IF;
END $$;
