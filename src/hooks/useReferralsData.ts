import { useEffect, useState, useCallback } from 'react';
import { supabase, realtimeChannels } from '../lib/supabase';
import type { Tables } from '../types/supabase';
import { useToast } from '../components/Toast';

export type ReferralLeader = {
  rank: number;
  name: string;
  refs: number;
  avatar: string | null;
  isYou: boolean;
};

export function shareReferralLink(link: string, platform: 'linkedin' | 'twitter' | 'email' | 'whatsapp') {
  const referralUrl = link.startsWith('http') ? link : `${window.location.origin}/signup?ref=${encodeURIComponent(link)}`;
  const url = encodeURIComponent(referralUrl);
  
  const subject = encodeURIComponent('Join me on Growlancer – AI-Powered Freelancing Marketplace');
  
  const body = encodeURIComponent(
    `Hey! 👋\n\nI've been using Growlancer to find and manage freelance projects with AI-powered matching and secure escrow payments. It's been a game-changer for my workflow.\n\nUse my referral link below to join and we both earn rewards:\n${referralUrl}\n\nWhat you get:\n✅ AI-powered project matching\n✅ Secure escrow payments\n✅ Real-time collaboration tools\n✅ Professional freelancer/client community\n\nSee you there! 🚀`
  );
  
  const shortText = encodeURIComponent(
    `🚀 Join me on Growlancer – the AI-powered freelancing marketplace! Get secure escrow payments, smart project matching, and more. Use my referral link: ${referralUrl}`
  );

  if (platform === 'linkedin') {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${url}`, '_blank', 'noopener');
  } else if (platform === 'twitter') {
    window.open(`https://twitter.com/intent/tweet?text=${shortText}`, '_blank', 'noopener');
  } else if (platform === 'whatsapp') {
    window.open(`https://api.whatsapp.com/send?text=${shortText}`, '_blank', 'noopener');
  } else {
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }
}

export function useReferralsData(userId?: string, referralCode?: string, userRole?: string) {
  const toast = useToast();
  const [referralStats, setReferralStats] = useState<Tables<'referral_stats'> | null>(null);
  const [referrals, setReferrals] = useState<Tables<'referrals'>[]>([]);
  const [leaders, setLeaders] = useState<ReferralLeader[]>([]);
  const [loading, setLoading] = useState(true);

  const referralLink =
    referralCode && referralCode !== '…' && referralCode !== 'Loading...'
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?ref=${encodeURIComponent(referralCode)}`
      : '';

  const refresh = useCallback(async () => {
    // The leaderboard is platform-wide now; role is kept for call-site
    // compatibility (both referral pages pass it).
    void userRole;
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const [{ data: statsData }, { data: referralsData }, { data: board }] = await Promise.all([
        supabase.from('referral_stats').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('referrals').select('*').eq('referrer_id', userId).order('created_at', { ascending: false }),
        // Public leaderboard RPC: counts PAID referral bonuses (i.e. referrals
        // that reached real engagement), not signups, and returns only the
        // display-safe fields. It can never leak email/phone/balances.
        (supabase.rpc as any)('get_grow_coin_leaderboard', { p_limit: 10 }),
      ]);

      if (statsData) setReferralStats(statsData);
      setReferrals(referralsData || []);

      const mapped: ReferralLeader[] = (board || []).map((row: any) => ({
        rank: Number(row.rank) || 0,
        name: String(row.display_name || 'Growlancer member'),
        refs: Number(row.referrals) || 0,
        avatar: (row.avatar as string | null) ?? null,
        isYou: row.is_self === true,
      }));

      // If the signed-in user is outside the top 10, keep one honest row with
      // their real successful-referral count so the page never hides them.
      if (!mapped.some((l) => l.isYou) && statsData) {
        const yourRefs = Number(statsData.valid_referrals) || 0;
        if (yourRefs > 0) {
          mapped.push({
            rank: mapped.length + 1,
            name: 'You',
            refs: yourRefs,
            avatar: null,
            isYou: true,
          });
        }
      }

      setLeaders(mapped.sort((a, b) => b.refs - a.refs).map((l, i) => ({ ...l, rank: i + 1 })));
    } catch (e) {
      console.error('[useReferralsData]', e);
      toast.error('Error', 'Failed to load referral data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [userId, userRole, toast]);

  useEffect(() => {
    void refresh();
    if (!userId) return;

    const statsCh = realtimeChannels
      .referralStats(`referral-stats-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referral_stats', filter: `user_id=eq.${userId}` },
        () => void refresh()
      )
      .subscribe();

    const refCh = realtimeChannels
      .referrals(`referrals-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'referrals', filter: `referrer_id=eq.${userId}` },
        () => void refresh()
      )
      .subscribe();

    return () => {
      void statsCh.unsubscribe();
      void refCh.unsubscribe();
    };
  }, [userId, refresh]);

  return { referralStats, referrals, leaders, loading, referralLink, refresh };
}
