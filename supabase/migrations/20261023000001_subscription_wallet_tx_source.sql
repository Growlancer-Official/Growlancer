-- Allow 'subscription' as a transactions.source value so wallet-paid
-- Pro subscriptions can be recorded in the financial ledger.
ALTER TABLE public.transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_source_check
  CHECK (source = ANY (ARRAY['escrow'::text, 'withdrawal'::text, 'deposit'::text, 'refund'::text, 'platform_fee'::text, 'subscription'::text]));
