-- ═══════════════════════════════════════════════════════════════
-- Service Tips + Negotiable Price + Offers (2026-08-12)
--
-- 1. services: two new flags the freelancer controls from Create/Edit
--    - accepts_tips  : clients can add an optional tip at checkout
--    - negotiable    : clients can make a price offer the freelancer
--                       accepts or declines (professional negotiation,
--                       no silent price changes)
-- 2. service_offers : negotiation records (client → freelancer)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS accepts_tips BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS negotiable BOOLEAN NOT NULL DEFAULT false;

-- ── service_offers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  freelancer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS service_offers_freelancer_idx
  ON public.service_offers (freelancer_id, status);
CREATE INDEX IF NOT EXISTS service_offers_service_idx
  ON public.service_offers (service_id, status);
CREATE INDEX IF NOT EXISTS service_offers_client_idx
  ON public.service_offers (client_id, status);

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE public.service_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_offers_select_participants" ON public.service_offers;
-- Clients see their own offers; the freelancer sees offers on their own
-- services; admins see everything.
CREATE POLICY "service_offers_select_participants" ON public.service_offers
  FOR SELECT TO authenticated
  USING (
    auth.uid() = client_id
    OR auth.uid() = freelancer_id
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

DROP POLICY IF EXISTS "service_offers_insert_client" ON public.service_offers;
-- Only the client can create an offer, and only on their own behalf.
CREATE POLICY "service_offers_insert_client" ON public.service_offers
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = client_id
    AND EXISTS (
      SELECT 1 FROM public.services
      WHERE id = service_id
        AND services.freelancer_id = freelancer_id
    )
  );

DROP POLICY IF EXISTS "service_offers_update_freelancer_or_client" ON public.service_offers;
DROP POLICY IF EXISTS "service_offers_update_freelancer" ON public.service_offers;
DROP POLICY IF EXISTS "service_offers_update_client_pending" ON public.service_offers;

-- The freelancer (owner of the service) can accept/decline — and only they
-- may move an offer out of 'pending'.
CREATE POLICY "service_offers_update_freelancer" ON public.service_offers
  FOR UPDATE TO authenticated
  USING (auth.uid() = freelancer_id)
  WITH CHECK (auth.uid() = freelancer_id);

-- The client may ONLY edit/withdraw their own offer while it is still
-- pending (edit the amount/message before the freelancer decides). Once the
-- freelancer has accepted or declined, the agreed amount is frozen — a
-- client can never rewrite an accepted price before paying (the razorpay
-- function reads the amount server-side from this row).
CREATE POLICY "service_offers_update_client_pending" ON public.service_offers
  FOR UPDATE TO authenticated
  USING (auth.uid() = client_id AND status = 'pending')
  WITH CHECK (auth.uid() = client_id AND status = 'pending');

DROP POLICY IF EXISTS "service_offers_delete_own_pending" ON public.service_offers;
-- Client may delete only their own pending offer (keeps history tidy).
CREATE POLICY "service_offers_delete_own_pending" ON public.service_offers
  FOR DELETE TO authenticated
  USING (auth.uid() = client_id AND status = 'pending');

-- ── Realtime ───────────────────────────────────────────────────
-- Live negotiation: when a client submits an offer the freelancer's
-- Services dashboard updates instantly; when the freelancer accepts,
-- the client's service page updates instantly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_offers'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_offers;
  END IF;
END $$;

-- ── In-app notifications via SECURITY DEFINER trigger ──────────
-- Client-side notification inserts would fail RLS (notifications RLS only
-- allows user_id = auth.uid()). The trigger runs as the table owner, so
-- both parties always get their real-time in-app notification.
-- ⛔ Freeze guard (defense-in-depth): amount can never change once the offer
-- is out of 'pending' — even by the freelancer or a service-role mistake.
CREATE OR REPLACE FUNCTION public.service_offers_freeze_amount_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.amount IS DISTINCT FROM OLD.amount AND OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'Offer amount is frozen after the freelancer responded';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_offers_freeze_amount_trigger ON public.service_offers;
CREATE TRIGGER service_offers_freeze_amount_trigger
  BEFORE UPDATE OF amount ON public.service_offers
  FOR EACH ROW EXECUTE FUNCTION public.service_offers_freeze_amount_fn();

CREATE OR REPLACE FUNCTION public.service_offers_notify_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_service_title TEXT;
  v_client_name TEXT;
BEGIN
  SELECT s.title INTO v_service_title FROM public.services s WHERE s.id = NEW.service_id;
  SELECT p.name INTO v_client_name FROM public.profiles p WHERE p.id = NEW.client_id;

  IF TG_OP = 'INSERT' THEN
    -- Client submitted an offer → notify the freelancer
    INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
    VALUES (
      NEW.freelancer_id,
      'offer',
      'New price offer 💬',
      COALESCE(v_client_name, 'A client') || ' offered ₹' || to_char(NEW.amount, 'FM999G999G999') ||
        ' on "' || COALESCE(v_service_title, 'your service') || '". Review and accept or decline in real time.',
      '/dashboard/services',
      jsonb_build_object('offer_id', NEW.id, 'service_id', NEW.service_id)
    );
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' THEN
      -- Freelancer accepted → notify the client
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (
        NEW.client_id,
        'offer',
        'Offer accepted 🎉',
        'Your offer of ₹' || to_char(NEW.amount, 'FM999G999G999') ||
          ' on "' || COALESCE(v_service_title, 'the service') || '" was accepted. You can now order at the agreed price.',
        '/services/' || NEW.service_id,
        jsonb_build_object('offer_id', NEW.id, 'service_id', NEW.service_id)
      );
    ELSIF NEW.status = 'declined' THEN
      -- Freelancer declined → notify the client
      INSERT INTO public.notifications (user_id, type, title, message, action_url, metadata)
      VALUES (
        NEW.client_id,
        'offer',
        'Offer declined',
        'Your offer on "' || COALESCE(v_service_title, 'the service') || '" was declined. You can still order at the listed price.',
        '/services/' || NEW.service_id,
        jsonb_build_object('offer_id', NEW.id, 'service_id', NEW.service_id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_offers_notify_trigger ON public.service_offers;
CREATE TRIGGER service_offers_notify_trigger
  AFTER INSERT OR UPDATE OF status ON public.service_offers
  FOR EACH ROW EXECUTE FUNCTION public.service_offers_notify_fn();
