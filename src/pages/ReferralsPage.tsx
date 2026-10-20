import { useState } from 'react';
import {
  Award,
  CheckCircle,
  Copy,
  Crown,
  Flame,
  Leaf,
  Mail,
  ShieldAlert,
  Sparkles,
  Sprout,
  Trophy,
  UserX,
  Wallet,
} from 'lucide-react';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { Pagination } from '../components/Pagination';
import { GrowCoinIcon } from '../components/GrowCoinIcon';
import { ConfirmModal } from '../components/ConfirmModal';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import { useGrowCoinBalance } from '../hooks/useGrowCoinBalance';
import { useReferralsData } from '../hooks/useReferralsData';
import {
  GROW_COIN,
  formatCoinAmount,
  newCoinRequestKey,
  redeemGrowCoinsForCash,
  redeemGrowCoinsForPremium,
} from '../lib/growCoins';

export function ReferralsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const [redeemTarget, setRedeemTarget] = useState<'cash' | 'premium' | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const pageSize = 5;
  const referralCode = user?.referralCode || '…';
  const { referralStats, referrals, leaders, loading } = useReferralsData(
    user?.id,
    user?.referralCode,
    user?.role
  );
  const { state: coins, loading: coinsLoading, error: coinsError, refresh: refreshCoins } = useGrowCoinBalance(user?.id);

  const canRedeem = coins.available >= GROW_COIN.minRedemption;
  const progressToFirstRedemption = Math.min(
    Math.round((coins.available / GROW_COIN.minRedemption) * 100),
    100
  );

  const confirmRedemption = async () => {
    if (!redeemTarget) return;
    setRedeeming(true);
    try {
      if (redeemTarget === 'cash') {
        // Redeem the full 100-coin step (or the whole balance if it is larger)
        // so the action always leaves a usable amount and never strands coins.
        const amount = coins.available;
        const result = await redeemGrowCoinsForCash(amount, newCoinRequestKey());
        toast.success(
          'Coins redeemed',
          `${amount} Grow Coins were added to your wallet as ₹${Number(result?.credited_inr ?? amount).toLocaleString('en-IN')}. Withdraw it with your normal payout method.`
        );
      } else {
        const result = await redeemGrowCoinsForPremium(newCoinRequestKey());
        toast.success(
          'Premium unlocked',
          `${result?.coins ?? GROW_COIN.premiumCost} Grow Coins paid for one month of Premium.`
        );
      }
      await refreshCoins();
      setRedeemTarget(null);
    } catch (err) {
      console.error('[ReferralsPage] coin redemption failed:', err);
      toast.error('Redemption failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setRedeeming(false);
    }
  };

  const handleCopy = () => {
    // 📋 Copy ONLY the referral code — never the full link
    const text = referralCode;
    if (!text || text === '…') return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // 🔗 Share actions — the referral code + site URL (Section-1B/C: every
  // icon button gets a real, label-matching action + an accessible name).
  const referralMessage = `Join me on Growlancer — use my referral code ${referralCode} when you sign up! `;
  const shareTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(referralMessage)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };
  const shareWhatsapp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(referralMessage)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };
  const shareEmail = () => {
    window.location.href = `mailto:?subject=${encodeURIComponent(
      'Join me on Growlancer'
    )}&body=${encodeURIComponent(referralMessage)}`;
  };

  const validRefs = referralStats?.valid_referrals || 0;
  
  let currentLevel: 'Starter' | 'Growth' | 'Pro' | 'Elite' = 'Starter';
  if (validRefs >= 25) {
    currentLevel = 'Elite';
  } else if (validRefs >= 10) {
    currentLevel = 'Pro';
  } else if (validRefs >= 3) {
    currentLevel = 'Growth';
  }

  // Calculate percentage and positioning
  let progressPercent = 0;
  if (validRefs < 3) {
    progressPercent = (validRefs / 3) * 25;
  } else if (validRefs < 10) {
    progressPercent = 25 + ((validRefs - 3) / 7) * 25;
  } else if (validRefs < 25) {
    progressPercent = 50 + ((validRefs - 10) / 15) * 50;
  } else {
    progressPercent = 100;
  }

  let levelRangeLeft = 'PRO (10-24)';
  let levelRangeRight = 'ELITE (25+)';
  let levelLeftColor = 'text-slate-500';
  let levelRightColor = 'text-slate-500';

  if (validRefs < 3) {
    levelRangeLeft = 'STARTER (0-2)';
    levelRangeRight = 'GROWTH (3-9)';
    levelLeftColor = 'text-emerald-400';
  } else if (validRefs < 10) {
    levelRangeLeft = 'GROWTH (3-9)';
    levelRangeRight = 'PRO (10-24)';
    levelLeftColor = 'text-emerald-400';
  } else if (validRefs < 25) {
    levelRangeLeft = 'PRO (10-24)';
    levelRangeRight = 'ELITE (25+)';
    levelLeftColor = 'text-emerald-400';
  } else {
    levelRangeLeft = 'PRO (10-24)';
    levelRangeRight = 'ELITE (25+)';
    levelRightColor = 'text-emerald-400';
  }

  const getTierStyle = (tier: 'Starter' | 'Growth' | 'Pro' | 'Elite') => {
    const isActive = currentLevel === tier;
    const tiers = ['Starter', 'Growth', 'Pro', 'Elite'];
    const currentIdx = tiers.indexOf(currentLevel);
    const tierIdx = tiers.indexOf(tier);
    const isCompleted = tierIdx < currentIdx;

    if (isActive) {
      return {
        container: 'text-center',
        iconContainer: 'h-8 w-8 mx-auto rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-1 ring-1 ring-emerald-500/50',
        text: 'text-[10px] font-bold text-emerald-400',
      };
    } else if (isCompleted) {
      return {
        container: 'text-center opacity-80',
        iconContainer: 'h-8 w-8 mx-auto rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center mb-1',
        text: 'text-[10px] font-bold text-slate-300',
      };
    } else {
      return {
        container: `text-center ${tier === 'Elite' ? 'opacity-20' : 'opacity-40'}`,
        iconContainer: 'h-8 w-8 mx-auto rounded-lg bg-slate-800 text-slate-500 flex items-center justify-center mb-1',
        text: 'text-[10px] font-bold text-slate-500',
      };
    }
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="space-y-4 pb-20 lg:pb-0">

      {/* Honest expectation setting — the #1 source of referral support tickets
          is "where are my coins?". Say the trigger plainly, before the code. */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-4 py-3">
        <GrowCoinIcon size={22} className="mt-0.5 shrink-0" />
        <p className="text-xs sm:text-sm leading-relaxed text-amber-950/85">
          <span className="font-bold">When do you get paid?</span> A referral pays{' '}
          <span className="font-bold">10 Grow Coins</span> only after your referred freelancer's{' '}
          <span className="font-bold">first project is completed</span> (or their identity verification is approved) —
          never at signup. Nothing is paid for empty or fake accounts, which is what keeps the programme honest.
          You also earn <span className="font-bold">milestones yourself</span>:{' '}
          <span className="font-bold">10 coins</span> when your own identity is verified and{' '}
          <span className="font-bold">20 coins</span> when your first project completes — each paid once, whether you work
          as a freelancer or hire as a client.
        </p>
      </div>

      {/* Hero: Referral Stats & Code */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="lg:col-span-2 bg-white p-4 rounded-[2.5rem] border border-slate-100 shadow-[0_10px_40px_-10px_rgba(16,185,129,0.15)] relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
              <div className="space-y-1">
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest">Your Referral Link</h3>
                <div className="flex items-center gap-3 mt-2">
                  <div className="bg-slate-50 px-5 py-3 rounded-xl border border-slate-200 font-mono text-lg font-bold text-slate-700">
                    {referralCode}
                  </div>
                  <button
                    onClick={handleCopy}
                    aria-label="Copy referral code"
                    className="h-[52px] w-[52px] flex items-center justify-center bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
                  >
                    {copied ? (
                      <span className="text-xs font-bold">Done!</span>
                    ) : (
                      <Copy className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={shareTwitter}
                  aria-label="Share on Twitter"
                  className="h-12 w-12 flex items-center justify-center rounded-xl bg-[#1DA1F2]/10 text-[#1DA1F2] hover:bg-[#1DA1F2] hover:text-white transition-all"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
                  </svg>
                </button>
                <button
                  onClick={shareWhatsapp}
                  aria-label="Share on WhatsApp"
                  className="h-12 w-12 flex items-center justify-center rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all"
                >
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </button>
                <button
                  onClick={shareEmail}
                  aria-label="Share via Email"
                  className="h-12 w-12 flex items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all"
                >
                  <Mail className="w-6 h-6" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase">Total Referrals</p>
                <p className="text-3xl font-bold mt-1">{referralStats?.total_referrals || 0}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase">Valid Referrals</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600">{referralStats?.valid_referrals || 0}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase">Points</p>
                <p className="text-3xl font-bold mt-1">{referralStats?.points || 0}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs font-bold uppercase">Level</p>
                <p className="text-3xl font-bold mt-1 text-orange-500">{referralStats?.level || 1}</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl"></div>
        </div>

        {/* Level System */}
        <div className="bg-slate-900 rounded-[2.5rem] p-4 text-white flex flex-col justify-between">
          <div>
            <h3 className="font-display text-xl font-bold mb-1">Level Up</h3>
            <p className="text-xs text-slate-400">Reach 25 referrals to become an Elite Referrer.</p>
          </div>

          <div className="space-y-3 my-8">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className={levelLeftColor}>{levelRangeLeft}</span>
              <span className={levelRightColor}>{levelRangeRight}</span>
            </div>
            <div className="relative">
              <div className="h-2 bg-slate-800 rounded-full w-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${progressPercent}%` }}></div>
              </div>
              <div 
                className="absolute -top-1 h-4 w-4 bg-emerald-500 rounded-full ring-4 ring-slate-900 transition-all duration-500" 
                style={{ left: `${progressPercent}%`, transform: 'translateX(-50%)' }}
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {/* Starter Tier */}
            {(() => {
              const style = getTierStyle('Starter');
              return (
                <div className={style.container}>
                  <div className={style.iconContainer}>
                    <Sprout className="w-5 h-5" />
                  </div>
                  <span className={style.text}>Starter</span>
                </div>
              );
            })()}

            {/* Growth Tier */}
            {(() => {
              const style = getTierStyle('Growth');
              return (
                <div className={style.container}>
                  <div className={style.iconContainer}>
                    <Leaf className="w-4 h-4" />
                  </div>
                  <span className={style.text}>Growth</span>
                </div>
              );
            })()}

            {/* Pro Tier */}
            {(() => {
              const style = getTierStyle('Pro');
              return (
                <div className={style.container}>
                  <div className={style.iconContainer}>
                    <Flame className="w-4 h-4" />
                  </div>
                  <span className={style.text}>Pro</span>
                </div>
              );
            })()}

            {/* Elite Tier */}
            {(() => {
              const style = getTierStyle('Elite');
              return (
                <div className={style.container}>
                  <div className={style.iconContainer}>
                    <Crown className="w-4 h-4" />
                  </div>
                  <span className={style.text}>Elite</span>
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* Grow Coins — the actual reward currency. Golden surface, deliberately
          different from the emerald referral chrome so it reads as "money". */}
      <section className="relative overflow-hidden rounded-[2.5rem] border border-amber-200/70 bg-gradient-to-br from-amber-50 via-[#FFFBF0] to-white p-5 sm:p-7 shadow-[0_18px_50px_-24px_rgba(180,130,20,0.45)]">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-300/20 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="flex items-start gap-4 sm:gap-5">
            <div className="shrink-0 rounded-2xl bg-white/70 p-2 ring-1 ring-amber-200/80 shadow-inner">
              <GrowCoinIcon size={76} title="Grow Coin" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700/80">Your Grow Coins</p>
              <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
                <p className="font-display text-4xl sm:text-5xl font-bold text-amber-950 tabular-nums leading-none">
                  {coinsLoading ? '—' : formatCoinAmount(coins.balance)}
                </p>
                <p className="text-sm font-semibold text-amber-800/70">1 coin = ₹1</p>
              </div>
              <p className="mt-2 text-sm text-amber-900/80">
                {coinsError
                  ? 'We could not load your coin balance right now. Refresh the page to try again.'
                  : coins.reserved > 0
                    ? `${formatCoinAmount(coins.available)} available · ${formatCoinAmount(coins.reserved)} held for an unpaid order`
                    : `${formatCoinAmount(coins.available)} available to redeem`}
              </p>

              {!coinsLoading && !coinsError && (
                <div className="mt-3 max-w-sm">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-amber-800/70">
                    <span>{canRedeem ? 'Redemption unlocked' : `First redemption at ${GROW_COIN.minRedemption}`}</span>
                    <span>{Math.min(coins.available, GROW_COIN.minRedemption)}/{GROW_COIN.minRedemption}</span>
                  </div>
                  <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-amber-900/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#D4AF37] to-[#F4E285] transition-all duration-500" style={{ width: `${progressToFirstRedemption}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              type="button"
              onClick={() => setRedeemTarget('cash')}
              disabled={!canRedeem || redeeming}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-900 px-5 py-3 text-sm font-bold text-amber-50 shadow-sm transition-all hover:bg-amber-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Wallet className="h-4 w-4" />
              Redeem to wallet
            </button>
            <button
              type="button"
              onClick={() => setRedeemTarget('premium')}
              disabled={coins.available < GROW_COIN.premiumCost || redeeming}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white/80 px-5 py-3 text-sm font-bold text-amber-900 transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-4 w-4" />
              Premium ({GROW_COIN.premiumCost} coins)
              </button>
          </div>
        </div>

        <p className="relative mt-4 border-t border-amber-200/70 pt-3 text-xs leading-relaxed text-amber-900/70">
          Redeeming to your wallet converts coins at ₹1 each and credits the same wallet used for escrow payouts —
          withdraw it through your normal payout method. Coins can also pay for one month of Premium instead.
          Minimum redemption is {GROW_COIN.minRedemption} coins.
        </p>
      </section>

      {/* Rewards & Validation */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 space-y-4">
          {/* Rewards Grid */}
          <section className="bg-white rounded-[2.5rem] p-4 border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-xl font-bold">Opportunity Rewards</h3>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Coin Rewards</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-2">
                  <Award className="w-5 h-5" />
                </div>
                <h4 className="font-bold mb-2">Points &amp; Levels</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Every completed referral adds 10 points and moves you up the Starter → Growth → Pro → Elite tiers.</p>
              </div>
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-100">
                <div className="h-10 w-10 rounded-xl bg-amber-600 text-white flex items-center justify-center mb-2">
                  <GrowCoinIcon size={22} />
                </div>
                <h4 className="font-bold mb-2">Grow Coins (₹ value)</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Each successful referral pays 10 Grow Coins — real ₹1-each value you can redeem to your wallet or use for Premium. Your own milestones pay too: 10 coins on verified KYC, 20 on your first completed project. Up to 20 referral bonuses per month.</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-2">
                  <Trophy className="w-5 h-5" />
                </div>
                <h4 className="font-bold mb-2">Leaderboard (no ranking boost)</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Top referrers appear on this page's leaderboard. Coins never influence search, matching or visibility — those stay 100% merit-based.</p>
              </div>
            </div>
          </section>

          {/* Validation & Anti-Spam */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-[2.5rem] border border-slate-100">
              <h3 className="font-display text-lg font-bold mb-3">Validation Rules</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-sm">
                  <CheckCircle className="text-emerald-500 mt-0.5 w-5 h-5" />
                  <div>
                    <p className="font-bold">Email Verified</p>
                    <p className="text-xs text-slate-400">The referred user must confirm their email and finish onboarding.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <CheckCircle className="text-emerald-500 mt-0.5 w-5 h-5" />
                  <div>
                    <p className="font-bold">First Project Completed</p>
                    <p className="text-xs text-slate-400">Their first contract must be completed as a freelancer — a signup alone pays nothing.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <CheckCircle className="text-emerald-500 mt-0.5 w-5 h-5" />
                  <div>
                    <p className="font-bold">Or Identity Verified</p>
                    <p className="text-xs text-slate-400">A KYC-approved referral pays the same bonus, whichever happens first.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-red-50 p-4 rounded-[2.5rem] border border-red-100">
              <h3 className="font-display text-lg font-bold text-red-900 mb-3">Anti-Spam Policy</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <ShieldAlert className="text-red-600 w-6 h-6 shrink-0" />
                  <p className="text-xs text-red-800 leading-relaxed">Self-referrals or creating multiple accounts to farm referrals will result in permanent suspension of the primary account.</p>
                </div>
                <div className="flex gap-3">
                  <UserX className="text-red-600 w-6 h-6 shrink-0" />
                  <p className="text-xs text-red-800 leading-relaxed">Duplicate emails or bot-like registration patterns are automatically flagged by our AI security engine.</p>
                </div>
                <div className="bg-red-600 text-white p-4 rounded-xl text-xs font-bold uppercase tracking-widest text-center">
                  Zero Tolerance Policy
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Leaderboard */}
        <aside className="bg-white rounded-[2.5rem] p-4 border border-slate-100 h-fit">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-display text-xl font-bold">Top Referrers</h3>
            <div className="h-8 w-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
          </div>

          <div className="space-y-1">
            {leaders.map((leader) => (
              <div
                key={leader.rank}
                className={`flex items-center justify-between p-3 rounded-xl ${
                  leader.rank === 1
                    ? 'bg-emerald-50 ring-1 ring-emerald-100'
                    : leader.rank % 2 === 0
                      ? 'bg-slate-50/50'
                      : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-6 w-6 rounded-full text-xs font-bold flex items-center justify-center ${
                      leader.rank === 1
                        ? 'bg-emerald-600 text-white'
                        : leader.rank <= 3
                          ? 'bg-slate-200 text-slate-500'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {leader.rank}
                  </span>
                  {leader.avatar ? (
                    <div className="h-8 w-8 rounded-lg overflow-hidden bg-slate-100">
                      <img
                        src={/^https?:\/\//.test(leader.avatar) ? leader.avatar : `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(leader.avatar)}`}
                        alt=""
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : null}
                  <span className={`text-sm ${leader.rank <= 3 ? 'font-bold' : 'font-medium text-slate-600'}`}>
                    {leader.name}
                  </span>
                </div>
                <span
                  className={`text-xs font-bold ${
                    leader.rank === 1 ? 'text-emerald-600' : leader.rank <= 3 ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  {leader.refs} {leader.refs === 1 ? 'referral' : 'referrals'}
                </span>
              </div>
            ))}

            {/* The user's own row is already part of `leaders` (shown with their
                real name + isYou highlight) — no duplicate "You" card. */}
          </div>

          <button className="w-full mt-8 py-3 bg-slate-50 rounded-xl text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">
            Full Leaderboard
          </button>
        </aside>
      </div>

      {/* Your Referrals — always visible */}
      <section className="bg-white rounded-[2.5rem] p-4 border border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-xl font-bold">Your Referrals</h3>
          <span className="text-sm text-slate-500">{referrals.length} total</span>
        </div>

        {referrals.length > 0 ? (
          <>
            <div className="space-y-3">
              {referrals
                .slice((page - 1) * pageSize, page * pageSize)
                .map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3.5 h-3.5 rounded-full ${
                      referral.status === 'completed' ? 'bg-emerald-500' : referral.status === 'expired' ? 'bg-slate-300' : 'bg-orange-400'
                    }`} />
                    <div>
                      <p className="font-medium text-slate-900">{referral.referred_email}</p>
                      <p className="text-xs text-slate-500">
                        {new Date(referral.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${
                      referral.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : referral.status === 'expired'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-orange-100 text-orange-700'
                    }`}>
                      {referral.status}
                    </span>
                    {referral.bonus_claimed && (
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              currentPage={page}
              totalItems={referrals.length}
              pageSize={pageSize}
              onPageChange={setPage}
            />
          </>
        ) : (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-2">
              <Copy className="w-8 h-8 text-slate-300" />
            </div>
            <h4 className="text-lg font-semibold text-slate-900 mb-2">No referrals yet</h4>
            <p className="text-slate-500 max-w-md mx-auto text-sm">
              Share your unique referral link with other freelancers. When they join and complete their first project, they'll be listed here and you'll earn rewards.
            </p>
          </div>
        )}
      </section>

      <ConfirmModal
        isOpen={redeemTarget !== null}
        onClose={() => (redeeming ? undefined : setRedeemTarget(null))}
        onConfirm={confirmRedemption}
        loading={redeeming}
        variant="warning"
        title={redeemTarget === 'premium' ? 'Use coins for Premium?' : 'Redeem Grow Coins to your wallet?'}
        message={
          redeemTarget === 'premium'
            ? `${coins.available} coins available. One month of Premium costs ${GROW_COIN.premiumCost} coins and is applied immediately — the same Premium a card payment would unlock.`
            : `This converts ${coins.available} Grow Coins into ₹${coins.available.toLocaleString('en-IN')} in your wallet. The coins are debited once and cannot be reversed.`
        }
        confirmLabel={redeemTarget === 'premium' ? 'Unlock Premium' : 'Redeem coins'}
        cancelLabel="Not now"
      />
    </div>
  );
}
