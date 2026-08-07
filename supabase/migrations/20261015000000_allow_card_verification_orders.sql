-- Allow the ₹1 card-verification order type used by Settings → Billing → Add Card.
-- Without this, inserting order_type 'card_verification' violates the CHECK
-- constraint and every Add Card attempt fails server-side with a 400 error
-- (the edge function's whitelist was updated but the DB constraint was not —
-- this is exactly the class of hidden frontend/DB mismatch that silently
-- breaks features in production).
ALTER TABLE public.razorpay_orders
  DROP CONSTRAINT IF EXISTS razorpay_orders_order_type_check;

ALTER TABLE public.razorpay_orders
  ADD CONSTRAINT razorpay_orders_order_type_check
  CHECK (order_type = ANY (ARRAY['contract_escrow', 'subscription', 'service_purchase', 'card_verification']));
