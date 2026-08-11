-- ═══════════════════════════════════════════════════════════════════════════
-- FREELANCER EXPERIENCE — DECIMAL YEARS SUPPORT
-- Migration 20261216000001
--
-- WHY: freelancer_profiles.experience was INTEGER (scale 0), so a freelancer
-- could never store "2.5 years" — decimals were truncated/errored. The UI now
-- accepts decimals (step 0.5) and validates 0–80.
--
-- FIX: widen the column to numeric(5,2) — up to 999.99 with two decimal
-- places — so decimal years store exactly (no silent rounding of e.g. 2.25).
-- Existing integer values cast cleanly.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.freelancer_profiles
  ALTER COLUMN experience TYPE numeric(5,2) USING experience::numeric(5,2);
