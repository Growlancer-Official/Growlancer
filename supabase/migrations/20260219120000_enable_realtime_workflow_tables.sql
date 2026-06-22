-- Enable Supabase Realtime for core workflow tables so postgres_changes listeners
-- in the web app receive events. Safe to re-run: skips tables already in the publication
-- or missing from this database.
--
-- Apply with: supabase db push / SQL editor on your Supabase project.

DO $$
DECLARE
  tbl text;
  tbl_list text[] := ARRAY[
    'profiles',
    'freelancer_profiles',
    'client_profiles',
    'projects',
    'proposals',
    'contracts',
    'messages',
    'invites',
    'escrow',
    'transactions',
    'withdrawals',
    'project_matches',
    'ai_matches',
    'notifications',
    'contract_files',
    'referrals',
    'referral_stats',
    'subscriptions',
    'services',
    'reviews',
    'paypal_orders'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbl_list
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'realtime: table public.% does not exist, skipped', tbl;
      WHEN duplicate_object THEN
        RAISE NOTICE 'realtime: public.% already in supabase_realtime, skipped', tbl;
      WHEN OTHERS THEN
        IF SQLERRM LIKE '%already member of publication%' OR SQLERRM LIKE '%already in publication%' THEN
          RAISE NOTICE 'realtime: public.% publication member skip (%): %', tbl, SQLSTATE, SQLERRM;
        ELSE
          RAISE;
        END IF;
    END;
  END LOOP;
END $$;
