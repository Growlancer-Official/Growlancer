-- ============================================================
-- SERVICE EXTRA REVISION PRICING (2026-12-10)
--
-- Freelancers include a number of FREE revisions in the base
-- price (revisions column). Beyond that, clients may request
-- extra revisions, and the freelancer may charge per revision.
-- This column lets the freelancer publish that per-revision
-- price transparently on the service page.
-- ============================================================

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS extra_revision_price NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Existing services keep working with 0 = no extra charge configured.
