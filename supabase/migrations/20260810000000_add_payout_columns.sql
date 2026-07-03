-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Add payout provider columns to withdrawals table
-- Phase 9: Actual payout API integration (RazorpayX + PayPal Payouts)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Add columns for RazorpayX payout tracking
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS razorpay_payout_id text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS razorpay_fund_account_id text DEFAULT NULL;

COMMENT ON COLUMN public.withdrawals.razorpay_payout_id IS 'RazorpayX payout ID returned from POST /v1/payouts';
COMMENT ON COLUMN public.withdrawals.razorpay_fund_account_id IS 'RazorpayX fund account ID used for the payout';

-- Add payout_mode column (UPI, NEFT, IMPS for Razorpay; standard for PayPal)
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS payout_mode text DEFAULT NULL;

COMMENT ON COLUMN public.withdrawals.payout_mode IS 'Payout mode: UPI/NEFT/IMPS for RazorpayX, standard for PayPal';

-- Index for looking up withdrawals by provider payout ID
CREATE INDEX IF NOT EXISTS idx_withdrawals_razorpay_payout_id ON public.withdrawals(razorpay_payout_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_paypal_payout_id ON public.withdrawals(paypal_payout_id);
