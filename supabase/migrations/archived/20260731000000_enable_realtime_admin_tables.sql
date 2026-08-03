-- Enable Supabase Realtime for admin dashboard tables
-- This ensures postgres_changes listeners work for live updates

DO $$
BEGIN
  -- internship_applications
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.internship_applications;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already member%' THEN NULL;
    ELSE RAISE;
    END IF;
END $$;

DO $$
BEGIN
  -- disputes (already partially enabled, ensure it's in publication)
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.disputes;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already member%' THEN NULL;
    ELSE RAISE;
    END IF;
END $$;

DO $$
BEGIN
  -- transactions (for AdminPaymentsPage real-time updates)
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already member%' THEN NULL;
    ELSE RAISE;
    END IF;
END $$;

DO $$
BEGIN
  -- profiles (already probably enabled, but ensure it)
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
  WHEN OTHERS THEN
    IF SQLERRM LIKE '%already member%' THEN NULL;
    ELSE RAISE;
    END IF;
END $$;
