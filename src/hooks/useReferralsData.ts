import { useEffect, useState, useCallback } from 'react';
import { supabase, realtimeChannels } from '../lib/supabase';
import type { Tables } from '../types/supabase';

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
  const [referralStats, setReferralStats] = useState<Tables<'referral_stats'> | null>(null);
  const [referrals, setReferrals] = useState<Tables<'referrals'>[]>([]);
  const [leaders, setLeaders] = useState<ReferralLeader[]>([]);
  const [loading, setLoading] = useState(true);

  const referralLink =
    referralCode && referralCode !== '…' && referralCode !== 'Loading...'
      ? `${typeof window !== 'undefined' ? window.location.origin : ''}/signup?ref=${encodeURIComponent(referralCode)}`
      : '';

  const refresh = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      const [{ data: statsData }, { data: referralsData }, { data: board }] = await Promise.all([
        supabase.from('referral_stats').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('referrals').select('*').eq('referrer_id', userId).order('created_at', { ascending: false }),
        // Use referral_stats for leaderboard — backed by a DB trigger that updates in real-time
        // Fake data was reset; now only real referral activity drives the counts
        supabase
          .from('referral_stats')
          .select('total_referrals, user_id, profiles!referral_stats_user_id_fkey(name, avatar, deleted_at, role)')
          .gt('total_referrals', 0)
          .order('total_referrals', { ascending: false })
          .limit(10),
      ]);

      if (statsData) setReferralStats(statsData);
      setReferrals(referralsData || []);

      const mapped: ReferralLeader[] = (board || [])
        .filter((row) => {
          const profile = row.profiles as { name?: string; avatar?: string | null; deleted_at?: string | null; role?: string } | null;
          // Skip orphaned rows (hard-deleted profile — row removed), soft-deleted users (deleted_at set),
          // and profiles without a valid name (orphaned from auth deletion)
          if (!profile) return false;
          if (profile.deleted_at) return false;
          if (!profile.name || profile.name.trim() === '') return false;
          // If a role filter is provided, only show users with the same role
          if (userRole && profile.role && profile.role !== userRole) return false;
          return true;
        })
        .map((row, index) => {
          const profile = row.profiles as { name?: string; avatar?: string | null; role?: string } | null;
          return {
            rank: index + 1,
            name: profile?.name || 'Member',
            refs: row.total_referrals ?? 0,
            avatar: profile?.avatar ?? null,
            isYou: row.user_id === userId,
          };
        });

      if (!mapped.some((l) => l.isYou) && statsData) {
        const yourRefs = statsData.total_referrals ?? referralsData?.length ?? 0;
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
    } finally {
      setLoading(false);
    }
  }, [userId]);

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
