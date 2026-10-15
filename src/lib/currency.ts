// ────────────────────────────────────────────────────────────────────────────
// GROWLANCER — centralized currency formatting + country→currency resolution
//
// India-first platform: money is INR for India. As users arrive from other
// countries we switch the *display* currency to their country's currency, in
// real time (see CurrencyContext — it reads the user's onboarding country from
// their profile and re-renders whenever that changes).
//
// Every money value in the UI goes through the formatters here so a currency
// switch needs no per-file edits.
//
// FX conversion path (new in this milestone):
//   • display currency for a visitor is still chosen by country (this file)
//   • server-side rates live in public.fx_rates (see migration 20270119000030)
//   • get_fx_rate() / get_fx_rates() are the only RPCs a client may call for
//     rates; the app converts INR display amounts to the visitor's currency in
//     formatCurrency when a rate exists, otherwise falls back to INR (never a
//     guess).
//   • Settlement / wallet / escrow never reads rates — see migration comments.
// ────────────────────────────────────────────────────────────────────────────

/** Fallback currency + locale when the country is unknown (India-first). */
// Default display currency when no rate exists (never a guess — INR only).
export const DEFAULT_CURRENCY = 'INR';
export const DEFAULT_LOCALE = 'en-IN';
// When a visitor's currency has no rate yet, show INR explicitly (not hidden 
// behind a missing-symbol silent unit). The UI surfaces this in the currency 
// badge: e.g. INR//USD means 'we show USD figures but no rate set yet'.
export const PLACEHOLDER_RATE_INDICATOR = `//`;

/**
 * ISO 3166-1 alpha-2 country code → ISO 4217 currency code.
 *
 * Covers every country seeded in `public.countries` (the same list the
 * onboarding country dropdown reads). Countries that use a foreign currency
 * (Ecuador → USD, Kosovo → EUR, Nauru → AUD, Palestine → ILS…) map to the
 * currency they actually transact in, not a notional local one.
 */
export const COUNTRY_CURRENCY: Record<string, string> = {
  AF: 'AFN', AL: 'ALL', DZ: 'DZD', AD: 'EUR', AO: 'AOA',
  AG: 'XCD', AR: 'ARS', AM: 'AMD', AU: 'AUD', AT: 'EUR',
  AZ: 'AZN', BS: 'BSD', BH: 'BHD', BD: 'BDT', BB: 'BBD',
  BY: 'BYN', BE: 'EUR', BZ: 'BZD', BJ: 'XOF', BT: 'BTN',
  BO: 'BOB', BA: 'BAM', BW: 'BWP', BR: 'BRL', BN: 'BND',
  BG: 'BGN', BF: 'XOF', BI: 'BIF', CV: 'CVE', KH: 'KHR',
  CM: 'XAF', CA: 'CAD', CF: 'XAF', TD: 'XAF', CL: 'CLP',
  CN: 'CNY', CO: 'COP', KM: 'KMF', CD: 'CDF', CG: 'XAF',
  CR: 'CRC', CI: 'XOF', HR: 'EUR', CU: 'CUP', CY: 'EUR',
  CZ: 'CZK', DK: 'DKK', DJ: 'DJF', DM: 'XCD', DO: 'DOP',
  EC: 'USD', EG: 'EGP', SV: 'USD', GQ: 'XAF', ER: 'ERN',
  EE: 'EUR', SZ: 'SZL', ET: 'ETB', FJ: 'FJD', FI: 'EUR',
  FR: 'EUR', GA: 'XAF', GM: 'GMD', GE: 'GEL', DE: 'EUR',
  GH: 'GHS', GR: 'EUR', GD: 'XCD', GT: 'GTQ', GN: 'GNF',
  GW: 'XOF', GY: 'GYD', HT: 'HTG', HN: 'HNL', HU: 'HUF',
  IS: 'ISK', IN: 'INR', ID: 'IDR', IR: 'IRR', IQ: 'IQD',
  IE: 'EUR', IL: 'ILS', IT: 'EUR', JM: 'JMD', JP: 'JPY',
  JO: 'JOD', KZ: 'KZT', KE: 'KES', KI: 'AUD', XK: 'EUR',
  KW: 'KWD', KG: 'KGS', LA: 'LAK', LV: 'EUR', LB: 'LBP',
  LS: 'LSL', LR: 'LRD', LY: 'LYD', LI: 'CHF', LT: 'EUR',
  LU: 'EUR', MG: 'MGA', MW: 'MWK', MY: 'MYR', MV: 'MVR',
  ML: 'XOF', MT: 'EUR', MH: 'USD', MR: 'MRU', MU: 'MUR',
  MX: 'MXN', FM: 'USD', MD: 'MDL', MC: 'EUR', MN: 'MNT',
  ME: 'EUR', MA: 'MAD', MZ: 'MZN', MM: 'MMK', NA: 'NAD',
  NR: 'AUD', NP: 'NPR', NL: 'EUR', NZ: 'NZD', NI: 'NIO',
  NE: 'XOF', NG: 'NGN', KP: 'KPW', MK: 'MKD', NO: 'NOK',
  OM: 'OMR', PK: 'PKR', PW: 'USD', PS: 'ILS', PA: 'PAB',
  PG: 'PGK', PY: 'PYG', PE: 'PEN', PH: 'PHP', PL: 'PLN',
  PT: 'EUR', QA: 'QAR', RO: 'RON', RU: 'RUB', RW: 'RWF',
  KN: 'XCD', LC: 'XCD', VC: 'XCD', WS: 'WST', SM: 'EUR',
  ST: 'STN', SA: 'SAR', SN: 'XOF', RS: 'RSD', SC: 'SCR',
  SL: 'SLE', SG: 'SGD', SK: 'EUR', SI: 'EUR', SB: 'SBD',
  SO: 'SOS', ZA: 'ZAR', KR: 'KRW', SS: 'SSP', ES: 'EUR',
  LK: 'LKR', SD: 'SDG', SR: 'SRD', SE: 'SEK', CH: 'CHF',
  SY: 'SYP', TW: 'TWD', TJ: 'TJS', TZ: 'TZS', TH: 'THB',
  TL: 'USD', TG: 'XOF', TO: 'TOP', TT: 'TTD', TN: 'TND',
  TR: 'TRY', TM: 'TMT', TV: 'AUD', UG: 'UGX', UA: 'UAH',
  AE: 'AED', GB: 'GBP', US: 'USD', UY: 'UYU', UZ: 'UZS',
  VU: 'VUV', VA: 'EUR', VE: 'VES', VN: 'VND', YE: 'YER',
  ZM: 'ZMW', ZW: 'ZWL',
};

/**
 * Currency code → formatting locale.
 *
 * Only currencies whose formatting meaningfully differs from `en-US` are
 * listed. INR keeps `en-IN` so the lakh/crore digit grouping the platform has
 * always shown stays intact.
 */
const CURRENCY_LOCALE: Record<string, string> = {
  INR: 'en-IN',
  EUR: 'de-DE',
  GBP: 'en-GB',
  JPY: 'ja-JP',
  CNY: 'zh-CN',
  KRW: 'ko-KR',
  RUB: 'ru-RU',
  BRL: 'pt-BR',
  IDR: 'id-ID',
  VND: 'vi-VN',
  THB: 'th-TH',
  TRY: 'tr-TR',
  PLN: 'pl-PL',
  CHF: 'de-CH',
  SEK: 'sv-SE',
  NOK: 'nb-NO',
  DKK: 'da-DK',
  CZK: 'cs-CZ',
  HUF: 'hu-HU',
  RON: 'ro-RO',
  ZAR: 'en-ZA',
  AUD: 'en-AU',
  CAD: 'en-CA',
  NZD: 'en-NZ',
  SGD: 'en-SG',
  MYR: 'ms-MY',
  PHP: 'en-PH',
  PKR: 'en-PK',
  BDT: 'bn-BD',
  LKR: 'si-LK',
  NPR: 'ne-NP',
  AED: 'ar-AE',
  SAR: 'ar-SA',
  EGP: 'ar-EG',
  NGN: 'en-NG',
  KES: 'en-KE',
  ARS: 'es-AR',
  MXN: 'es-MX',
  CLP: 'es-CL',
  COP: 'es-CO',
  PEN: 'es-PE',
  ILS: 'he-IL',
  // CFA francs share fr-FR formatting.
  XOF: 'fr-FR',
  XAF: 'fr-FR',
};

/** Locale used to format a given currency (documented fallback: en-US). */
export function localeForCurrency(currency: string): string {
  return CURRENCY_LOCALE[currency.toUpperCase()] ?? 'en-US';
}

/** True when `code` is a currency this module knows how to format. */
export function isKnownCurrency(code: string | null | undefined): boolean {
  if (!code) return false;
  try {
    // Intl throws RangeError for a structurally invalid code.
    new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the display currency for a country.
 *
 * Accepts either an ISO alpha-2 code ("IN") or a country *name* ("India") —
 * onboarding stores the name in `profiles.country`, while OAuth paths carry the
 * code, and both must land on the same currency.
 *
 * Unknown / missing country → DEFAULT_CURRENCY (India-first, never a guess).
 */
export function getCurrencyForCountry(country: string | null | undefined): string {
  const code = getCountryCode(country);
  return code ? COUNTRY_CURRENCY[code] : DEFAULT_CURRENCY;
}

/**
 * Resolve an ISO alpha-2 country code from either a code ("IN") or a country
 * name ("India"). Returns null when the value is empty or unrecognised.
 */
export function getCountryCode(country: string | null | undefined): string | null {
  if (!country) return null;
  const raw = country.trim();
  if (!raw) return null;

  // "/" separated combined values (some legacy rows stored "IN / Remote").
  const firstToken = raw.split('/')[0].trim();
  if (!firstToken) return null;

  if (firstToken.length === 2) {
    const code = firstToken.toUpperCase();
    if (COUNTRY_CURRENCY[code]) return code;
  }

  // Country name → code, matched case-insensitively against the seeded names.
  const needle = firstToken.toLowerCase();
  for (const code of Object.keys(COUNTRY_CURRENCY)) {
    if (COUNTRY_NAMES[code]?.toLowerCase() === needle) return code;
  }

  return null;
}

/**
 * Best available display rate for a currency pair at call time.
 *
 * Used only for PRESENTATION (formatCurrency applies it to INR amounts).
 * Returns NULL when no rate has been set yet for the target currency — the caller
 * must then show INR instead of silently pretending a rate exists.
 */
export async function resolveDisplayRate(
  baseCurrency: string,
  targetCurrency: string,
): Promise<number | null> {
  if (baseCurrency === targetCurrency) return 1;
  if (typeof window === 'undefined') {
    return null;
  }

  // Try the REST endpoint directly rather than the typed RPC helper — the new
  // get_fx_rate RPC lives in a migration that hasn't landed in this environment's
  // generated type set yet, so rpc('get_fx_rate' as any) would fail typecheck.
  try {
    const url = new URL('/functions/v1/get_fx_rate', typeof window !== 'undefined' && window.location ? window.location.origin : 'http://localhost:5173');
    url.searchParams.set('p_base_currency', baseCurrency);
    url.searchParams.set('p_target_currency', targetCurrency);
    const resp = await fetch(url.toString(), { credentials: 'include' });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { data: number | null; error?: string };
    return typeof json.data === 'number' ? json.data : null;
  } catch {
    return null;
  }
}

/**
 * Convert an INR amount to the target currency's display value using the best
 * available rate. Returns INR-formatted value when no rate is available (never a
 * guess).
 */
export function convertInrToDisplay(
  inrAmount: number,
  targetCurrency: string,
  rate: number | null,
  locale?: string,
): string {
  const amount = Number.isFinite(inrAmount) ? inrAmount : 0;
  if (rate === null || rate === 0) {
    return formatCurrency(amount, 'INR', locale);
  }
  const converted = amount * rate;
  return formatCurrency(converted, targetCurrency, locale);
}

/**
 * Country names for the currencies we support, keyed by alpha-2. Kept next to
 * the currency map so name-based resolution (profiles.country) never needs a
 * network round-trip. Only names that differ from a naive lookup are needed,
 * but we list every entry so the mapping stays auditable in one place.
 */
const COUNTRY_NAMES: Record<string, string> = {
  AF: 'Afghanistan', AL: 'Albania', DZ: 'Algeria', AD: 'Andorra', AO: 'Angola',
  AG: 'Antigua and Barbuda', AR: 'Argentina', AM: 'Armenia', AU: 'Australia', AT: 'Austria',
  AZ: 'Azerbaijan', BS: 'Bahamas', BH: 'Bahrain', BD: 'Bangladesh', BB: 'Barbados',
  BY: 'Belarus', BE: 'Belgium', BZ: 'Belize', BJ: 'Benin', BT: 'Bhutan',
  BO: 'Bolivia', BA: 'Bosnia and Herzegovina', BW: 'Botswana', BR: 'Brazil', BN: 'Brunei',
  BG: 'Bulgaria', BF: 'Burkina Faso', BI: 'Burundi', CV: 'Cabo Verde', KH: 'Cambodia',
  CM: 'Cameroon', CA: 'Canada', CF: 'Central African Republic', TD: 'Chad', CL: 'Chile',
  CN: 'China', CO: 'Colombia', KM: 'Comoros', CD: 'Congo (DRC)', CG: 'Congo (Republic)',
  CR: 'Costa Rica', CI: "Cote d'Ivoire", HR: 'Croatia', CU: 'Cuba', CY: 'Cyprus',
  CZ: 'Czech Republic', DK: 'Denmark', DJ: 'Djibouti', DM: 'Dominica', DO: 'Dominican Republic',
  EC: 'Ecuador', EG: 'Egypt', SV: 'El Salvador', GQ: 'Equatorial Guinea', ER: 'Eritrea',
  EE: 'Estonia', SZ: 'Eswatini', ET: 'Ethiopia', FJ: 'Fiji', FI: 'Finland',
  FR: 'France', GA: 'Gabon', GM: 'Gambia', GE: 'Georgia', DE: 'Germany',
  GH: 'Ghana', GR: 'Greece', GD: 'Grenada', GT: 'Guatemala', GN: 'Guinea',
  GW: 'Guinea-Bissau', GY: 'Guyana', HT: 'Haiti', HN: 'Honduras', HU: 'Hungary',
  IS: 'Iceland', IN: 'India', ID: 'Indonesia', IR: 'Iran', IQ: 'Iraq',
  IE: 'Ireland', IL: 'Israel', IT: 'Italy', JM: 'Jamaica', JP: 'Japan',
  JO: 'Jordan', KZ: 'Kazakhstan', KE: 'Kenya', KI: 'Kiribati', XK: 'Kosovo',
  KW: 'Kuwait', KG: 'Kyrgyzstan', LA: 'Laos', LV: 'Latvia', LB: 'Lebanon',
  LS: 'Lesotho', LR: 'Liberia', LY: 'Libya', LI: 'Liechtenstein', LT: 'Lithuania',
  LU: 'Luxembourg', MG: 'Madagascar', MW: 'Malawi', MY: 'Malaysia', MV: 'Maldives',
  ML: 'Mali', MT: 'Malta', MH: 'Marshall Islands', MR: 'Mauritania', MU: 'Mauritius',
  MX: 'Mexico', FM: 'Micronesia', MD: 'Moldova', MC: 'Monaco', MN: 'Mongolia',
  ME: 'Montenegro', MA: 'Morocco', MZ: 'Mozambique', MM: 'Myanmar', NA: 'Namibia',
  NR: 'Nauru', NP: 'Nepal', NL: 'Netherlands', NZ: 'New Zealand', NI: 'Nicaragua',
  NE: 'Niger', NG: 'Nigeria', KP: 'North Korea', MK: 'North Macedonia', NO: 'Norway',
  OM: 'Oman', PK: 'Pakistan', PW: 'Palau', PS: 'Palestine', PA: 'Panama',
  PG: 'Papua New Guinea', PY: 'Paraguay', PE: 'Peru', PH: 'Philippines', PL: 'Poland',
  PT: 'Portugal', QA: 'Qatar', RO: 'Romania', RU: 'Russia', RW: 'Rwanda',
  KN: 'Saint Kitts and Nevis', LC: 'Saint Lucia', VC: 'Saint Vincent and the Grenadines',
  WS: 'Samoa', SM: 'San Marino', ST: 'Sao Tome and Principe', SA: 'Saudi Arabia',
  SN: 'Senegal', RS: 'Serbia', SC: 'Seychelles', SL: 'Sierra Leone', SG: 'Singapore',
  SK: 'Slovakia', SI: 'Slovenia', SB: 'Solomon Islands', SO: 'Somalia', ZA: 'South Africa',
  KR: 'South Korea', SS: 'South Sudan', ES: 'Spain', LK: 'Sri Lanka', SD: 'Sudan',
  SR: 'Suriname', SE: 'Sweden', CH: 'Switzerland', SY: 'Syria', TW: 'Taiwan',
  TJ: 'Tajikistan', TZ: 'Tanzania', TH: 'Thailand', TL: 'Timor-Leste', TG: 'Togo',
  TO: 'Tonga', TT: 'Trinidad and Tobago', TN: 'Tunisia', TR: 'Turkey', TM: 'Turkmenistan',
  TV: 'Tuvalu', UG: 'Uganda', UA: 'Ukraine', AE: 'United Arab Emirates', GB: 'United Kingdom',
  US: 'United States', UY: 'Uruguay', UZ: 'Uzbekistan', VU: 'Vanuatu', VA: 'Vatican City',
  VE: 'Venezuela', VN: 'Vietnam', YE: 'Yemen', ZM: 'Zambia', ZW: 'Zimbabwe',
};

/**
 * Best-effort country detection for visitors who have not told us a country
 * yet (anonymous browsing, pre-onboarding). Uses the browser's region
 * subtag (e.g. "en-IN" → IN), then the time zone as a second signal.
 *
 * Returns null when nothing reliable is available — callers fall back to
 * DEFAULT_CURRENCY rather than inventing a guess.
 */
export function detectCountryCode(): string | null {
  if (typeof navigator === 'undefined') return null;

  const fromRegion = (value: string | undefined): string | null => {
    if (!value) return null;
    const match = value.replace('_', '-').match(/[-]([A-Za-z]{2})\b/);
    const code = match?.[1]?.toUpperCase();
    return code && COUNTRY_CURRENCY[code] ? code : null;
  };

  // navigator.languages is ordered by preference — take the first usable one.
  const languages = Array.isArray(navigator.languages) && navigator.languages.length
    ? navigator.languages
    : [navigator.language];
  for (const lang of languages) {
    const code = fromRegion(lang);
    if (code) return code;
  }

  // Time-zone fallback: enough coverage for the biggest markets, no guessing.
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const tzCountry: Record<string, string> = {
      'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
      'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
      'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
      'Pacific/Honolulu': 'US', 'Europe/London': 'GB', 'Europe/Dublin': 'IE',
      'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Europe/Madrid': 'ES',
      'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
      'Europe/Lisbon': 'PT', 'Europe/Zurich': 'CH', 'Europe/Stockholm': 'SE',
      'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Warsaw': 'PL',
      'Europe/Prague': 'CZ', 'Europe/Vienna': 'AT', 'Europe/Athens': 'GR',
      'Europe/Istanbul': 'TR', 'Europe/Moscow': 'RU', 'Europe/Kyiv': 'UA',
      'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD', 'Asia/Colombo': 'LK',
      'Asia/Kathmandu': 'NP', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA',
      'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Tokyo': 'JP',
      'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'CN', 'Asia/Singapore': 'SG',
      'Asia/Kuala_Lumpur': 'MY', 'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH',
      'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Seoul': 'KR',
      'Asia/Taipei': 'TW', 'Asia/Jerusalem': 'IL', 'Australia/Sydney': 'AU',
      'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ',
      'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Cairo': 'EG',
      'Africa/Johannesburg': 'ZA', 'America/Sao_Paulo': 'BR', 'America/Mexico_City': 'MX',
      'America/Argentina/Buenos_Aires': 'AR', 'America/Bogota': 'CO',
      'America/Santiago': 'CL', 'America/Lima': 'PE', 'America/Toronto': 'CA',
      'America/Vancouver': 'CA',
    };
    if (tz && tzCountry[tz]) return tzCountry[tz];
  } catch (err) {
    console.warn('[currency] Time-zone detection failed (falling back to default):', err);
  }

  return null;
}

/**
 * Format an amount with the currency symbol and locale-correct digit grouping.
 *
 * @param amount   - Amount to format (NaN/undefined-safe → renders 0)
 * @param currency - ISO 4217 code, default 'INR'
 * @param locale   - Optional locale override; derived from the currency when omitted
 * @returns e.g. "₹1,23,456" / "$2,340"
 */
export function formatCurrency(amount: number, currency = DEFAULT_CURRENCY, locale?: string): string {
  // Guard against NaN/undefined so the UI never renders ₹NaN.
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const cur = isKnownCurrency(currency) ? currency : DEFAULT_CURRENCY;
  return new Intl.NumberFormat(locale ?? localeForCurrency(cur), {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

/**
 * Currency symbol for the active currency (default INR → "₹").
 * Used in labels/placeholders/input prefixes so a currency switch updates
 * every symbol in the UI from one place.
 */
export function currencySymbol(currency = DEFAULT_CURRENCY, locale?: string): string {
  const cur = isKnownCurrency(currency) ? currency : DEFAULT_CURRENCY;
  try {
    const parts = new Intl.NumberFormat(locale ?? localeForCurrency(cur), {
      style: 'currency',
      currency: cur,
    }).formatToParts(0);
    return parts.find((p) => p.type === 'currency')?.value ?? '₹';
  } catch {
    return '₹';
  }
}

/** One decimal, but drop a trailing '.0' so ₹1L is not ₹1.0L. */
function compactDigits(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1).replace(/\.0$/, '');
}

/**
 * Compact currency formatter for large metric-style numbers (₹1.2L, $3.4K).
 *
 * INR is formatted by hand. ICU's `en-IN` compact notation spells a THOUSAND as
 * "T" (37 500 → ₹37.5T), which in a money context reads as trillions — verified
 * in the browser against the real ICU data. Indian number sense is K → L → Cr,
 * so we produce that instead. Every other currency uses Intl's own compact
 * notation, which is already idiomatic for its locale.
 */
export function formatCompactCurrency(amount: number, currency = DEFAULT_CURRENCY, locale?: string): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  const cur = isKnownCurrency(currency) ? currency : DEFAULT_CURRENCY;

  if (cur === 'INR') {
    const abs = Math.abs(safeAmount);
    const sign = safeAmount < 0 ? '-' : '';
    const symbol = currencySymbol('INR', locale);
    if (abs < 1_000) return `${sign}${symbol}${Math.round(abs)}`;
    if (abs < 1_00_000) return `${sign}${symbol}${compactDigits(abs / 1_000)}K`;
    if (abs < 1_00_00_000) return `${sign}${symbol}${compactDigits(abs / 1_00_000)}L`;
    return `${sign}${symbol}${compactDigits(abs / 1_00_00_000)}Cr`;
  }

  try {
    return new Intl.NumberFormat(locale ?? localeForCurrency(cur), {
      style: 'currency',
      currency: cur,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(safeAmount);
  } catch (err) {
    // Structurally valid currency already checked; this is belt-and-braces for
    // environments with a trimmed ICU dataset.
    console.warn('[currency] Compact formatting unavailable, falling back:', err);
    return `${currencySymbol(cur)}${Math.round(safeAmount)}`;
  }
}
