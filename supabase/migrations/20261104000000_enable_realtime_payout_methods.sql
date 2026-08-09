-- Enable realtime for payout_methods so the Wallet page reflects added/updated
-- payout methods instantly (what the freelancer set is what shows).
ALTER PUBLICATION supabase_realtime ADD TABLE public.payout_methods;
