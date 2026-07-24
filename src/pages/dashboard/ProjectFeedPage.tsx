import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCategories } from '../../hooks/useCategories';
import { ArrowRight, Briefcase, CheckCircle2, Clock, Loader2, Search, Send, Sparkles, Wallet, X, Zap,  } from 'lucide-react';
import { Pagination } from '../../components/Pagination';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../types/supabase';

interface AIMatchRow {
  id: string;
  freelancer_id: string;
  project_id: string;
  match_score: number | null;
  skill_score: number | null;
  experience_score: number | null;
  budget_score: number | null;
  availability_score: number | null;
  completion_score: number | null;
  created_at: string | null;
}

type MatchWithProject = AIMatchRow & {
  project: Tables<'projects'> & {
    client: Tables<'profiles'>;
  };
};

interface ProposalModalProps {
  project: Tables<'projects'> | null;
  freelancerRate: number | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (proposal: { message: string; estimated_duration: number; proposed_rate: number; rate_type: string }) => void;
  isSubmitting: boolean;
}

function ProposalModal({ project, freelancerRate, isOpen, onClose, onSubmit, isSubmitting }: ProposalModalProps) {
  const [message, setMessage] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('');
  const [proposedRate, setProposedRate] = useState(freelancerRate?.toString() || '');
  const [rateType, setRateType] = useState<'hourly' | 'fixed'>('hourly');

  if (!isOpen || !project) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      message,
      estimated_duration: parseInt(estimatedDuration),
      proposed_rate: parseFloat(proposedRate),
      rate_type: rateType,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <Send className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-slate-900">Apply for Project</h3>
              <p className="text-sm text-slate-500">{project.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Bid-Free Rate Section */}
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-bold text-emerald-900">Bid-War Free Pricing</span>
            </div>
            <p className="text-xs text-emerald-700 mb-3">
              Apply at your standard rate. No competitive bidding - clients see your rate upfront.
            </p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Rate Type
                </label>
                <select
                  value={rateType}
                  onChange={(e) => setRateType(e.target.value as 'hourly' | 'fixed')}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                >
                  <option value="hourly">Hourly Rate</option>
                  <option value="fixed">Fixed Project Price</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Your Rate (USD)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                  <input
                    type="number"
                    required
                    min={1}
                    value={proposedRate}
                    onChange={(e) => setProposedRate(e.target.value)}
                    className="w-full pl-7 pr-3 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm"
                    placeholder={freelancerRate?.toString() || '50'}
                  />
                </div>
              </div>
            </div>
            
            {project.budget_min && project.budget_max && (
              <p className="text-xs text-slate-600 mt-2">
                Client budget: ${project.budget_min.toLocaleString()} - ${project.budget_max.toLocaleString()}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Estimated Duration (days)
            </label>
            <input
              type="number"
              required
              min={1}
              value={estimatedDuration}
              onChange={(e) => setEstimatedDuration(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              placeholder="14"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Cover Message
            </label>
            <textarea
              required
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
              placeholder="Introduce yourself and explain why you're the best fit for this project..."
            />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Apply Now'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ProjectFeedPage() {
  const { user } = useAuth();
  const [matches, setMatches] = useState<MatchWithProject[]>([]);
  const [filteredMatches, setFilteredMatches] = useState<MatchWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMatch, setSelectedMatch] = useState<MatchWithProject | null>(null);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const [submittingProposal, setSubmittingProposal] = useState(false);
  const [proposalSuccess, setProposalSuccess] = useState<string | null>(null);
  const [newMatchAlert, setNewMatchAlert] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [skills, setSkills] = useState<string[]>([]);
  const [freelancerRate, setFreelancerRate] = useState<number | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean>(true);
  const [appliedProjects, setAppliedProjects] = useState<Set<string>>(new Set());
  const [declinedProjects, setDeclinedProjects] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('gw_declined_projects');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        // Fetch freelancer skills and rate
        const { data: profileData, error: profileError } = await supabase
          .from('freelancer_profiles')
          .select('skills, hourly_rate')
          .eq('user_id', user.id)
          .single();

        if (profileError) {
          setHasProfile(false);
        } else {
          setHasProfile(!!profileData);
          if (profileData?.skills) {
            setSkills(profileData.skills);
          }
          if (profileData?.hourly_rate) {
            setFreelancerRate(profileData.hourly_rate);
          }
        }

        // Fetch matches with project and client details
        const { data: matchesData, error } = await supabase
          .from('ai_matches')
          .select(`
            *,
            project:projects(
              *,
              client:profiles(id, name, avatar)
            )
          `)
          .eq('freelancer_id', user.id)
          .order('match_score', { ascending: false });

        if (error) {
          console.error('[ProjectFeedPage] Database error:', error);
          throw error;
        }

        if (matchesData) {
          const rawMatches = matchesData as unknown as MatchWithProject[];
          // Filter out declined projects and only show REAL skill-based matches
          const realMatches = rawMatches.filter(m => 
            !declinedProjects.has(m.project_id) && 
            (m.skill_score ?? 0) >= 50 &&
            (m.match_score ?? 0) >= 40
          );
          setMatches(realMatches);
          setFilteredMatches(realMatches);
        }

        // Fetch proposals
        const { data: proposals } = await supabase
          .from('proposals')
          .select('project_id')
          .eq('freelancer_id', user.id);
        
        if (proposals) {
          setAppliedProjects(new Set(proposals.map(p => p.project_id)));
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching matches:', error);
        setLoading(false);
      }
    };

    // Add timeout to prevent infinite loading - reduced to 3 seconds for faster UX
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 3000);

    fetchData();

    // Set up real-time subscription for AI matches
    const matchesChannel = supabase
      .channel('ai-matches-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ai_matches',
          filter: `freelancer_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch new match with project details
            const fetchNewMatch = async () => {
              const { data } = await supabase
                .from('ai_matches')
                .select(`
                  *,
                  project:projects(
                    *,
                    client:profiles(id, name, avatar)
                  )
                `)
                .eq('id', payload.new.id)
                .single();
              
              if (data) {
                const matchData = data as unknown as MatchWithProject;
                setMatches(prev => [matchData, ...prev]);
                setFilteredMatches(prev => [matchData, ...prev]);
                setNewMatchAlert(`New match: ${matchData.project.title}`);
                setTimeout(() => setNewMatchAlert(null), 5000);
              }
            };
            fetchNewMatch();
          } else if (payload.eventType === 'UPDATE') {
            setMatches(prev =>
              prev.map((match) =>
                match.id === payload.new.id ? ({ ...match, ...(payload.new as MatchWithProject) }) : match
              )
            );
            setFilteredMatches(prev =>
              prev.map((match) =>
                match.id === payload.new.id ? ({ ...match, ...(payload.new as MatchWithProject) }) : match
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setMatches(prev => prev.filter(m => m.id !== payload.old.id));
            setFilteredMatches(prev => prev.filter(m => m.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Real-time subscription for profile/avatar changes
    const profilesChannel = supabase
      .channel('profiles-avatar-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          // Update client avatar in all matches that reference this profile
          if (payload.new.avatar !== payload.old.avatar) {
            setMatches(prev => 
              prev.map(match => 
                match.project.client?.id === payload.new.id
                  ? { 
                      ...match, 
                      project: { 
                        ...match.project, 
                        client: { 
                          ...match.project.client, 
                          avatar: payload.new.avatar 
                        }
                      }
                    }
                  : match
              )
            );
            setFilteredMatches(prev => 
              prev.map(match => 
                match.project.client?.id === payload.new.id
                  ? { 
                      ...match, 
                      project: { 
                        ...match.project, 
                        client: { 
                          ...match.project.client, 
                          avatar: payload.new.avatar 
                        }
                      }
                    }
                  : match
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      matchesChannel.unsubscribe();
      profilesChannel.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Filter matches based on search and category
  useEffect(() => {
    let filtered = matches;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (match) =>
          match.project.title.toLowerCase().includes(query) ||
          match.project.description.toLowerCase().includes(query) ||
          match.project.skills_required?.some((skill) => skill.toLowerCase().includes(query))
      );
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((match) => match.project.category === selectedCategory);
    }

    setFilteredMatches(filtered);
    setPage(1);
  }, [searchQuery, selectedCategory, matches]);

  const handleApply = (match: MatchWithProject) => {
    setSelectedMatch(match);
    setProposalModalOpen(true);
  };

  const handleSubmitProposal = async (proposalData: {
    message: string;
    estimated_duration: number;
    proposed_rate: number;
    rate_type: string;
  }) => {
    if (!selectedMatch || !user) return;

    setSubmittingProposal(true);

    try {
      // Create proposal with bid-war free model
      const { error: proposalError } = await supabase
        .from('proposals')
        .insert({
          project_id: selectedMatch.project_id,
          freelancer_id: user.id,
          proposed_rate: proposalData.proposed_rate,
          rate_type: proposalData.rate_type,
          message: proposalData.message,
          estimated_duration: proposalData.estimated_duration,
          status: 'pending',
          application_type: 'standard',
        })
        .select()
        .single();

      if (proposalError) throw proposalError;

      // Update local state
      setAppliedProjects(prev => new Set(prev).add(selectedMatch.project_id));

      setProposalSuccess('Application submitted successfully!');
      setProposalModalOpen(false);

      // Clear success message after 3 seconds
      setTimeout(() => setProposalSuccess(null), 3000);
    } catch (error) {
      console.error('Error submitting proposal:', error);
      alert('Failed to submit application. Please try again.');
    } finally {
      setSubmittingProposal(false);
    }
  };

  const handleDecline = async (matchId: string, projectIdFromMatch: string) => {
    try {
      // Store declined project ID in localStorage so it persists across refreshes
      const newDeclined = new Set(declinedProjects);
      newDeclined.add(projectIdFromMatch);
      setDeclinedProjects(newDeclined);
      localStorage.setItem('gw_declined_projects', JSON.stringify([...newDeclined]));

      // Optionally delete from DB
      await supabase
        .from('ai_matches')
        .delete()
        .eq('id', matchId);

      setMatches(prev => prev.filter((m) => m.id !== matchId));
      setFilteredMatches(prev => prev.filter((m) => m.id !== matchId));
    } catch (error) {
      console.error('Error declining match:', error);
    }
  };

  const { flatNames: catNames } = useCategories();
  const categories = ['all', ...catNames];

  const getMatchScoreColor = (score: number) => {
    if (score >= 85) return 'bg-emerald-500 text-white';
    if (score >= 70) return 'bg-blue-500 text-white';
    if (score >= 50) return 'bg-orange-500 text-white';
    return 'bg-slate-400 text-white';
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">AI Project Feed</h1>
            <p className="text-slate-500">
              {skills.length > 0 
                ? `${matches.length} projects matched to your ${skills.length} skills` 
                : 'Complete your profile to get AI-matched projects'}
            </p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Search projects..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 w-64"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="all">All Categories</option>
            {categories.filter(c => c !== 'all').map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* New Match Alert */}
      {newMatchAlert && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3 animate-in slide-in-from-top">
          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
            <Zap className="w-5 h-5 text-emerald-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-emerald-900">{newMatchAlert}</p>
            <p className="text-sm text-emerald-600">New AI-powered match just added!</p>
          </div>
          <button
            onClick={() => setNewMatchAlert(null)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-emerald-100 transition-colors"
          >
            <X className="w-4 h-4 text-emerald-600" />
          </button>
        </div>
      )}

      {/* Success Message */}
      {proposalSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
          <p className="font-medium text-green-900">{proposalSuccess}</p>
        </div>
      )}

      {/* Skills Tags */}
      {skills.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">Your skills:</span>
          {skills.slice(0, 5).map((skill) => (
            <span
              key={skill}
              className="px-3 py-1 bg-slate-100 text-slate-700 text-sm rounded-full"
            >
              {skill}
            </span>
          ))}
          {skills.length > 5 && (
            <span className="px-3 py-1 bg-slate-100 text-slate-500 text-sm rounded-full">
              +{skills.length - 5} more
            </span>
          )}
        </div>
      )}

      {/* Project Cards */}
      {filteredMatches.length > 0 ? (
        <>
          <div className="grid grid-cols-1 gap-4">
            {filteredMatches
              .slice((page - 1) * pageSize, page * pageSize)
              .map((match) => (
            <div
              key={match.id}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <h3 className="font-display text-lg font-bold text-slate-900">
                      {match.project.title}
                    </h3>
                    <span
                      className={`px-3 py-1 text-sm font-bold rounded-full ${getMatchScoreColor(
                        match.match_score
                      )}`}
                    >
                      {match.match_score}% Match
                    </span>
                  </div>

                  {/* Description */}
                  <p className="text-slate-600 mb-4 line-clamp-2">
                    {match.project.description}
                  </p>

                  {/* Meta Info */}
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Wallet className="w-4 h-4" />
                      ${match.project.budget_min?.toLocaleString()} - ${
                        match.project.budget_max?.toLocaleString()
                      }
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Due {match.project.deadline && new Date(match.project.deadline).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-4 h-4" />
                      {match.project.experience_level}
                    </span>
                    {match.skill_score && match.skill_score > 0 && (
                      <span className="flex items-center gap-1 text-emerald-600">
                        <CheckCircle2 className="w-4 h-4" />
                        {match.skill_score} skills match score
                      </span>
                    )}
                  </div>

                  {/* Skills */}
                  {match.project.skills_required && (
                    <div className="flex items-center gap-2 flex-wrap mb-4">
                      {match.project.skills_required.slice(0, 5).map((skill) => (
                        <span
                          key={skill}
                          className={`px-2 py-1 text-xs rounded-lg ${
                            skills.includes(skill)
                              ? 'bg-emerald-100 text-emerald-700 font-medium'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {skill}
                        </span>
                      ))}
                      {match.project.skills_required.length > 5 && (
                        <span className="px-2 py-1 text-xs bg-slate-100 text-slate-500 rounded-lg">
                          +{match.project.skills_required.length - 5}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Client Info */}
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>Posted by</span>
                    <span className="font-medium text-slate-700">
                      {match.project.client?.name || 'Anonymous Client'}
                    </span>
                    {/* Show real client metric or nothing — no fake rating */}
                  
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2">
                  {appliedProjects.has(match.project_id) ? (
                    <button
                      disabled
                      className="px-6 py-2.5 bg-slate-100 text-slate-500 font-medium rounded-xl cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Applied
                    </button>
                  ) : (
                    <button
                      onClick={() => handleApply(match)}
                      className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                    >
                      Apply Now
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDecline(match.id, match.project_id)}
                    className="px-6 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors"
                  >
                    Not Interested
                  </button>
                </div>
              </div>
            </div>
          ))}
          </div>
          <Pagination
            currentPage={page}
            totalItems={filteredMatches.length}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        </>
      ) : !hasProfile ? (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center shadow-sm max-w-2xl mx-auto">
          <div className="w-20 h-20 bg-violet-50 text-violet-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 animate-pulse" />
          </div>
          <h3 className="font-display text-2xl font-bold text-slate-900 mb-3">
            Unlock Your Real-Time Matchmaker Feed!
          </h3>
          <p className="text-slate-600 max-w-md mx-auto mb-8 text-sm leading-relaxed">
            Growlancer uses a state-of-the-art match scoring engine to hook you up with high-paying client contracts automatically. To unlock your matching projects, you need to complete your professional profile setup first.
          </p>
          <Link
            to="/dashboard/profile"
            className="inline-flex items-center px-8 py-3.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold rounded-xl hover:scale-105 active:scale-95 transition-transform shadow-lg shadow-violet-500/20"
          >
            Create Your Profile Now
            <ArrowRight className="w-4 h-4 ml-2" />
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900 mb-2">
            No matches found
          </h3>
          <p className="text-slate-500 max-w-md mx-auto mb-6">
            {searchQuery || selectedCategory !== 'all'
              ? 'Try adjusting your search or filters to find more projects.'
              : 'Complete your profile with more skills to get better AI-powered matches.'}
          </p>
          {(searchQuery || selectedCategory !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>
      )}

      {/* Proposal Modal */}
      <ProposalModal
        project={selectedMatch?.project || null}
        freelancerRate={freelancerRate}
        isOpen={proposalModalOpen}
        onClose={() => setProposalModalOpen(false)}
        onSubmit={handleSubmitProposal}
        isSubmitting={submittingProposal}
      />
    </div>
  );
}
