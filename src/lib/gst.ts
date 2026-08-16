// ────────────────────────────────────────────────────────────────────────────
// GROWLANCER — GSTIN (Goods & Services Tax Identification Number) helpers
// Mirrors the server-side trigger (validate_client_gstin) so the UI shows the
// exact same validation the database enforces.
// Valid Indian GSTIN = 15 chars:
//   [0-9]{2}   state code
//   [A-Z]{5}   first 5 PAN letters
//   [0-9]{4}   next 4 PAN digits
//   [A-Z]{1}   PAN letter
//   [1-9A-Z]   entity type / blank
//   Z          fixed letter
//   [0-9A-Z]   checksum char
// ────────────────────────────────────────────────────────────────────────────

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Normalize: strip spaces, uppercase. Returns '' for empty input. */
export function normalizeGstin(value: string): string {
  return (value || '').replace(/\s+/g, '').toUpperCase();
}

/**
 * Validate a GSTIN. Empty/blank input is considered valid (not provided yet).
 * Returns true only for a well-formed 15-character Indian GSTIN.
 */
export function isValidGstin(value: string): boolean {
  const gst = normalizeGstin(value);
  if (!gst) return false; // caller decides whether empty is allowed
  if (gst.length !== 15) return false;
  return GSTIN_RE.test(gst);
}

/**
 * Validate an optional GSTIN field (form usage): blank is OK, non-blank must
 * be a valid GSTIN. Returns { valid, error? }.
 */
export function validateOptionalGstin(value: string): { valid: boolean; error?: string } {
  const gst = normalizeGstin(value);
  if (!gst) return { valid: true };
  if (gst.length !== 15) {
    return { valid: false, error: 'GSTIN must be exactly 15 characters.' };
  }
  if (!GSTIN_RE.test(gst)) {
    return { valid: false, error: 'Invalid GSTIN format — 2 digit state code, 10-char PAN, entity code, Z, check digit.' };
  }
  return { valid: true };
}

/** Mask for display: 15AABCX1234F1Z5 → 15AABCX1••••1Z5 (keeps ends visible). */
export function maskGstin(value: string): string {
  const gst = normalizeGstin(value);
  if (gst.length !== 15) return gst;
  return `${gst.slice(0, 7)}••••${gst.slice(11)}`;
}
