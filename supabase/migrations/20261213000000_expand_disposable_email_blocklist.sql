-- Expand the disposable / temporary email blocklist to the full curated
-- ~300-domain production list (mirrors src/lib/disposableEmails.ts) and add
-- subdomain-aware matching (foo.mailinator.com is blocked too).

CREATE OR REPLACE FUNCTION public.is_disposable_email_domain(p_domain text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d text := lower(btrim(p_domain));
  pos int;
  domains text[] := ARRAY[
    -- 10 Minute Mail family
    '10minutemail.com','10minutemail.net','10minutemail.org','10minutemail.info',
    '10minutemail.co.uk','10minutemail.xyz','10minutemail.site','10minutemail.live',
    '10minutemail.top','10minutemail.work','10minutemail.us','10minutemail.io',
    '10minutemail.biz','10minutemail.cc','10minutemail.pl','10minutemail.mx',
    '10minutemail.fr','10minutemail.de','10minutemail.es','10minutemail.it',
    '10minutemail.nl','10minutemail.in','10minutemail.ga','10minutemail.gq',
    '10minutemail.ml','10minutemail.cf','10minutemail.tk','my10minutemail.com',
    -- Mailinator family
    'mailinator.com','mailinator.net','mailinator.org','mailinator.info',
    'mailinator.biz','mailinator.co','mailinator.io','mailinator.cc',
    'mailinator.me','mailinator.eu','mailinator2.com','mailinator3.com',
    'mailinator4.com','mailinator5.com','mailinator6.com','mailinator7.com',
    'mailinator8.com','mailinator9.com','mailinator10.com','mailinator.gq',
    'mailinator.tk','mailinator.ml','mailinator.ga','mailinator.cf',
    -- Guerrilla Mail family
    'guerrillamail.com','guerrillamail.de','guerrillamail.net','guerrillamail.org',
    'guerrillamail.biz','guerrillamail.co.uk','guerrillamail.info','guerrillamail.la',
    'guerrillamailblock.com','grr.la',
    -- Temp-Mail family
    'temp-mail.org','temp-mail.io','temp-mail.com','temp-mail.net','temp-mail.info',
    'temp-mail.live','temp-mail.page','temp-mail.ru','temp-mail.de','temp-mail.fr',
    'temp-mail.es','temp-mail.it','temp-mail.nl','temp-mail.us','temp-mail.biz',
    'temp-mail.co','temp-mail.xyz','temp-mail.in','temp-mail.plus','temp-mail.fun',
    'temp-mail.website','temp-mail.win','tempmail.com','tempmail.net','tempmail.org',
    'tempmail.io','tempmail.biz','tempmail.info','tempmail.co','tempmail.xyz',
    'tempmail.de','tempmail.fr','tempmail.it','tempmail.es','tempmail.ru',
    'tempmail.us','tempmail.in','tempmail.top','tempmail.site','tempmail.live',
    'tempmail.shop','tempmail.store','tempmail.work','tempmail.ga','tempmail.gq',
    'tempmail.ml','tempmail.cf','tempmail.tk','tempmailer.com','tempmailer.net',
    'tempmailer.org','tempmailer.info','temp-mailer.com','temp-mailer.org',
    'tempemail.net','tempemail.com','tempemail.biz','tempemail.co','tempemail.info',
    'tempemail.org','tempemail.xyz','temporarymail.com','temporaryemail.net',
    'temporaryemail.com','temporaryemail.org','temporary-email.com',
    'temporary-email.net','temporary-email.org','tempmailaddress.com',
    'tempinbox.com','tempinbox.co.uk','tempinbox.info','tempmailo.com','tempail.com',
    'tempr.email','tempsky.com','tmpmail.org','tmpmail.net','tmpmail.com',
    'tmpmail.io','tmpmail.top','tmpmail.site','tmp-mail.com','tmp-mail.org',
    'tmp-mail.net','tmp-mail.io','tmpeml.com','tempeml.com','mailtemp.net',
    'mailtemp.org','mailtemp.com','temp-mailbox.com','temp-mailbox.org',
    'temp-mailbox.net','emailtemp.net','emailtemp.com','emailtemp.org',
    'emailtemporario.com.br','temporarioemail.com.br','temporariemail.com',
    'tempomail.fr','tempomail.com','tempo-mail.com','tempymail.com',
    -- YOPmail family
    'yopmail.com','yopmail.fr','yopmail.net','yopmail.org','yopmail.info',
    'yopmail.de','yopmail.co.uk','yopmail.biz','yopmail.us','yopmail.io',
    'yopmail.nl','yopmail.it','yopmail.es','yopmail.in','yopmail.gq',
    'yopmail.ml','yopmail.tk','yopmail.cf','yopmail.ga','yopmail.me',
    'yopmail.cc','yopmail.ws','yopmail.pro','yopmail.online',
    -- Throwaway / trash mail family
    'throwawaymail.com','throwaway.email','throwawaymail.net','throwawaymail.org',
    'throwaway-mail.com','throwaway-mail.net','throwaway-mail.org',
    'trashmail.com','trashmail.de','trashmail.net','trashmail.org','trashmail.info',
    'trashmail.biz','trashmail.co','trashmail.io','trashmail.me','trashmail.gq',
    'trashmail.ml','trashmail.tk','trashmail.ga','trashmail.cf','trashmail.ws',
    'trashymail.com','trashymail.net','trashymail.org','mytrashmail.com',
    'trashinbox.com','trash-me.com','trash-me.net','trash2009.com','trash2010.com',
    'trash2011.com',
    -- Fake email generators
    'dispostable.com','dispostable.net','discard.email','discardmail.com',
    'discardmail.de','discardmail.org','emailfake.com','email-fake.com',
    'fakemail.net','fakemailgenerator.com','fakeinbox.com','fakemailz.com',
    'fakemail.org','fakemail.ws','fake-mail.com','fakeemail.net','fakeemail.com',
    'fakeinbox.net','fakeinbox.org',
    -- Getnada family
    'getnada.com','nada.email','getnada.net','getnada.org','getnada.info',
    'getnada.biz','getnada.io','getnada.co','getnada.in',
    -- AirMail / Sharklasers family
    'sharklasers.com','getairmail.com','getairmail.net','getairmail.org',
    'airmail.cc','airmailbox.website','airmailbox.site','airmailbox.top',
    'airmailbox.live',
    -- Burner / anonymous mail
    'burnermail.io','burnermail.net','burnermail.org','anonbox.net','anonmails.de',
    'anonmail.org','anonmail.net',
    -- Spam catch-all services
    'spam4.me','spamgourmet.com','spamgourmet.net','spamgourmet.org',
    'spamgourmet.info','spamfree24.org','spamfree24.net','spamfree24.com',
    'spamfree24.info','spamherelots.com','spamherelots.net','spamjavelin.com',
    'spammotel.com','spamslicer.com','spamtraps.com','spamwc.de','spamgoat.eu',
    -- Mail-drop / catch services
    'maildrop.cc','maildrop.net','maildrop.org','maildrop.me','mailcatch.com',
    'mailcatch.net','mail7.io','mail7.net','maildu.de','mailsac.com',
    'mailnesia.com','mailmetrash.com','mailblocks.com','mailbucket.org',
    'mailcat.biz','mailcatch.biz','mailnator.com','mailsac.io',
    -- Other well-known disposable providers
    '0-mail.com','1secmail.com','1secmail.net','1secmail.org','1secmail.info',
    '20minutemail.com','24hourmail.com','33mail.com','4-mail.com','4057.com',
    '50mail.com','abyss.email','jetable.org','jetable.net','moakt.com',
    'moakt.net','moakt.org','moakt.ws','moakt.cc','emailondeck.com',
    'mohmal.com','mohmal.in','gustr.com','bouncr.com','mintemail.com',
    'emailnator.com','dropmail.me','rapidinbox.com','ssl-mail.com','dodgeit.com',
    'e4ward.com','mail.tm','mailto.plus','inboxkitten.com','pokemail.net',
    'spam.la','oborepo.com','dayrep.com','einrot.com','fleckens.hu','hotpop.com',
    'icx.in','incognitomail.com','incognitomail.net','incognitomail.org',
    'krswmail.com','luxusmail.org','meltmail.com','nevermail.de','nwytg.net',
    'oneoffmail.com','one-time.email','onetimeusemail.com','opayq.com',
    'safetymail.info','sofort-mail.de','tmail.ws','wegwerfmail.de','xoxy.net',
    'zippymail.info','zoaxe.com','zomg.info','zxcv.com','21cn.com',
    'tempmail.email','tempmail.icu','tempmail.gg','tempmail.ninja','tempmail.rocks',
    'tempmail.win','temp-mail.win','guerrillamail.me','yopmail.website',
    'throwaway.email.net','trash-mail.de','trash-mail.com','trash-mail.net',
    'tmpemail.com','tempmail.net.in'
  ];
BEGIN
  -- Walk up the subdomain chain: foo.bar.mailinator.com -> bar.mailinator.com -> mailinator.com
  LOOP
    IF d = ANY (domains) THEN
      RETURN true;
    END IF;
    pos := position('.' in d);
    IF pos = 0 THEN
      EXIT;
    END IF;
    d := substr(d, pos + 1);
  END LOOP;
  RETURN false;
END;
$$;

-- Re-grant to the roles that need it (function is IMMUTABLE + SECURITY DEFINER)
REVOKE ALL ON FUNCTION public.is_disposable_email_domain(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_disposable_email_domain(text) TO authenticated, anon, service_role;
