import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, uniqueChannelName } from '../lib/supabase';
import { fetchGrowCoinState, GROW_COIN_EMPTY_STATE, type GrowCoinState } from '../lib/growCoins';

/**
 * Grow Coin balance for headers, the wallet and the referral pages.
 *
 * Reads the RPC (never a stored column), refreshes when the tab regains focus
 * — a bonus can land while this tab is in the background — and subscribes to
 * the user's own ledger rows when realtime is available. A failure is surfaced
 * through `error`; it is never rendered as a legitimate zero balance.
 */
export function useGrowCoinBalance(userId?: string) {
  const [state, setState] = useState<GrowCoinState>(GROW_COIN_EMPTY_STATE);
  const [loading, setLoading] = useState<boolean>(Boolean(userId));
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(GROW_COIN_EMPTY_STATE);
      setLoading(false);
      return;
    }
    try {
      const next = await fetchGrowCoinState(userId);
      if (!mounted.current) return;
      setState(next);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      console.error('[useGrowCoinBalance]', e);
      setError(e instanceof Error ? e.message : 'Could not load Grow Coins');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    mounted.current = true;
    void refresh();

    if (!userId) return;

    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);

    const channel = supabase
      .channel(uniqueChannelName('grow-coins', userId))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'grow_coin_ledger', filter: `user_id=eq.${userId}` },
        () => void refresh()
      )
      .subscribe();

    return () => {
      mounted.current = false;
      window.removeEventListener('focus', onFocus);
      void supabase.removeChannel(channel);
    };
  }, [userId, refresh]);

  return { state, loading, error, refresh };
}
