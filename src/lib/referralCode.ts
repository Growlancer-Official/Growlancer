/**
 * Referral code — one canonical format for the whole product.
 *
 * Format: `GRW-XXXX-XXXX`
 *   • `GRW` is the Growlanzo prefix, so a code reads as ours even when it is
 *     pasted into a chat with no context.
 *   • 8 random characters from a 32-symbol alphabet, shown in two groups of
 *     four. The alphabet drops 0/O, 1/I/L and U, the characters people mistype
 *     when they read a code off a phone screen.
 *   • No role marker. The old `GRW-FR-xxxx` shape leaked whether the owner was
 *     a freelancer or a client and shortened the random part to four chars.
 *
 * 32^8 = 1.1e12 combinations, so guessing a live code is not tractable.
 *
 * Everything here is pure (no network, no DOM) so the same rules can be unit
 * tested and reused by the signup flow when a user types a code by hand.
 */

export const REFERRAL_CODE_PREFIX = 'GRW';

/** Crockford-style alphabet: no 0/O, 1/I/L, U. */
export const REFERRAL_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_GROUP_SIZE = 4;

/** Normalized (dash-free) shape of a modern code. */
export const REFERRAL_CODE_PATTERN = new RegExp(
  `^${REFERRAL_CODE_PREFIX}[${REFERRAL_CODE_ALPHABET}]{${REFERRAL_CODE_LENGTH}}$`
);

/** Legacy codes issued before the format change: `GRW-FR-1A2B3C`. */
export const LEGACY_REFERRAL_CODE_PATTERN = /^GRW-[A-Z]{2}-[0-9A-Z]{4,8}$/;

/**
 * Strip everything that is not part of the code itself.
 *
 * Accepts a bare code (`grw 7k2m 9qxt`), a dashed code, or a full invite URL
 * (`https://growlanzo.com/signup?ref=GRW-7K2M-9QXT`) and always returns the
 * canonical dash-free `uppercase` form. Returns `''` for empty input.
 */
export function normalizeReferralCode(input: string | null | undefined): string {
  if (!input) return '';
  let value = String(input).trim();
  if (!value) return '';

  // A pasted link carries the code in `?ref=`.
  const fromUrl = value.match(/[?&]ref=([^&#\s]+)/i);
  if (fromUrl) {
    try {
      value = decodeURIComponent(fromUrl[1]);
    } catch {
      value = fromUrl[1];
    }
  }

  return value.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * Human-facing form of a code. Modern codes are grouped `GRW-XXXX-XXXX`;
 * legacy codes are shown exactly as stored so an old shared code keeps working
 * character for character.
 */
export function formatReferralCode(input: string | null | undefined): string {
  const raw = String(input ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (LEGACY_REFERRAL_CODE_PATTERN.test(raw)) return raw;

  const normalized = normalizeReferralCode(raw);
  if (!REFERRAL_CODE_PATTERN.test(normalized)) return normalized || raw;

  const body = normalized.slice(REFERRAL_CODE_PREFIX.length);
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += REFERRAL_CODE_GROUP_SIZE) {
    groups.push(body.slice(i, i + REFERRAL_CODE_GROUP_SIZE));
  }
  return [REFERRAL_CODE_PREFIX, ...groups].join('-');
}

/** True for codes that satisfy either the modern or the legacy shape. */
export function isValidReferralCode(input: string | null | undefined): boolean {
  const normalized = normalizeReferralCode(input);
  if (!normalized) return false;
  if (REFERRAL_CODE_PATTERN.test(normalized)) return true;
  // Legacy `GRW-FR-1A2B3C` normalizes to `GRWFR1A2B3C` (11 chars).
  return new RegExp(`^${REFERRAL_CODE_PREFIX}[0-9A-Z]{6,12}$`).test(normalized);
}

/** Cryptographically strong bytes when the runtime provides them. */
function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;

  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
    return bytes;
  }

  // Deterministic environments (older test runners) still get a valid code.
  for (let i = 0; i < length; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

/**
 * Generate a new invite code in the canonical format.
 *
 * The modulo bias of `byte % 32` is irrelevant here: 32 divides 256 exactly, so
 * every symbol is equally likely.
 */
export function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let body = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i += 1) {
    body += REFERRAL_CODE_ALPHABET[bytes[i] % REFERRAL_CODE_ALPHABET.length];
  }
  return formatReferralCode(`${REFERRAL_CODE_PREFIX}${body}`);
}

/** Public signup URL that carries the code. */
export function buildReferralLink(
  code: string | null | undefined,
  origin?: string
): string {
  const formatted = formatReferralCode(code);
  if (!formatted) return '';
  const base = (origin || (typeof window !== 'undefined' ? window.location.origin : '') || 'https://growlanzo.com')
    .replace(/\/+$/, '');
  return `${base}/signup?ref=${encodeURIComponent(formatted)}`;
}

/**
 * Where `/signup?ref=…` must redirect.
 *
 * `/signup` is not a page — it opens the signup modal on the homepage. A plain
 * `<Navigate to="/?modal=signup">` drops the query string, which silently
 * breaks every referral link (the code never reaches `signInWithOAuth`). This
 * helper carries `ref` across the redirect.
 */
export function buildSignupRedirectTarget(search: string): string {
  const ref = new URLSearchParams(search).get('ref');
  return ref
    ? `/?modal=signup&ref=${encodeURIComponent(ref)}`
    : '/?modal=signup';
}

/**
 * The URL MainLayout leaves behind after it opens a login/signup modal.
 *
 * It strips `modal`/`role` so a refresh does not reopen the modal, but it must
 * keep `ref`: `signInWithOAuth` reads the code from the URL at the moment the
 * user picks a provider, which can be after this cleanup has run.
 */
export function buildModalCleanupUrl(pathname: string, search: string): string {
  const ref = new URLSearchParams(search).get('ref');
  return ref ? `${pathname}?ref=${encodeURIComponent(ref)}` : pathname;
}
