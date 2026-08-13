-- ============================================================================
-- Name change lock (anti-impersonation / security)
-- ----------------------------------------------------------------------------
-- Adds profiles.name_changed_at and auto-stamps it whenever the display name
-- actually changes. The app enforces a 30-day lock using this timestamp, so
-- users are told at onboarding to choose their name carefully.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_changed_at timestamptz;

-- Backfill existing profiles so nobody is locked out by the new rule.
UPDATE public.profiles
   SET name_changed_at = NOW() - INTERVAL '31 days'
 WHERE name_changed_at IS NULL;

-- Auto-track: stamp NOW() whenever the name is actually changed.
CREATE OR REPLACE FUNCTION public.track_name_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    NEW.name_changed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_name_change ON public.profiles;
CREATE TRIGGER trg_track_name_change
  BEFORE UPDATE OF name ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.track_name_change();
