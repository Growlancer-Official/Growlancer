-- ═══════════════════════════════════════════════════════════════════════════
-- Email security + verification helpers
-- 1) Server-side disposable / temporary email block on auth.users INSERT —
--    users can no longer sign up with temp-mail domains to farm referral
--    rewards. The frontend already rejects these in real time; this makes it
--    impossible to bypass.
-- 2) public.is_email_confirmed(email) — used by the "I've verified, continue"
--    flow: the original signup tab has no session (confirmation happened in a
--    new tab), so it asks the DB whether the email is confirmed.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1) Disposable / temporary email domains ────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_disposable_email_domain(p_domain text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text := lower(btrim(p_domain));
BEGIN
  RETURN d IN (
    '0-mail.com','10minutemail.com','10minutemail.net','1secmail.com',
    'anonbox.net','anonemail.net','binkmail.com','bouncr.com','discard.email',
    'dispostable.com','dodgeit.com','dropmail.me','emailfake.com','emailias.com',
    'emailnator.com','emailondeck.com','emailtemp.net','e4ward.com',
    'fakeinbox.com','fake-mail.net','fakemail.net','getnada.com',
    'guerrillamail.com','guerrillamail.de','guerrillamail.net','guerrillamail.org',
    'guerrillamail.biz','guerrillamail.co.uk','inboxkitten.com','jetable.org',
    'mail7.io','mailcatch.com','maildrop.cc','maildu.de','mailinator.com',
    'mailinator.net','mailinator2.com','mailmetrash.com','mailnesia.com',
    'mailtemp.net','mail.tm','mintemail.com','moakt.com','mytrashmail.com',
    'nada.email','nightmail.com','obmails.com','rapidinbox.com','rppkn.com',
    'sharklasers.com','shitmail.org','spam4.me','spamgourmet.com','spammotel.com',
    'ssl-mail.com','suioe.com','temporarymail.com','tempail.com','tempinbox.com',
    'tempr.email','temp-mail.org','temp-mail.io','temp-mails.com',
    'tempmailaddress.com','tempmailer.com','tempmail.com','tempmail.net',
    'tempmailo.com','throwaway.email','throwawaymail.com','trashmail.com',
    'trashmail.de','yopmail.com','yopmail.fr','yopmail.net','yopmail.org'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.block_disposable_email_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text;
BEGIN
  v_domain := lower(split_part(coalesce(NEW.email, ''), '@', 2));
  IF v_domain <> '' AND public.is_disposable_email_domain(v_domain) THEN
    RAISE EXCEPTION 'This email format is not acceptable. Disposable or temporary email addresses are not allowed — please use a permanent email address.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_disposable_email_signup ON auth.users;
CREATE TRIGGER trg_block_disposable_email_signup
BEFORE INSERT
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.block_disposable_email_signup();

-- ── 2) is_email_confirmed(email) RPC ───────────────────────────────────────
-- SECURITY DEFINER so an unauthenticated tab can ask "is this email verified
-- yet?" without exposing anything other than the boolean (nonexistent and
-- unconfirmed both return false → no email enumeration).
CREATE OR REPLACE FUNCTION public.is_email_confirmed(p_email text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (email_confirmed_at IS NOT NULL)
       FROM auth.users
      WHERE lower(email) = lower(p_email)
      LIMIT 1),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_confirmed(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_email_confirmed(text) TO anon, authenticated;
