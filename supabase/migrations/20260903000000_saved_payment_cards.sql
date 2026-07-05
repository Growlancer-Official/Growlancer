-- Saved Payment Cards (Razorpay Tokenization)
-- Stores Razorpay card tokens for one-click future payments
-- Each record = a card saved by a user via Razorpay Checkout

CREATE TABLE IF NOT EXISTS public.saved_payment_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  razorpay_customer_id TEXT,
  card_id TEXT NOT NULL,              -- Razorpay card token (e.g., "card_Lh...")
  card_type TEXT,                     -- "credit" | "debit" | "prepaid"
  card_network TEXT,                  -- "Visa" | "Mastercard" | "RuPay" | "Amex"
  card_last_four TEXT NOT NULL,
  card_expiry_month TEXT,
  card_expiry_year TEXT,
  card_holder_name TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  used_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, card_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_cards_user ON public.saved_payment_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_cards_default ON public.saved_payment_cards(user_id, is_default) WHERE is_default = true;

-- RLS
ALTER TABLE public.saved_payment_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own saved cards"
  ON public.saved_payment_cards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved cards"
  ON public.saved_payment_cards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved cards"
  ON public.saved_payment_cards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved cards"
  ON public.saved_payment_cards FOR DELETE
  USING (auth.uid() = user_id);

-- Grant access
GRANT ALL ON public.saved_payment_cards TO authenticated;
GRANT ALL ON public.saved_payment_cards TO service_role;
