// ────────────────────────────────────────────────────────────────────────────
// Country waitlist — data layer for "all countries A→Z, Coming Soon + waitlist".
//
// Backed by three SECURITY DEFINER RPCs added in
// supabase/migrations/20270119000028_country_waitlist_interest.sql:
//   • country_waitlist_counts()          — public, aggregate only (no PII)
//   • join_country_waitlist(country)     — signed-in; identity comes from the JWT
//   • admin_country_waitlist_insights()  — admin-only; who + where
//
// These RPCs are newer than the generated `Database` types, so the builder is
// cast the same way `useCountries` and `useIndustries` do it.
// ────────────────────────────────────────────────────────────────────────────

import { supabase } from './supabase';

export interface CountryInterest {
  /** Canonical country name, matching `public.countries.name`. */
  country: string;
  interested: number;
  last_joined: string | null;
}

export interface JoinWaitlistResult {
  success: boolean;
  /** True when this email was already on the list (idempotent re-tap). */
  already_exists?: boolean;
  /** True when the country is live, so there is nothing to wait for. */
  available?: boolean;
  country?: string;
  error?: string;
}

export interface WaitlistInsightRow {
  name: string | null;
  email: string;
  country: string;
  signup_source: string | null;
  joined_at: string | null;
}

export interface WaitlistInsights {
  total: number;
  countryCount: number;
  byCountry: Array<{ country: string; interested: number; last_joined: string | null }>;
  recent: WaitlistInsightRow[];
}

/**
 * Per-country interest counts. Public: returns aggregates only, never an email
 * or name, so it is safe to call from a logged-out page.
 */
export async function fetchCountryInterest(): Promise<CountryInterest[]> {
  try {
    const { data, error } = await (supabase.rpc as any)('country_waitlist_counts');
    if (error) {
      console.error('country_waitlist_counts failed:', error.message);
      return [];
    }
    return (data ?? []) as CountryInterest[];
  } catch (err) {
    console.error('country_waitlist_counts threw:', err);
    return [];
  }
}

/**
 * Join the waitlist for a country that is not live yet.
 *
 * No email/name/user_id is sent — the RPC reads them from the caller's own rows,
 * keyed on the verified JWT (CLAUDE.md Security Principle 6).
 */
export async function joinCountryWaitlist(country: string): Promise<JoinWaitlistResult> {
  try {
    const { data, error } = await (supabase.rpc as any)('join_country_waitlist', {
      p_country: country,
    });

    if (error) {
      console.error('join_country_waitlist failed:', error.message);
      return { success: false, error: error.message };
    }

    const result = (data ?? {}) as JoinWaitlistResult;
    if (!result.success) {
      return { success: false, error: result.error || 'Could not join the waitlist right now.' };
    }
    return result;
  } catch (err) {
    console.error('join_country_waitlist threw:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

/**
 * Admin-only insight: interest per country plus who joined and from where.
 * The server re-checks `profiles_private.is_admin`; this returns null when the
 * caller is not an admin rather than throwing.
 */
export async function fetchAdminWaitlistInsights(): Promise<WaitlistInsights | null> {
  try {
    const { data, error } = await (supabase.rpc as any)('admin_country_waitlist_insights');
    if (error) {
      console.error('admin_country_waitlist_insights failed:', error.message);
      return null;
    }
    const raw = (data ?? {}) as {
      success?: boolean;
      total?: number;
      country_count?: number;
      by_country?: Array<{ country: string; interested: number; last_joined: string | null }>;
      recent?: WaitlistInsightRow[];
    };

    if (!raw.success) return null;

    return {
      total: raw.total ?? 0,
      countryCount: raw.country_count ?? (raw.by_country?.length ?? 0),
      byCountry: raw.by_country ?? [],
      recent: raw.recent ?? [],
    };
  } catch (err) {
    console.error('admin_country_waitlist_insights threw:', err);
    return null;
  }
}
