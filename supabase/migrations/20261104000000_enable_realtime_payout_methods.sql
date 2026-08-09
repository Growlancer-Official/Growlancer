-- Enable realtime for payout_methods so the Wallet page reflects added/updated
-- payout methods instantly (what the freelancer set is what shows).
-- Guarded so it is idempotent (payout_methods may already be published).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payout_methods'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_methods;
  END IF;
END $$;;
