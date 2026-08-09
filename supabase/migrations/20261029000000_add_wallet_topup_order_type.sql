-- 20261029000000_add_wallet_topup_order_type.sql
-- Allow wallet_topup orders (client adds funds to their Growlancer wallet).
-- The razorpay edge function already accepts wallet_topup; the DB CHECK
-- constraint was never extended, so every top-up insert failed with
-- "violates check constraint razorpay_orders_order_type_check".

ALTER TABLE public.razorpay_orders
  DROP CONSTRAINT IF EXISTS razorpay_orders_order_type_check;

ALTER TABLE public.razorpay_orders
  ADD CONSTRAINT razorpay_orders_order_type_check
  CHECK (order_type = ANY (ARRAY[
    'contract_escrow'::text,
    'subscription'::text,
    'service_purchase'::text,
    'card_verification'::text,
    'wallet_topup'::text
  ]));
