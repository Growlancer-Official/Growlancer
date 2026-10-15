-- ═══════════════════════════════════════════════════════════════════════════════
-- FX rates table — server-side display currency conversion
--
-- ONLY the display layer converts INR → visitor currency. Settlement never
-- touches a rate. A rate missing for a currency means: show INR, clearly,
-- not a guess. Rate can be NULL when founder has not entered one yet.
--
-- Table shape:
--   base_currency text NOT NULL          — always 'INR' at first; opening the
--                                         door to multi-base later is trivial
--   target_currency text NOT NULL        — ISO 4217
--   rate numeric NOT NULL                — how many target_currency units = 1 INR
--   created_at / updated_at
--
-- Uniqueness: one row per (base, target) pair.
-- RLS:
--   - public SELECT: yes — the app needs to know the current rate client-side,
--     real time if you want (realtime subscription is optional, not added here)
--   - admin INSERT/UPDATE/DELETE only
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency text NOT NULL DEFAULT 'INR',
  target_currency text NOT NULL,
  rate numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (base_currency, target_currency)
);

COMMENT ON TABLE public.fx_rates IS
  'Exchange rates for display currency conversion only. Rates are set by admins; settlement never looks at these. Missing rate → show INR, never guess.';

COMMENT ON COLUMN public.fx_rates.rate IS
  'How many target_currency units equal ONE base_currency unit (INR at launch).';

ALTER TABLE public.fx_rates
  ADD CONSTRAINT fx_rates_base_currency_check CHECK (base_currency = 'INR');

ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

-- Everyone can read the current conversion table (needed client-side, real time).
DROP POLICY IF EXISTS "Anyone can read fx_rates" ON public.fx_rates;
CREATE POLICY "Anyone can read fx_rates"
  ON public.fx_rates
  FOR SELECT
  USING (true);

-- Only admins can manage rates.
DROP POLICY IF EXISTS "Admins manage fx_rates" ON public.fx_rates;
CREATE POLICY "Admins manage fx_rates"
  ON public.fx_rates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role = 'admin'
    )
  );

-- Seed baseline: INR → INR = 1. No other rates exist yet — founder sets them
-- when the feature goes live. We also leave the door for a future base change
-- but for now the CHECK locks base to INR.
INSERT INTO public.fx_rates (base_currency, target_currency, rate)
VALUES ('INR', 'INR', 1)
ON CONFLICT (base_currency, target_currency) DO NOTHING;

-- Realtime: optional; we do NOT add here so admin edits do not
-- instantly prop to every client (founder can enable later if desired).
-- For now, CurrencyContext polls + fresh loads get the latest.
