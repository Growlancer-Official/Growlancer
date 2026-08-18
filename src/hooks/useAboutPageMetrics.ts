import { useCallback, useEffect, useState } from 'react';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { formatCompactCurrency } from '@/lib/currency';

const METRICS_URL = '/platform-metrics.json';
const POLL_MS = 60_000;

export type PlatformMetricsFile = {
  note?: string;
  /** Total INR moved through escrow (your internal / finance source until automated). */
  paymentsProcessedInr?: number | null;
  /** Average satisfaction % when you have enough responses to publish. */
  avgSatisfactionPercent?: number | null;
  /** How many countries have at least one member (from your analytics). */
  countriesWithMembers?: number | null;
};

export type AboutStatCard = { value: string; label: string };

function formatInrShort(inr: number): string {
  if (!Number.isFinite(inr) || inr < 0) return '—';
  return formatCompactCurrency(inr);
}

function formatPercent(p: number): string {
  if (!Number.isFinite(p) || p < 0 || p > 100) return '—';
  return `${Math.round(p)}%`;
}

async function loadMetricsFile(): Promise<PlatformMetricsFile> {
  try {
    const res = await fetch(`${METRICS_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return {};
    const data = (await res.json()) as PlatformMetricsFile;
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

async function loadProfileCount(): Promise<number | null> {
  try {
    const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).is('deleted_at', null);
    if (error) return null;
    return typeof count === 'number' ? count : 0;
  } catch {
    return null;
  }
}

function buildCards(profileCount: number | null, file: PlatformMetricsFile): AboutStatCard[] {
  const users =
    profileCount === null ? '—' : profileCount.toLocaleString('en-US');
  const usersLabel =
    profileCount === null
      ? 'Registered members (live count unavailable)'
      : 'Registered members (live)';

  const pay = file.paymentsProcessedInr;
  const paymentsValue =
    pay === null || pay === undefined ? '—' : formatInrShort(Number(pay));
  const paymentsLabel = 'Payments through escrow (INR, to date)';

  const sat = file.avgSatisfactionPercent;
  const satValue =
    sat === null || sat === undefined ? '—' : formatPercent(Number(sat));
  const satLabel = 'Avg. satisfaction (published when meaningful)';

  const countries = file.countriesWithMembers;
  const countriesValue =
    countries === null || countries === undefined ? '—' : countries.toLocaleString('en-US');
  const countriesLabel = 'Countries with active members';

  return [
    { value: users, label: usersLabel },
    { value: paymentsValue, label: paymentsLabel },
    { value: satValue, label: satLabel },
    { value: countriesValue, label: countriesLabel },
  ];
}

const LOADING_CARDS: AboutStatCard[] = [
  { value: '…', label: 'Loading public metrics…' },
  { value: '…', label: 'Loading public metrics…' },
  { value: '…', label: 'Loading public metrics…' },
  { value: '…', label: 'Loading public metrics…' },
];

/** Raw live values (not formatted) so other UI (e.g. the live code terminal) can inject real numbers. */
export type AboutMetricsRaw = {
  members: number | null;
  escrowInr: number | null;
  satisfactionPercent: number | null;
  countries: number | null;
};

const EMPTY_RAW: AboutMetricsRaw = {
  members: null,
  escrowInr: null,
  satisfactionPercent: null,
  countries: null,
};

export function useAboutPageMetrics() {
  const [stats, setStats] = useState<AboutStatCard[]>(LOADING_CARDS);
  const [ready, setReady] = useState(false);
  const [raw, setRaw] = useState<AboutMetricsRaw>(EMPTY_RAW);

  const refresh = useCallback(async () => {
    const [file, profileCount] = await Promise.all([loadMetricsFile(), loadProfileCount()]);
    setStats(buildCards(profileCount, file));
    setRaw({
      members: profileCount,
      escrowInr: file.paymentsProcessedInr ?? null,
      satisfactionPercent: file.avgSatisfactionPercent ?? null,
      countries: file.countriesWithMembers ?? null,
    });
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    const channel = supabase
      .channel(uniqueChannelName('about-page-profile-count'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      // Explicit leave before removal (removeChannel also awaits unsubscribe internally;
      // sequencing avoids any ambiguity on remount and matches teardown expectations).
      void (async () => {
        try {
          await channel.unsubscribe();
          await supabase.removeChannel(channel);
        } catch {
          /* best-effort cleanup */
        }
      })();
    };
  }, [refresh]);

  return { stats, ready, refresh, raw };
}
