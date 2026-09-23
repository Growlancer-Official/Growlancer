import { useCallback, useEffect, useState } from 'react';
import { supabase, uniqueChannelName } from '@/lib/supabase';
import { formatCompactCurrency } from '@/lib/currency';

const POLL_MS = 60_000;

export type PlatformMetricsFile = {
  /** Total INR moved through escrow (live from DB via RPC). */
  totalEscrowInr?: number | null;
  /** Average satisfaction % (live from reviews, min 5 reviews to show). */
  avgSatisfactionPercent?: number | null;
  /** Total reviews behind the satisfaction number (0 = nothing to average yet). */
  totalReviews?: number | null;
  /** Distinct countries across live profiles. */
  countries?: number | null;
  /**
   * Living accounts that can still sign in — the RPC counts profiles joined to
   * auth.users, so orphans (a profile whose auth row is gone) are excluded.
   */
  memberCount?: number | null;
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
    const { data, error } = await (supabase as any).rpc('get_public_platform_metrics');
    if (error || !data) return {};
    const metrics = data as unknown as Record<string, unknown>;
    return {
      totalEscrowInr: (metrics.totalEscrowInr as number | null) ?? null,
      avgSatisfactionPercent: (metrics.avgSatisfactionPercent as number | null) ?? null,
      totalReviews: (metrics.totalReviews as number | null) ?? null,
      // The RPC has returned `countries` since 20270119000001 — the hook used to
      // hardcode null here, which left the About canvas printing "— countries".
      countries: (metrics.countries as number | null) ?? null,
      memberCount: (metrics.memberCount as number | null) ?? null,
    };
  } catch {
    return {};
  }
}

function buildCards(profileCount: number | null, file: PlatformMetricsFile): AboutStatCard[] {
  const users =
    profileCount === null ? '—' : profileCount.toLocaleString('en-US');
  const usersLabel =
    profileCount === null
      ? 'Registered members (live count unavailable)'
      : 'Registered members (live)';

  // A brand-new platform honestly has ₹0 in escrow — show the real number, not
  // a placeholder, so the counter is never "fake" for the first real users.
  const pay = file.totalEscrowInr;
  const paymentsValue =
    pay === null || pay === undefined ? '—' : formatInrShort(Number(pay));
  const paymentsLabel = 'Escrow protected (INR)';

  // Satisfaction needs 5+ reviews before an average means anything; below that
  // the honest answer is "new", not a fake percentage or a broken dash.
  const reviews = file.totalReviews ?? 0;
  const sat = file.avgSatisfactionPercent;
  const satValue = reviews >= 5 && sat !== null && sat !== undefined ? formatPercent(Number(sat)) : 'New';
  const satLabel =
    reviews >= 5 ? 'Satisfaction' : `Satisfaction — ${reviews === 0 ? 'no ratings yet' : `${reviews}/5 ratings`}`;

  const countries = file.countries;
  const countriesValue = countries === null || countries === undefined ? '—' : Number(countries).toLocaleString('en-US');

  return [
    { value: users, label: usersLabel },
    { value: paymentsValue, label: paymentsLabel },
    { value: satValue, label: satLabel },
    { value: countriesValue, label: 'Countries with members' },
  ];
}

const LOADING_CARDS: AboutStatCard[] = [
  { value: '…', label: 'Loading…' },
  { value: '…', label: 'Loading…' },
  { value: '…', label: 'Loading…' },
];

/** Raw live values (not formatted) so other UI (e.g. the live code terminal) can inject real numbers. */
export type AboutMetricsRaw = {
  members: number | null;
  escrowInr: number | null;
  satisfactionPercent: number | null;
  totalReviews: number | null;
  countries: number | null;
  /** When these numbers were last pulled from the database (shown as freshness). */
  syncedAt: Date | null;
};

const EMPTY_RAW: AboutMetricsRaw = {
  members: null,
  escrowInr: null,
  satisfactionPercent: null,
  totalReviews: null,
  countries: null,
  syncedAt: null,
};

export function useAboutPageMetrics() {
  const [stats, setStats] = useState<AboutStatCard[]>(LOADING_CARDS);
  const [ready, setReady] = useState(false);
  const [raw, setRaw] = useState<AboutMetricsRaw>(EMPTY_RAW);

  const refresh = useCallback(async () => {
    // One source of truth for every number, including members: the RPC's
    // memberCount is a profiles⋈auth.users count, so an orphaned profile (auth
    // row gone) can never inflate the public member card.
    const file = await loadMetricsFile();
    const memberCount = file.memberCount ?? null;
    setStats(buildCards(memberCount, file));
    setRaw({
      members: memberCount,
      escrowInr: file.totalEscrowInr ?? null,
      satisfactionPercent: file.avgSatisfactionPercent ?? null,
      totalReviews: file.totalReviews ?? null,
      countries: file.countries ?? null,
      syncedAt: new Date(),
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

    // Every number on this page has a live source: a signup changes the member
    // count, a new review changes satisfaction. Subscribe to those two so the
    // panel updates within seconds instead of waiting for the 60s poll.
    //
    // Escrow is deliberately NOT subscribed: its RLS policy allows only the two
    // contract parties, so a public/marketing visitor would never receive an
    // event. The secured total still stays current via the poll and the
    // per-cycle refresh (LiveCodeTerminal onCycle), which covers the release /
    // refund transitions that actually move it.
    const channel = supabase
      .channel(uniqueChannelName('about-page-live-metrics'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => {
          void refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reviews' },
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
