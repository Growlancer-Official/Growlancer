-- ═══════════════════════════════════════════════════════════════════════════════
-- INR currency ecosystem + payout methods + waitlist countries
-- 1) Subscription plans → INR prices (affordable), currency column
-- 2) payout_methods → allow UPI type (RazorpayX INR); PayPal stays (Coming Soon UI)
-- 3) countries table (all countries, public read) for waitlist dropdown
-- 4) join_waitlist RPC → name param
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. SUBSCRIPTION PLANS → INR ──────────────────────────────────────────────
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

-- Affordable INR pricing (India-first). Free stays ₹0. Trial days unchanged
-- (freelancer 14 / client 7 — already set in 20260616).
UPDATE public.subscription_plans SET price = 299.00,  currency = 'INR' WHERE id = 'pro_starter_monthly';
UPDATE public.subscription_plans SET price = 499.00,  currency = 'INR' WHERE id = 'pro_monthly';
UPDATE public.subscription_plans SET price = 2999.00, currency = 'INR' WHERE id = 'pro_starter_yearly';
UPDATE public.subscription_plans SET price = 4999.00, currency = 'INR' WHERE id = 'pro_yearly';
UPDATE public.subscription_plans SET price = 499.00,  currency = 'INR' WHERE id = 'client_pro_monthly';
UPDATE public.subscription_plans SET price = 4999.00, currency = 'INR' WHERE id = 'client_pro_yearly';
UPDATE public.subscription_plans SET price = 0,       currency = 'INR' WHERE id IN ('free', 'client_free');

-- ─── 2. PAYOUT METHODS → allow UPI (RazorpayX INR) ─────────────────────────────
-- Old constraint allowed ('paypal','bank','crypto'). Add 'upi'. Stripe never
-- existed in production; frontend option removed completely.
ALTER TABLE public.payout_methods DROP CONSTRAINT IF EXISTS payout_methods_type_check;

ALTER TABLE public.payout_methods
  ADD CONSTRAINT payout_methods_type_check
  CHECK (type IN ('paypal', 'bank', 'crypto', 'upi'));

-- ─── 3. COUNTRIES TABLE (all countries for waitlist + future country features) ─
CREATE TABLE IF NOT EXISTS public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.countries IS
  'All countries — powers the waitlist country dropdown and future country features. Public read, admin manage.';

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read countries" ON public.countries;
CREATE POLICY "Anyone can read countries"
  ON public.countries FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins can manage countries" ON public.countries;
CREATE POLICY "Admins can manage countries"
  ON public.countries FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
  );

-- Seed all countries (ISO 3166-1)
INSERT INTO public.countries (name, code) VALUES
  ('Afghanistan','AF'),('Albania','AL'),('Algeria','DZ'),('Andorra','AD'),('Angola','AO'),
  ('Antigua and Barbuda','AG'),('Argentina','AR'),('Armenia','AM'),('Australia','AU'),('Austria','AT'),
  ('Azerbaijan','AZ'),('Bahamas','BS'),('Bahrain','BH'),('Bangladesh','BD'),('Barbados','BB'),
  ('Belarus','BY'),('Belgium','BE'),('Belize','BZ'),('Benin','BJ'),('Bhutan','BT'),
  ('Bolivia','BO'),('Bosnia and Herzegovina','BA'),('Botswana','BW'),('Brazil','BR'),('Brunei','BN'),
  ('Bulgaria','BG'),('Burkina Faso','BF'),('Burundi','BI'),('Cabo Verde','CV'),('Cambodia','KH'),
  ('Cameroon','CM'),('Canada','CA'),('Central African Republic','CF'),('Chad','TD'),('Chile','CL'),
  ('China','CN'),('Colombia','CO'),('Comoros','KM'),('Congo (DRC)','CD'),('Congo (Republic)','CG'),
  ('Costa Rica','CR'),('Cote d''Ivoire','CI'),('Croatia','HR'),('Cuba','CU'),('Cyprus','CY'),
  ('Czech Republic','CZ'),('Denmark','DK'),('Djibouti','DJ'),('Dominica','DM'),('Dominican Republic','DO'),
  ('Ecuador','EC'),('Egypt','EG'),('El Salvador','SV'),('Equatorial Guinea','GQ'),('Eritrea','ER'),
  ('Estonia','EE'),('Eswatini','SZ'),('Ethiopia','ET'),('Fiji','FJ'),('Finland','FI'),
  ('France','FR'),('Gabon','GA'),('Gambia','GM'),('Georgia','GE'),('Germany','DE'),
  ('Ghana','GH'),('Greece','GR'),('Grenada','GD'),('Guatemala','GT'),('Guinea','GN'),
  ('Guinea-Bissau','GW'),('Guyana','GY'),('Haiti','HT'),('Honduras','HN'),('Hungary','HU'),
  ('Iceland','IS'),('India','IN'),('Indonesia','ID'),('Iran','IR'),('Iraq','IQ'),
  ('Ireland','IE'),('Israel','IL'),('Italy','IT'),('Jamaica','JM'),('Japan','JP'),
  ('Jordan','JO'),('Kazakhstan','KZ'),('Kenya','KE'),('Kiribati','KI'),('Kosovo','XK'),
  ('Kuwait','KW'),('Kyrgyzstan','KG'),('Laos','LA'),('Latvia','LV'),('Lebanon','LB'),
  ('Lesotho','LS'),('Liberia','LR'),('Libya','LY'),('Liechtenstein','LI'),('Lithuania','LT'),
  ('Luxembourg','LU'),('Madagascar','MG'),('Malawi','MW'),('Malaysia','MY'),('Maldives','MV'),
  ('Mali','ML'),('Malta','MT'),('Marshall Islands','MH'),('Mauritania','MR'),('Mauritius','MU'),
  ('Mexico','MX'),('Micronesia','FM'),('Moldova','MD'),('Monaco','MC'),('Mongolia','MN'),
  ('Montenegro','ME'),('Morocco','MA'),('Mozambique','MZ'),('Myanmar','MM'),('Namibia','NA'),
  ('Nauru','NR'),('Nepal','NP'),('Netherlands','NL'),('New Zealand','NZ'),('Nicaragua','NI'),
  ('Niger','NE'),('Nigeria','NG'),('North Korea','KP'),('North Macedonia','MK'),('Norway','NO'),
  ('Oman','OM'),('Pakistan','PK'),('Palau','PW'),('Palestine','PS'),('Panama','PA'),
  ('Papua New Guinea','PG'),('Paraguay','PY'),('Peru','PE'),('Philippines','PH'),('Poland','PL'),
  ('Portugal','PT'),('Qatar','QA'),('Romania','RO'),('Russia','RU'),('Rwanda','RW'),
  ('Saint Kitts and Nevis','KN'),('Saint Lucia','LC'),('Saint Vincent and the Grenadines','VC'),
  ('Samoa','WS'),('San Marino','SM'),('Sao Tome and Principe','ST'),('Saudi Arabia','SA'),
  ('Senegal','SN'),('Serbia','RS'),('Seychelles','SC'),('Sierra Leone','SL'),('Singapore','SG'),
  ('Slovakia','SK'),('Slovenia','SI'),('Solomon Islands','SB'),('Somalia','SO'),('South Africa','ZA'),
  ('South Korea','KR'),('South Sudan','SS'),('Spain','ES'),('Sri Lanka','LK'),('Sudan','SD'),
  ('Suriname','SR'),('Sweden','SE'),('Switzerland','CH'),('Syria','SY'),('Taiwan','TW'),
  ('Tajikistan','TJ'),('Tanzania','TZ'),('Thailand','TH'),('Timor-Leste','TL'),('Togo','TG'),
  ('Tonga','TO'),('Trinidad and Tobago','TT'),('Tunisia','TN'),('Turkey','TR'),('Turkmenistan','TM'),
  ('Tuvalu','TV'),('Uganda','UG'),('Ukraine','UA'),('United Arab Emirates','AE'),('United Kingdom','GB'),
  ('United States','US'),('Uruguay','UY'),('Uzbekistan','UZ'),('Vanuatu','VU'),('Vatican City','VA'),
  ('Venezuela','VE'),('Vietnam','VN'),('Yemen','YE'),('Zambia','ZM'),('Zimbabwe','ZW')
ON CONFLICT (code) DO NOTHING;

-- ─── 4. JOIN_WAITLIST RPC → accept name ───────────────────────────────────────
DROP FUNCTION IF EXISTS public.join_waitlist(text, text, text, uuid);
CREATE OR REPLACE FUNCTION public.join_waitlist(
  p_email text,
  p_country text,
  p_signup_source text DEFAULT 'oauth',
  p_user_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id bigint;
  v_result jsonb;
BEGIN
  SELECT id INTO v_existing_id
  FROM public.waitlist
  WHERE email = p_email
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.waitlist
    SET
      country = COALESCE(p_country, country),
      signup_source = COALESCE(p_signup_source, signup_source),
      user_id = COALESCE(p_user_id, user_id),
      name = COALESCE(p_name, name),
      updated_at = now()
    WHERE id = v_existing_id
    RETURNING jsonb_build_object(
      'success', true,
      'waitlist_id', id,
      'already_exists', true
    ) INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Update failed'));
  END IF;

  INSERT INTO public.waitlist (email, name, country, signup_source, user_id)
  VALUES (p_email, p_name, p_country, p_signup_source, p_user_id)
  RETURNING jsonb_build_object(
    'success', true,
    'waitlist_id', id,
    'already_exists', false
  ) INTO v_result;

  RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Insert failed'));
END;
$$;

-- ─── 5. REALTIME for countries + waitlist (admin page live updates) ───────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'countries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.countries;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'waitlist'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.waitlist;
  END IF;
END;
$$;
