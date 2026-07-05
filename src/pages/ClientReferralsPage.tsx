import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Bell, ClipboardCheck, Copy, MailCheck, ShieldCheck, Sparkles, Trophy, Zap,  } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useReferralsData, shareReferralLink } from '../hooks/useReferralsData';

function tierFromCount(count: number) {
  if (count >= 25) return { label: 'Elite', next: null, progress: 100, target: 25 };
  if (count >= 10) return { label: 'Pro', next: 'Elite', progress: Math.round(((count - 10) / 15) * 100), target: 25, remaining: 25 - count };
  return { label: 'Seed', next: 'Pro', progress: Math.round((count / 10) * 100), target: 10, remaining: 10 - count };
}

export function ClientReferralsPage() {
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const referralCode = user?.referralCode || '…';
  const { referralStats, referrals, leaders, loading, referralLink } = useReferralsData(user?.id, user?.referralCode, user?.role);

  const totalReferrals = referralStats?.total_referrals ?? referrals.length;
  const tier = tierFromCount(totalReferrals);
  const myRank = leaders.find((l) => l.isYou)?.rank;

  const handleCopy = () => {
    const text = referralLink || referralCode;
    if (!text || text === '…') return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
        </div>
      )}
      {/* Hero: Referral Link & Tier */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] border border-slate-100 shadow-[0_10px_40px_-10px_rgba(16,185,129,0.12)] relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4">Share Your Link</h3>
            <div className="flex flex-col sm:flex-row items-stretch gap-3 mb-8">
              <div className="flex-1 bg-slate-50 px-5 py-3.5 rounded-2xl border border-slate-200 flex items-center justify-between font-mono text-lg font-bold text-slate-800">
                {referralCode}
                <button
                  onClick={handleCopy}
                  className="text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  {copied ? (
                    <span className="text-xs font-bold">Copied!</span>
                  ) : (
                    <Copy className="w-5 h-5" />
                  )}
                </button>
              </div>
              <button
                onClick={handleCopy}
                className="px-8 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20"
              >
                {copied ? 'Copied!' : 'Copy Link'}
              </button>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => referralLink && shareReferralLink(referralLink, 'linkedin')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all text-sm font-medium border border-slate-200"
              >
                <svg className="w-5 h-5" fill="#0A66C2" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
                LinkedIn
              </button>
              <button
                type="button"
                onClick={() => referralLink && shareReferralLink(referralLink, 'email')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all text-sm font-medium border border-slate-200"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#4285F4" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Email
              </button>
              <button
                type="button"
                onClick={() => referralLink && shareReferralLink(referralLink, 'whatsapp')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all text-sm font-medium border border-slate-200"
              >
                <svg className="w-5 h-5" fill="#25D366" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
                WhatsApp
              </button>
            </div>
          </div>
          <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl"></div>
        </div>

        {/* Level Progress */}
        <div className="bg-slate-900 rounded-[2rem] p-8 text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-lg font-bold">Your Tier Status</h3>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 uppercase">{tier.label} Level</span>
            </div>
            <p className="text-xs text-slate-400">
              You've referred <span className="text-white font-bold">{totalReferrals} clients</span> so far.
            </p>
          </div>

          <div className="my-8">
            <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-2 uppercase tracking-widest">
              <span>Pro (10)</span>
              <span className="text-emerald-400">Elite (25)</span>
            </div>
            <div className="h-3 bg-slate-800 rounded-full overflow-hidden relative">
              <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${tier.progress}%` }} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
              <Award className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-[11px] text-slate-300">
              {tier.next ? (
                <>Get <span className="font-bold text-white">{tier.remaining} more</span> to unlock {tier.next} tier perks.</>
              ) : (
                <>You've reached Elite — VIP talent pools & badge unlocked.</>
              )}
            </p>
          </div>
        </div>
      </section>

      {/* Benefits: Hiring Experience Rewards */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-display text-xl font-bold">Referral Benefits</h3>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Referral Engine</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-emerald-100 transition-all group">
            <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-5 group-hover:scale-110 transition-transform">
              <Zap className="w-6 h-6" />
            </div>
            <h4 className="font-bold mb-2">Faster AI Matching</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Referral tiers boost your project processing speed. High-tier clients get matched in{' '}
              <span className="font-bold text-emerald-600">under 15 seconds</span>.
            </p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-emerald-100 transition-all group">
            <div className="h-12 w-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-600 mb-5 group-hover:scale-110 transition-transform">
              <Sparkles className="w-6 h-6" />
            </div>
            <h4 className="font-bold mb-2">Better Recommendations</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Unlock deeper talent analytics. See only the{' '}
              <span className="font-bold text-orange-600">Top 1%</span> of freelancers who match your exact stack and culture.
            </p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-emerald-100 transition-all group">
            <div className="h-12 w-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white mb-5 group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h4 className="font-bold mb-2">Trusted Client Badge</h4>
            <p className="text-sm text-slate-500 leading-relaxed">
              Higher tiers get the "Elite Client" badge, increasing freelancer acceptance rates by up to{' '}
              <span className="font-bold text-slate-900">35%</span>.
            </p>
          </div>
        </div>
      </section>

      {/* Middle Row: Validation & Active Stats */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 bg-white rounded-[2rem] p-8 border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display text-lg font-bold">Referral Validation Rules</h3>
            <div className="flex items-center gap-1.5 py-1 px-3 bg-slate-50 rounded-lg">
              <Bell className="text-orange-500 text-sm w-4 h-4" />
              <span className="text-[10px] font-bold text-slate-400 uppercase">Anti-Spam active</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <ul className="space-y-6">
              <li className="flex items-start gap-4">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <MailCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold">Email Verification</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    The referred business account must be fully verified via corporate email.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-4">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold">Post First Project</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Referral only counts once the new client posts a valid project with defined budget.
                  </p>
                </div>
              </li>
            </ul>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
              <p className="text-[11px] font-bold text-slate-400 uppercase mb-4 tracking-widest">Why no cash?</p>
              <p className="text-xs text-slate-600 leading-relaxed mb-4">
                We believe high-quality ecosystems are built on shared trust. Instead of cash, we provide the
                infrastructure for you to hire faster and better than your competition.
              </p>
              <div className="flex items-center gap-2 text-emerald-600">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs font-bold">Quality over Quantity</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Referrers Leaderboard */}
        <aside className="bg-white rounded-[2rem] p-8 border border-slate-100">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-display text-lg font-bold">Top Clients</h3>
            <Trophy className="w-6 h-6 text-orange-500" />
          </div>

          <div className="space-y-1">
            {leaders.length === 0 ? (
              <p className="text-sm text-slate-500 py-4">No leaderboard data yet — be the first to refer clients.</p>
            ) : (
              leaders.map((leader) => (
              <div
                key={leader.name}
                className={`flex items-center justify-between p-3 rounded-2xl ${
                  leader.rank === 1
                    ? 'bg-emerald-50 border border-emerald-100'
                    : leader.isYou
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-50/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-6 w-6 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      leader.rank === 1
                        ? 'bg-emerald-600 text-white'
                        : leader.isYou
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {leader.rank}
                  </span>
                  <div className="h-8 w-8 rounded-lg bg-white overflow-hidden p-1 border border-slate-200">
                    <img
                      src={`https://api.dicebear.com/7.x/initials/svg?seed=${leader.name}`}
                      alt={leader.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <span className={`text-sm font-bold ${leader.isYou ? 'text-white' : leader.rank === 1 ? 'text-slate-900' : 'text-slate-600'}`}>
                    {leader.name}{leader.isYou ? ' (You)' : ''}
                  </span>
                </div>
                <span
                  className={`text-xs font-bold ${
                    leader.isYou ? 'text-emerald-400' : leader.rank === 1 ? 'text-emerald-600' : 'text-slate-500'
                  }`}
                >
                  {leader.refs} Ref
                </span>
              </div>
            ))
            )}

            {myRank && !leaders.some((l) => l.isYou) && (
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900 text-white mt-4">
                <div className="flex items-center gap-3">
                  <span className="h-6 w-6 rounded-full bg-slate-700 text-white text-[10px] font-bold flex items-center justify-center">
                    {myRank}
                  </span>
                  <span className="text-sm font-bold">{user?.name || 'You'} (You)</span>
                </div>
                <span className="text-xs font-bold text-emerald-400">{totalReferrals} Ref</span>
              </div>
            )}
          </div>

          <Link
            to="/client/referrals"
            className="block w-full mt-8 py-3 bg-slate-50 rounded-xl text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-all"
          >
            Live Rankings
          </Link>
        </aside>
      </section>
    </div>
  );
}
