import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Award, Badge, BarChart3, BrainCircuit, CheckCircle2, Code, Filter, Loader2, Lock, Palette, Search, Server, Sparkles, TrendingUp, User, Verified,  } from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { realtimeChannels } from '../../lib/supabase';
import { skillCertificationService, AVAILABLE_SKILL_TESTS, CERTIFICATION_LEVELS, type SkillCertification, type SkillTest } from '../../lib/skillCertifications';

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
    // Fetch user's actual skills from their freelancer profile
    const { data: fp } = await supabase
      .from('freelancer_profiles')
      .select('skills')
      .eq('user_id', user.id)
      .maybeSingle();

    const userSkills: string[] = (fp as { skills?: string[] } | null)?.skills || [];

    const [certs, availableTests] = await Promise.all([
      skillCertificationService.getUserCertifications(user.id),
      skillCertificationService.getAvailableTests(user.id),
    ]);

    // Filter tests to only show those matching user's actual skills
    const filteredTests = userSkills.length > 0
      ? availableTests.filter(t =>
          userSkills.some(s => t.skill.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(t.skill.toLowerCase()))
        )
      : availableTests;

    setCertifications(certs);
    setTests(filteredTests);
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
    t.skill.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredCerts = certifications.filter((c) =>
    c.skill.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getSkillIcon = (skill: string) => {
    const s = skill.toLowerCase();
    if (s.includes('react') || s.includes('javascript') || s.includes('typescript') || s.includes('html') || s.includes('css')) return Code;
    if (s.includes('design') || s.includes('ui') || s.includes('ux') || s.includes('figma')) return Palette;
    if (s.includes('node') || s.includes('python') || s.includes('java') || s.includes('go') || s.includes('rust')) return Server;
    if (s.includes('seo') || s.includes('marketing')) return Search;
    if (s.includes('data') || s.includes('analytics') || s.includes('sql')) return BarChart3;
    return BrainCircuit;
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Skill Certifications</h1>
        <p className="text-slate-500 mt-1">Earn verified badges to showcase your expertise to clients</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-100 rounded-xl"><Award className="w-6 h-6 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{certifications.length}</p><p className="text-sm text-slate-500">Badges Earned</p></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-xl"><BrainCircuit className="w-6 h-6 text-blue-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{tests.length}</p><p className="text-sm text-slate-500">Tests Available</p></div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-100 rounded-xl"><TrendingUp className="w-6 h-6 text-amber-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">{certifications.filter((c) => c.level === 'expert' || c.level === 'advanced').length}</p><p className="text-sm text-slate-500">Advanced+ Badges</p></div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-4 border-b border-slate-200">
        <button onClick={() => setActiveTab('available')} className={`pb-3 text-sm font-medium relative ${activeTab === 'available' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
          Available Tests
          {activeTab === 'available' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
        </button>
        <button onClick={() => setActiveTab('earned')} className={`pb-3 text-sm font-medium relative ${activeTab === 'earned' ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
          Earned Badges
          {activeTab === 'earned' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
        </button>
      </div>

      {/* User Skills Badge */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Sparkles className="w-4 h-4 text-emerald-500" />
        <span>Showing tests for your profile skills. <Link to="/dashboard/profile" className="text-emerald-600 hover:underline font-medium">Update your skills</Link> to see more relevant tests.</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search skills..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>

      {/* Available Tests */}
      {activeTab === 'available' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTests.map((test) => {
            const Icon = getSkillIcon(test.skill);
            const levelInfo = CERTIFICATION_LEVELS[test.difficulty];
            const isLocked = (test as any).locked;

            return (
              <div key={test.id} className={`bg-white rounded-2xl border p-5 ${isLocked ? 'border-slate-100 opacity-60' : 'border-slate-200 hover:shadow-md'} transition-all`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${levelInfo.bgColor}`}><Icon className={`w-5 h-5 ${levelInfo.color}`} /></div>
                    <div>
                      <h3 className="font-bold text-slate-900">{test.skill}</h3>
                      <p className="text-xs text-slate-500">{test.category}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${levelInfo.bgColor} ${levelInfo.color} ${levelInfo.borderColor}`}>
                    {levelInfo.icon} {levelInfo.label}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-4">{test.description}</p>
                <div className="flex items-center justify-between text-xs text-slate-500 mb-4">
                  <span>{test.question_count} questions • {test.time_limit_minutes} min</span>
                  <span>Pass: {test.passing_score}%</span>
                </div>
                {isLocked ? (
                  <button disabled className="w-full py-2.5 bg-slate-100 text-slate-400 rounded-xl text-sm font-medium flex items-center justify-center gap-2 cursor-not-allowed">
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
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
              <Award className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-900 mb-2">No certifications yet</h3>
              <p className="text-slate-500 mb-6">Take skill tests to earn verified badges.</p>
              <button onClick={() => setActiveTab('available')} className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors">Browse Tests</button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCerts.map((cert) => {
                const badgeInfo = skillCertificationService.getBadgeInfo(cert);
                return (
                  <div key={cert.id} className="bg-white rounded-2xl border border-slate-100 p-5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${badgeInfo.bgColor}`}>{badgeInfo.icon}</div>
                      <div>
                        <h3 className="font-bold text-slate-900">{cert.skill}</h3>
                        <p className="text-sm text-slate-500">{badgeInfo.label} • Score: {badgeInfo.scorePercent}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeInfo.bgColor} ${badgeInfo.color} ${badgeInfo.borderColor}`}>
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />Verified
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
