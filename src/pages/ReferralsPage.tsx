import { useState } from 'react';
import {
  Award,
  CheckCircle,
  Copy,
  Cpu,
  Crown,
  Eye,
  Flame,
  Leaf,
  ShieldAlert,
  Sprout,
  Trophy,
  UserX,
} from 'lucide-react';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { Pagination } from '../components/Pagination';
import { useAuth } from '../context/AuthContext';
import { useReferralsData } from '../hooks/useReferralsData';

export function ReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const referralCode = user?.referralCode || '…';
  const { referralStats, referrals, leaders, loading, referralLink } = useReferralsData(
    user?.id,
    user?.referralCode,
    user?.role
  );

  const handleCopy = () => {
    const text = referralLink || referralCode;
    if (!text || text === '…') return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const userEntry = leaders.find(l => l.isYou);

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
        text: 'text-[9px] font-bold text-emerald-400',
      };
    } else if (isCompleted) {
      return {
        container: 'text-center opacity-80',
        iconContainer: 'h-8 w-8 mx-auto rounded-lg bg-slate-800 text-slate-300 flex items-center justify-center mb-1',
        text: 'text-[9px] font-bold text-slate-300',
      };
    } else {
      return {
        container: `text-center ${tier === 'Elite' ? 'opacity-20' : 'opacity-40'}`,
        iconContainer: 'h-8 w-8 mx-auto rounded-lg bg-slate-800 text-slate-500 flex items-center justify-center mb-1',
        text: 'text-[9px] font-bold text-slate-500',
      };
    }
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {/* Hero: Referral Stats & Code */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-[0_10px_40px_-10px_rgba(16,185,129,0.15)] relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
              <div className="space-y-1">
                <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest">Your Referral Link</h3>
                <div className="flex items-center gap-2 mt-2">
                  <div className="bg-slate-50 px-5 py-3 rounded-2xl border border-slate-200 font-mono text-lg font-bold text-slate-700">
                    {referralCode}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="h-[52px] w-[52px] flex items-center justify-center bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
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
                <button className="h-12 w-12 flex items-center justify-center rounded-2xl bg-[#1DA1F2]/10 text-[#1DA1F2] hover:bg-[#1DA1F2] hover:text-white transition-all">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z" />
                  </svg>
                </button>
                <button className="h-12 w-12 flex items-center justify-center rounded-2xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366] hover:text-white transition-all">
                  <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </button>
                <button className="h-12 w-12 flex items-center justify-center rounded-2xl bg-emerald-100 text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div>
                <p className="text-slate-400 text-[11px] font-bold uppercase">Total Referrals</p>
                <p className="text-3xl font-bold mt-1">{referralStats?.total_referrals || 0}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[11px] font-bold uppercase">Valid Referrals</p>
                <p className="text-3xl font-bold mt-1 text-emerald-600">{referralStats?.valid_referrals || 0}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[11px] font-bold uppercase">Points</p>
                <p className="text-3xl font-bold mt-1">{referralStats?.points || 0}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[11px] font-bold uppercase">Level</p>
                <p className="text-3xl font-bold mt-1 text-orange-500">{referralStats?.level || 1}</p>
              </div>
            </div>
          </div>
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl"></div>
        </div>

        {/* Level System */}
        <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white flex flex-col justify-between">
          <div>
            <h3 className="font-display text-xl font-bold mb-1">Level Up</h3>
            <p className="text-xs text-slate-400">Reach 25 referrals to become an Elite Referrer.</p>
          </div>

          <div className="space-y-6 my-8">
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

          <div className="grid grid-cols-4 gap-2">
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

      {/* Rewards & Validation */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-8">
          {/* Rewards Grid */}
          <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-display text-xl font-bold">Opportunity Rewards</h3>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cashless Program</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-emerald-50/50 rounded-3xl border border-emerald-100">
                <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center mb-4">
                  <Cpu className="w-5 h-5" />
                </div>
                <h4 className="font-bold mb-2">AI Match Priority</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Your profile is processed first by the Growlancer matching engine for all relevant projects.</p>
              </div>
              <div className="p-6 bg-orange-50/50 rounded-3xl border border-orange-100">
                <div className="h-10 w-10 rounded-xl bg-orange-500 text-white flex items-center justify-center mb-4">
                  <Eye className="w-5 h-5" />
                </div>
                <h4 className="font-bold mb-2">Project Visibility</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Referrals boost your profile to the top of client search results and project shortlists.</p>
              </div>
              <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200">
                <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-4">
                  <Award className="w-5 h-5" />
                </div>
                <h4 className="font-bold mb-2">Exclusive Badges</h4>
                <p className="text-xs text-slate-500 leading-relaxed">Elite status badge visible to all clients, signaling platform seniority and trust.</p>
              </div>
            </div>
          </section>

          {/* Validation & Anti-Spam */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100">
              <h3 className="font-display text-lg font-bold mb-6">Validation Rules</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3 text-sm">
                  <CheckCircle className="text-emerald-500 mt-0.5 w-5 h-5" />
                  <div>
                    <p className="font-bold">Email Verified</p>
                    <p className="text-[11px] text-slate-400">The referred user must confirm their email.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <CheckCircle className="text-emerald-500 mt-0.5 w-5 h-5" />
                  <div>
                    <p className="font-bold">Profile 100% Complete</p>
                    <p className="text-[11px] text-slate-400">Bio, skills, and portfolio must be filled.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 text-sm">
                  <CheckCircle className="text-emerald-500 mt-0.5 w-5 h-5" />
                  <div>
                    <p className="font-bold">First Activity Done</p>
                    <p className="text-[11px] text-slate-400">Referral counts after their first proposal.</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-red-50 p-8 rounded-[2.5rem] border border-red-100">
              <h3 className="font-display text-lg font-bold text-red-900 mb-6">Anti-Spam Policy</h3>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <ShieldAlert className="text-red-600 w-6 h-6 shrink-0" />
                  <p className="text-xs text-red-800 leading-relaxed">Self-referrals or creating multiple accounts to farm referrals will result in permanent suspension of the primary account.</p>
                </div>
                <div className="flex gap-3">
                  <UserX className="text-red-600 w-6 h-6 shrink-0" />
                  <p className="text-xs text-red-800 leading-relaxed">Duplicate emails or bot-like registration patterns are automatically flagged by our AI security engine.</p>
                </div>
                <div className="bg-red-600 text-white p-4 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-center">
                  Zero Tolerance Policy
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Leaderboard */}
        <aside className="bg-white rounded-[2.5rem] p-8 border border-slate-100 h-fit">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display text-xl font-bold">Top Referrers</h3>
            <div className="h-8 w-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
              <Trophy className="w-5 h-5" />
            </div>
          </div>

          <div className="space-y-1">
            {leaders.map((leader) => (
              <div
                key={leader.rank}
                className={`flex items-center justify-between p-3 rounded-2xl ${
                  leader.rank === 1
                    ? 'bg-emerald-50 ring-1 ring-emerald-100'
                    : leader.rank % 2 === 0
                      ? 'bg-slate-50/50'
                      : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-6 w-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
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
                    <div className="h-8 w-8 rounded-lg overflow-hidden">
                      <img
                        src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${leader.avatar}`}
                        alt={leader.name}
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
                  {leader.refs} Ref
                </span>
              </div>
            ))}

            {/* User's position — drawn from DB via useReferralsData */}
            {userEntry && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-orange-50 ring-1 ring-orange-200 mt-4">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {userEntry.rank}
                  </span>
                  <span className="text-sm font-bold">You</span>
                </div>
                <span className="text-xs font-bold text-orange-600">{userEntry.refs} Ref</span>
              </div>
            )}
          </div>

          <button className="w-full mt-8 py-3 bg-slate-50 rounded-2xl text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">
            Full Leaderboard
          </button>
        </aside>
      </div>

      {/* Your Referrals — always visible */}
      <section className="bg-white rounded-[2.5rem] p-8 border border-slate-100">
        <div className="flex items-center justify-between mb-6">
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
                  className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      referral.status === 'active' ? 'bg-emerald-500' : 'bg-orange-400'
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
                      referral.status === 'active' 
                        ? 'bg-emerald-100 text-emerald-700' 
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
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Copy className="w-8 h-8 text-slate-300" />
            </div>
            <h4 className="text-lg font-semibold text-slate-900 mb-2">No referrals yet</h4>
            <p className="text-slate-500 max-w-md mx-auto text-sm">
              Share your unique referral link with other freelancers. When they join and complete their first project, they'll be listed here and you'll earn rewards.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
