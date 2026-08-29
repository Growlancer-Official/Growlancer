import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Award, BarChart3, BrainCircuit, CheckCircle2, Code, Lock, Palette, Search, Server, Sparkles, TrendingUp,  } from 'lucide-react';
import { InfoTip } from '../../components/InfoTip';
import { PageSkeleton } from '../../components/PageSkeleton';
import { useAuth } from '../../context/AuthContext';
import { realtimeChannels } from '../../lib/supabase';
import { skillCertificationService, CERTIFICATION_LEVELS, type SkillCertification, type SkillTest } from '../../lib/skillCertifications';
import { safeLower } from '../../utils/date';

export function SkillCertificationsPage() {
  const { user } = useAuth();
  const [certifications, setCertifications] = useState<SkillCertification[]>([]);
  const [tests, setTests] = useState<(SkillTest & { userLevel?: string; locked?: boolean })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'available' | 'earned'>('available');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    // Show the FULL catalog of skill assessments — every skill has its test
    // available in real time (already-earned ones appear locked/passed).
    const [certs, availableTests] = await Promise.all([
      skillCertificationService.getUserCertifications(user.id),
      skillCertificationService.getAvailableTests(user.id),
    ]);

    setCertifications(certs);
    setTests(availableTests);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void fetchData();

    // Real-time: update instantly when a certification is earned or updated
    const channel = realtimeChannels.profiles(`certifications:${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'skill_certifications',
        filter: `user_id=eq.${user.id}`,
      }, () => { void fetchData(); })
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [user, fetchData]);

  const filteredTests = tests.filter((t) =>
    safeLower(t.skill).includes(safeLower(searchQuery)) ||
    safeLower(t.category).includes(safeLower(searchQuery))
  );

  const filteredCerts = certifications.filter((c) =>
    safeLower(c.skill).includes(safeLower(searchQuery))
  );

  const getSkillIcon = (skill: unknown) => {
    const s = safeLower(skill);
    if (s.includes('react') || s.includes('javascript') || s.includes('typescript') || s.includes('html') || s.includes('css')) return Code;
    if (s.includes('design') || s.includes('ui') || s.includes('ux') || s.includes('figma')) return Palette;
    if (s.includes('node') || s.includes('python') || s.includes('java') || s.includes('go') || s.includes('rust')) return Server;
    if (s.includes('seo') || s.includes('marketing')) return Search;
    if (s.includes('data') || s.includes('analytics') || s.includes('sql')) return BarChart3;
    return BrainCircuit;
  };

  if (loading) {
    return <PageSkeleton />;;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-1.5">Skill Certifications <InfoTip text="Take skill tests to earn verified badges and build trust." /></h1>
          <p className="text-slate-500 mt-1">Earn verified badges to showcase your expertise to clients</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100">
          <Award className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-bold text-emerald-700">{certifications.length} Badges Earned</span>
        </div>
      </div>

      {/* Learn & Earn — mature platform promise */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-xl p-5 text-white shadow-sm">
        <div className="flex items-start gap-1.5">
          <div className="w-7 h-7 bg-white/15 rounded-xl flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-sm">Learn. Get Certified. Earn More.</p>
            <p className="text-xs text-emerald-50 leading-relaxed">
              Growlancer is a mature, trusted marketplace. Pass our skill assessments to earn verified badges that
              appear next to your name and in your workspace — clients see your proven expertise, trust grows, and
              quality work means fewer disputes and refunds for everyone. Real skills. Verified badges. Fair work.
            </p>
          </div>
        </div>
      </div>

      {/* Test rules — plain-language */}
      <InfoTip title="Test rules — read before you start" text="Copy-paste, tab-switching and other cheating are prohibited and monitored. Fail a test and you can retake it after 24 hours; cheat once and you're locked out for 7 days; repeated cheating leads to a permanent ban from that test. Pass honestly — your verified badge shows next to your name to every client, in real time." />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center gap-1.5">
            <div className="p-3 bg-emerald-100 rounded-xl"><Award className="w-4 h-4 text-emerald-600" /></div>
            <div><p className="text-xl font-bold text-slate-900">{certifications.length}</p><p className="text-sm text-slate-500">Badges Earned</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center gap-1.5">
            <div className="p-3 bg-blue-100 rounded-xl"><BrainCircuit className="w-4 h-4 text-blue-600" /></div>
            <div><p className="text-xl font-bold text-slate-900">{tests.length}</p><p className="text-sm text-slate-500">Tests Available</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center gap-1.5">
            <div className="p-3 bg-amber-100 rounded-xl"><TrendingUp className="w-4 h-4 text-amber-600" /></div>
            <div><p className="text-xl font-bold text-slate-900">{certifications.filter((c) => c.level === 'expert' || c.level === 'advanced').length}</p><p className="text-sm text-slate-500">Advanced+ Badges</p></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-slate-200">
        <button onClick={() => setActiveTab('available')} className={`pb-3 text-sm font-medium relative ${activeTab === 'available' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
          Available Tests
          {activeTab === 'available' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
        </button>
        <button onClick={() => setActiveTab('earned')} className={`pb-3 text-sm font-medium relative ${activeTab === 'earned' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
          Earned Badges
          {activeTab === 'earned' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
        </button>
      </div>

      {/* All assessments note */}
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Sparkles className="w-4 h-4 text-emerald-500" />
        <span>All skill assessments are available — pick any to earn a verified badge, in real time.</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search skills..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      {/* Available Tests */}
      {activeTab === 'available' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredTests.map((test) => {
            const Icon = getSkillIcon(test.skill);
            const levelInfo = CERTIFICATION_LEVELS[test.difficulty];
            const isLocked = (test as any).locked;

            return (
              <div key={test.id} className={`bg-white rounded-xl border p-5 ${isLocked ? 'border-slate-100 opacity-60' : 'border-slate-200 hover:shadow-md'} transition-all`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`p-2.5 rounded-xl ${levelInfo.bgColor}`}><Icon className={`w-5 h-5 ${levelInfo.color}`} /></div>
                    <div>
                      <h3 className="font-bold text-slate-900">{test.skill}</h3>
                      <p className="text-xs text-slate-500">{test.category}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${levelInfo.bgColor} ${levelInfo.color} ${levelInfo.borderColor}`}>
                    {levelInfo.icon} {levelInfo.label}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-2">{test.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
                  <span>{test.question_count} questions • {test.time_limit_minutes} min</span>
                  <span>Pass: {test.passing_score}%</span>
                </div>
                {isLocked ? (
                  <button disabled className="w-full py-2.5 bg-slate-100 text-slate-400 rounded-xl text-sm font-medium flex items-center justify-center gap-3 cursor-not-allowed">
                    <Lock className="w-4 h-4" /> Already Passed
                  </button>
                ) : (
                  <Link to={`/dashboard/certifications/${test.id}`} className="block w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium text-center hover:bg-emerald-700 transition-colors">
                    Take Test
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Earned Badges */}
      {activeTab === 'earned' && (
        <div>
          {filteredCerts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-100">
              <Award className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-xl font-bold text-slate-900 mb-2">No certifications yet</h3>
              <p className="text-slate-500 mb-3">Take skill tests to earn verified badges.</p>
              <button onClick={() => setActiveTab('available')} className="px-3 py-3 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-colors">Browse Tests</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredCerts.map((cert) => {
                const badgeInfo = skillCertificationService.getBadgeInfo(cert);
                return (
                  <div key={cert.id} className="bg-white rounded-xl border border-slate-100 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${badgeInfo.bgColor}`}>{badgeInfo.icon}</div>
                      <div>
                        <h3 className="font-bold text-slate-900">{cert.skill}</h3>
                        <p className="text-sm text-slate-500">{badgeInfo.label} • Score: {badgeInfo.scorePercent}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeInfo.bgColor} ${badgeInfo.color} ${badgeInfo.borderColor}`}>
                        <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Verified
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
