// Client business identity helpers (OPTIONAL, self-attested).
// GST / Udyam / Business-PAN are optional business details clients can add to
// build trust on the platform. They are format-checked (same rules as the DB
// triggers) but never labelled "verified" — no real provider verifies them.
import { supabase } from './supabase';
import { normalizeGstin, validateOptionalGstin } from './gst';

export interface ClientBusinessInfo {
  account_type: string | null;
  company_name: string | null;
  gst_number: string | null;
  udyam_number: string | null;
  business_pan: string | null;
}

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Normalize business PAN: strip spaces, uppercase. */
export function normalizeBusinessPan(value: string): string {
  return (value || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

/** Valid PAN shape (10 chars) — blank is allowed (optional field). */
export function validateOptionalBusinessPan(value: string): { valid: boolean; error?: string } {
  const pan = normalizeBusinessPan(value);
  if (!pan) return { valid: true };
  if (pan.length !== 10) return { valid: false, error: 'PAN must be exactly 10 characters.' };
  if (!PAN_RE.test(pan)) {
    return { valid: false, error: 'Invalid PAN format — 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F).' };
  }
  return { valid: true };
}

/** Udyam registration number (optional) — alphanumeric + hyphens, 8–30 chars. */
export function normalizeUdyam(value: string): string {
  return (value || '').trim().toUpperCase();
}

export function validateOptionalUdyam(value: string): { valid: boolean; error?: string } {
  const udyam = normalizeUdyam(value);
  if (!udyam) return { valid: true };
  if (!/^[A-Z0-9-]{8,30}$/.test(udyam)) {
    return { valid: false, error: 'Invalid Udyam number — use letters, digits and hyphens (8–30 characters).' };
  }
  return { valid: true };
}

export const clientBusinessService = {
  /** Load the current client's business identity row (client_profiles). */
  async get(userId: string): Promise<ClientBusinessInfo | null> {
    try {
      const { data, error } = await supabase
        .from('client_profiles')
        .select('account_type, company_name, gst_number, udyam_number, business_pan')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const d = data as unknown as ClientBusinessInfo;
      return {
        account_type: d.account_type ?? null,
        company_name: d.company_name ?? null,
        gst_number: d.gst_number ?? null,
        udyam_number: d.udyam_number ?? null,
        business_pan: d.business_pan ?? null,
      };
    } catch (error) {
      console.error('Failed to load business info:', error);
      return null;
    }
  },

  /**
   * Save business identity fields. All are optional/self-attested:
   * blank clears the field, valid values are stored, invalid values are
   * rejected client-side with the same rules the DB trigger enforces.
   */
  async save(
    userId: string,
    input: { company_name?: string; gst_number?: string; udyam_number?: string; business_pan?: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const patch: Record<string, string | null> = {};

      if (input.company_name !== undefined) {
        patch.company_name = input.company_name.trim() || null;
      }
      if (input.gst_number !== undefined) {
        const gst = normalizeGstin(input.gst_number);
        const gstCheck = validateOptionalGstin(gst);
        if (!gstCheck.valid) return { success: false, error: gstCheck.error };
        patch.gst_number = gst || null;
      }
      if (input.udyam_number !== undefined) {
        const udyam = normalizeUdyam(input.udyam_number);
        const udyamCheck = validateOptionalUdyam(udyam);
        if (!udyamCheck.valid) return { success: false, error: udyamCheck.error };
        patch.udyam_number = udyam || null;
      }
      if (input.business_pan !== undefined) {
        const pan = normalizeBusinessPan(input.business_pan);
        const panCheck = validateOptionalBusinessPan(pan);
        if (!panCheck.valid) return { success: false, error: panCheck.error };
        patch.business_pan = pan || null;
      }

      if (Object.keys(patch).length === 0) return { success: true };

      // account_type flips to 'business' automatically on the DB via the
      // existing backfill trigger only on GST writes; keep in sync here.
      if (patch.company_name || patch.gst_number || patch.udyam_number || patch.business_pan) {
        patch.account_type = 'business';
      }

      // Typed client: new/optional business columns aren't in the generated
      // client_profiles type yet — cast, matching the codebase's pattern for
      // profile updates. Server RLS + DB trigger still gate the write.
      const { error } = await supabase
        .from('client_profiles' as any)
        .update(patch as any)
        .eq('user_id', userId);
      if (error) throw error;
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save business details';
      console.error('Business save error:', msg);
      return { success: false, error: msg.includes('Invalid') ? msg : 'Could not save business details. Please try again.' };
    }
  },
};
