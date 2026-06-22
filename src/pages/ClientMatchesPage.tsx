import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { aiMatchingService, type AIMatchWithProfile } from '../lib/aiMatching';
import { realtimeChannels, supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { inviteFreelancerToProject } from '../lib/workflowService';
import { Badge, CheckCircle2, DollarSign, Info, MapPin, RefreshCw, Send, Sparkles, Star, User, XCircle,  } from 'lucide-react';

export function ClientMatchesPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');

  const [matches, setMatches] = useState<AIMatchWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [invitedFreelancers, setInvitedFreelancers] = useState<Set<string>>(new Set());
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [clientProjects, setClientProjects] = useState<{ id: string; title: string }[]>([]);

  useEffect(() => {
    if (!user?.id || projectId) return;
    void supabase
      .from('projects')
      .select('id, title')
      .eq('client_id', user.id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .then(({ data }) => setClientProjects(data || []));
  }, [user?.id, projectId]);

  const fetchMatches = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    const data = await aiMatchingService.getProjectMatches(projectId);
    setMatches(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (projectId) {
      fetchMatches();
    }
  }, [projectId, fetchMatches]);

  /** Live list when AI matches are inserted/updated for this project (edge function or batch job). */
  useEffect(() => {
    if (!projectId) return;

    const channel = realtimeChannels
      .aiMatches(`client-matches-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_matches',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void fetchMatches();
        }
      )
      .subscribe();

    // Fetch existing invites for this project
    const fetchInvites = async () => {
      const { data } = await supabase
        .from('invites')
        .select('freelancer_id')
        .eq('project_id', projectId);
      
      if (data) {
        setInvitedFreelancers(new Set(data.map(i => i.freelancer_id)));
      }
    };
    void fetchInvites();

    // Subscribe to invites realtime changes
    const inviteChannel = supabase
      .channel(`client-invites-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invites',
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void fetchInvites();
        }
      )
      .subscribe();

    return () => {
      void channel.unsubscribe();
      void inviteChannel.unsubscribe();
    };
  }, [projectId, fetchMatches]);

  const handleGenerateMatches = async () => {
    if (!projectId) return;

    setGenerating(true);
    // Reset skipped matches on regenerate so all new matches are visible
    setSkipped(new Set());
    const result = await aiMatchingService.generateMatches(projectId);
    
    if (result.success) {
      await fetchMatches();
    }
    setGenerating(false);
  };

  const handleInvite = async (freelancerId: string) => {
    if (!user?.id || !projectId) return;
    setInviteBusy(freelancerId);
    const result = await inviteFreelancerToProject(
      user.id,
      projectId,
      freelancerId,
      'We would like you to review this project on Growlancer.'
    );
    if (!result.success) alert(result.error || 'Invite failed');
    setInviteBusy(null);
  };

  const visibleMatches = matches.filter((m) => !skipped.has(m.freelancer_id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">AI Talent Matches</h1>
          <p className="text-slate-500 mt-1">
            AI-powered recommendations based on your project requirements
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleGenerateMatches}
            disabled={generating || !projectId}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Generating...' : 'Regenerate Matches'}
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl">
            <Sparkles className="w-5 h-5" />
            <span className="font-bold">
              {visibleMatches.length}/{matches.length} Matches
            </span>
          </div>
        </div>
      </div>

      {!projectId && (
        <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
          <Sparkles className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">Select a project</h3>
          <p className="text-slate-500 mb-4">Choose an open project to view AI talent matches</p>
          {clientProjects.length > 0 ? (
            <div className="flex flex-col gap-2 max-w-md mx-auto">
              {clientProjects.map((p) => (
                <Link
                  key={p.id}
                  to={`/client/matches?project_id=${p.id}`}
                  className="px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-emerald-400 text-left font-medium text-slate-800"
                >
                  {p.title}
                </Link>
              ))}
            </div>
          ) : (
            <Link to="/client/post" className="inline-flex px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl">
              Post a project first
            </Link>
          )}
        </div>
      )}

      {projectId && matches.length === 0 && !loading ? (
        <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
          <Sparkles className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No matches found</h3>
          <p className="text-slate-500 mb-4">
            Generate AI matches to see recommended freelancers for this project
          </p>
          <button
            onClick={handleGenerateMatches}
            disabled={generating}
            className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {generating ? 'Generating...' : 'Generate Matches'}
          </button>
        </div>
      ) : projectId && visibleMatches.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleMatches.map((match) => (
            <div
              key={match.id}
              className="bg-white p-6 rounded-2xl border border-slate-100 hover:shadow-md transition-shadow"
            >
              {/* Match Score Badge */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-bold">{match.match_score}% Match</span>
                </div>
              </div>

              {/* Freelancer Info */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden">
                  {match.freelancer.avatar ? (
                    <img src={match.freelancer.avatar} alt={match.freelancer.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-6 h-6 text-slate-400" />
                  )}
                </div>
                <div>
                  <h3 className="font-display font-bold text-slate-900">
                    {match.freelancer.name || 'Unknown'}
                  </h3>
                  <div className="flex items-center gap-1 text-sm text-slate-500">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span>{match.freelancer.freelancer_profiles?.rating ? Number(match.freelancer.freelancer_profiles.rating).toFixed(1) : '—'}</span>
                    <span className="text-slate-400">({match.freelancer.freelancer_profiles?.reviews_count ?? 0} reviews)</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <DollarSign className="w-4 h-4" />
                  <span>${match.freelancer.hourly_rate || 0}/hr</span>
                </div>
                <div className="flex items-center gap-2 text-slate-600">
                  <MapPin className="w-4 h-4" />
                  <span>{match.freelancer.location || 'Remote'}</span>
                </div>
              </div>

              {/* Skills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {match.freelancer.skills?.slice(0, 3).map((skill) => (
                  <span
                    key={skill}
                    className="px-2 py-1 bg-slate-50 text-slate-600 text-xs font-medium rounded-full border border-slate-200"
                  >
                    {skill}
                  </span>
                ))}
                {match.freelancer.skills && match.freelancer.skills.length > 3 && (
                  <span className="px-2 py-1 bg-slate-50 text-slate-600 text-xs font-medium rounded-full border border-slate-200">
                    +{match.freelancer.skills.length - 3}
                  </span>
                )}
              </div>

              {/* Score Breakdown */}
              <div className="space-y-2 mb-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Skills</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 rounded-full" 
                        style={{ width: `${match.skill_score}%` }}
                      />
                    </div>
                    <span className="font-medium text-slate-700">{match.skill_score}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Experience</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 rounded-full" 
                        style={{ width: `${match.experience_score}%` }}
                      />
                    </div>
                    <span className="font-medium text-slate-700">{match.experience_score}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Budget</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 rounded-full" 
                        style={{ width: `${match.budget_score}%` }}
                      />
                    </div>
                    <span className="font-medium text-slate-700">{match.budget_score}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Completion</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-orange-500 rounded-full" 
                        style={{ width: `${match.completion_score}%` }}
                      />
                    </div>
                    <span className="font-medium text-slate-700">{match.completion_score}</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {invitedFreelancers.has(match.freelancer_id) ? (
                  <button
                    type="button"
                    disabled
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 font-bold rounded-lg cursor-not-allowed"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Invited
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={inviteBusy === match.freelancer_id}
                    onClick={() => handleInvite(match.freelancer_id)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {inviteBusy === match.freelancer_id ? 'Sending…' : 'Invite'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSkipped((s) => new Set(s).add(match.freelancer_id))}
                  className="flex items-center justify-center gap-2 px-4 py-2 text-slate-600 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Skip
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : projectId && visibleMatches.length === 0 && matches.length > 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-2xl border border-slate-200">
          <XCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">All matches skipped</h3>
          <p className="text-slate-500 mb-4">
            You have skipped all {matches.length} freelancer match{matches.length !== 1 ? 'es' : ''}. Regenerate to see new matches.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setSkipped(new Set())}
              className="px-6 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors"
            >
              Show Skipped
            </button>
            <button
              onClick={handleGenerateMatches}
              disabled={generating}
              className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {generating ? 'Generating...' : 'Regenerate Matches'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
