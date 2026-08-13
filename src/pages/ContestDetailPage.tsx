import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle, Clock, Eye, FileText, IndianRupee, Loader2, Lock, Medal, MessageSquare, Send, ShieldCheck, Star, ThumbsUp, Trophy, Upload, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { contestService, type Contest, type ContestSubmission, type ContestComment, getTimeRemaining } from '../lib/contests';
import { reviewService, type ReviewWithProfiles } from '../lib/reviews';
import { ReviewModal } from '../components/ReviewModal';
import { TipNote } from '../components/TipNote';

export function ContestDetailPage() {
  const { contestId } = useParams<{ contestId: string }>();
  const { user } = useAuth();
  const [contest, setContest] = useState<Contest | null>(null);
  const [submissions, setSubmissions] = useState<ContestSubmission[]>([]);
  const [comments, setComments] = useState<ContestComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [submitForm, setSubmitForm] = useState({
    title: '',
    description: '',
    file_url: '',
    preview_url: '',
  });
  const toast = useToast();

  // Winner-award selections (judging panel, owner only)
  const [awardSelection, setAwardSelection] = useState<{ first: string | null; second: string | null; third: string | null }>({ first: null, second: null, third: null });
  const [awarding, setAwarding] = useState(false);
  const [showAwardConfirm, setShowAwardConfirm] = useState(false);
  const [funding, setFunding] = useState(false);
  const [showFundConfirm, setShowFundConfirm] = useState(false);

  // Contest reviews (after completion — winner + client rate each other)
  const [reviews, setReviews] = useState<ReviewWithProfiles[]>([]);
  const [reviewModal, setReviewModal] = useState<{ revieweeId: string; revieweeName: string; label: string } | null>(null);

  // Winner achievement certificates (auto-issued on award) — submission_id → code
  const [certificates, setCertificates] = useState<{ submission_id: string; place: number; code: string }[]>([]);

  const fetchContestData = useCallback(async () => {
    if (!contestId) return;
    setLoading(true);
    
    const [contestData, submissionsData, commentsData] = await Promise.all([
      contestService.getContestById(contestId),
      contestService.getContestSubmissions(contestId),
      contestService.getContestComments(contestId),
    ]);
    
    setContest(contestData);
    setSubmissions(submissionsData);
    setComments(commentsData);

    if (contestData && contestData.status === 'completed') {
      const [reviewData, certData] = await Promise.all([
        reviewService.getContestReviews(contestId),
        contestService.getContestCertificates(contestId),
      ]);
      setReviews(reviewData);
      setCertificates(certData);
    } else {
      setReviews([]);
      setCertificates([]);
    }
    setLoading(false);
  }, [contestId]);

  // Real-time subscription for live submission and comment updates
  useEffect(() => {
    if (!contestId) return;
    
    fetchContestData();
    
    const channel = supabase
      .channel(`contest-detail-${contestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contest_submissions', filter: `contest_id=eq.${contestId}` },
        () => { void fetchContestData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contest_comments', filter: `contest_id=eq.${contestId}` },
        () => { void fetchContestData(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contests', filter: `id=eq.${contestId}` },
        () => { void fetchContestData(); }
      )
      .subscribe();
    
    return () => { void channel.unsubscribe(); };
  }, [contestId, fetchContestData]);

  // Real-time reviews (after completion)
  useEffect(() => {
    if (!contestId || contest?.status !== 'completed') return;
    const reviewChannel = supabase
      .channel(`contest-reviews-${contestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reviews', filter: `contest_id=eq.${contestId}` },
        () => { void fetchContestData(); }
      )
      .subscribe();
    return () => { void reviewChannel.unsubscribe(); };
  }, [contestId, contest?.status, fetchContestData]);

  // Real-time vote counts — subscribe to votes on this contest's submissions
  useEffect(() => {
    if (!contestId || submissions.length === 0) return;
    const ids = submissions.map(s => s.id).join(',');
    const voteChannel = supabase
      .channel(`contest-votes-${contestId}-${ids.length}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contest_votes', filter: `submission_id=in.(${ids})` },
        () => { void fetchContestData(); }
      )
      .subscribe();
    return () => { void voteChannel.unsubscribe(); };
  }, [contestId, submissions, fetchContestData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !contestId) return;
    
    setSubmitting(true);
    const result = await contestService.submitToContest({
      contest_id: contestId,
      freelancer_id: user.id,
      title: submitForm.title,
      description: submitForm.description,
      file_url: submitForm.file_url || null,
      file_type: null,
      preview_url: submitForm.preview_url || null,
    });
    
    if (result.success) {
      setShowSubmitForm(false);
      setSubmitForm({ title: '', description: '', file_url: '', preview_url: '' });
      void fetchContestData();
      toast.success('Submission created!');
    } else {
      toast.error(result.error || 'Failed to submit');
    }
    setSubmitting(false);
  };

  const handleVote = async (submissionId: string) => {
    if (!user) {
      toast.warning('Please login to vote');
      return;
    }
    
    const result = await contestService.voteOnSubmission(submissionId, user.id);
    if (result.success) {
      toast.success('Vote recorded!');
    } else {
      toast.error(result.error || 'You may have already voted on this submission');
    }
    void fetchContestData();
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !contestId || !newComment.trim()) return;
    
    const result = await contestService.addComment(contestId, user.id, newComment.trim());
    if (!result.success) {
      toast.error(result.error || 'Failed to post comment');
    } else {
      setNewComment('');
      toast.success('Comment posted!');
    }
    void fetchContestData();
  };

  /** Fund the prize pool from the client's wallet (escrow protection). */
  const handleFundPrize = async () => {
    if (!user || !contestId) return;
    setFunding(true);
    const result = await contestService.fundContestPrizeFromWallet(contestId);
    setFunding(false);
    setShowFundConfirm(false);
    if (result.success) {
      toast.success('Prize funded! The contest is now live for submissions.');
      void fetchContestData();
    } else {
      toast.error(result.error || 'Failed to fund prize. Add funds to your wallet first.');
    }
  };

  /** Award 1st/2nd/3rd prizes — escrow released to winner wallets in real time. */
  const handleAward = async () => {
    if (!user || !contestId || !awardSelection.first) return;
    setAwarding(true);
    const result = await contestService.awardContestPrizes(
      contestId,
      awardSelection.first,
      awardSelection.second,
      awardSelection.third
    );
    setAwarding(false);
    setShowAwardConfirm(false);
    if (result.success) {
      toast.success('Prizes released! Winners have been notified and certificates issued.');
      if (result.certificates && result.certificates.length > 0) {
        setCertificates(prev => [...prev, ...result.certificates!]);
      }
      setAwardSelection({ first: null, second: null, third: null });
      void fetchContestData();
    } else {
      toast.error(result.error || 'Failed to award prizes');
    }
  };

  /** Toggle 1st/2nd/3rd selection for the owner judging panel. */
  const toggleAwardSelection = (submissionId: string, place: 'first' | 'second' | 'third') => {
    setAwardSelection(prev => ({ ...prev, [place]: prev[place] === submissionId ? null : submissionId }));
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'judging': return 'bg-yellow-100 text-yellow-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getSubmissionStatusColor = (status: string) => {
    switch (status) {
      case 'winner': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'shortlisted': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'rejected': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="animate-spin h-12 w-12 text-emerald-600" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="text-center">
          <Trophy className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-900 mb-2">Contest not found</h2>
          <Link to="/contests" className="text-emerald-600 hover:underline">
            Back to contests
          </Link>
        </div>
      </div>
    );
  }

  const isContestActive = contest.status === 'active' && new Date(contest.end_date) > new Date();
  const hasSubmitted = submissions.some(s => s.freelancer_id === user?.id);
  const isOwner = contest.client_id === user?.id;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-6">
          <Link to="/contests" className="inline-flex items-center gap-2 text-slate-600 hover:text-emerald-600 transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Back to Contests
          </Link>
          
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${getStatusColor(contest.status)}`}>
                  {contest.status.charAt(0).toUpperCase() + contest.status.slice(1)}
                </span>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                  {contest.contest_type.charAt(0).toUpperCase() + contest.contest_type.slice(1)}
                </span>
              </div>
              
              <h1 className="font-display text-3xl font-extrabold text-slate-900 mb-4">
                {contest.title}
              </h1>
              
              <p className="text-slate-600 text-lg mb-6 whitespace-pre-wrap">
                {contest.description}
              </p>

              {/* Skills */}
              {contest.skills_required && contest.skills_required.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {contest.skills_required.map((skill) => (
                    <span key={skill} className="px-3 py-1 bg-slate-100 text-slate-700 text-sm rounded-lg font-medium">
                      {skill}
                    </span>
                  ))}
                </div>
              )}

              {/* Client Info */}
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                  {contest.client?.name?.charAt(0) || 'C'}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{contest.client?.name || 'Client'}</p>
                  <p className="text-sm text-slate-500">Contest Owner</p>
                </div>
              </div>
            </div>

            {/* Sidebar Stats */}
            <div className="lg:w-80 space-y-4">
              {/* Prize Card */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="w-6 h-6" />
                  <span className="font-bold">Prize Pool</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-emerald-100">🥇 1st Place</span>
                    <span className="font-extrabold text-xl">₹{contest.prize_amount.toLocaleString()}</span>
                  </div>
                  {contest.second_prize > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-100">🥈 2nd Place</span>
                      <span className="font-bold">₹{contest.second_prize.toLocaleString()}</span>
                    </div>
                  )}
                  {contest.third_prize > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-100">🥉 3rd Place</span>
                      <span className="font-bold">₹{contest.third_prize.toLocaleString()}</span>
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-white/20 flex items-center gap-2 text-sm">
                  {contest.prize_funded ? (
                    <>
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>
                        <strong>Escrowed:</strong> ₹{Number(contest.escrow_amount || 0).toLocaleString()} protected
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>Prize not funded yet — entries are paused</span>
                    </>
                  )}
                </div>
              </div>

              {/* Fund Prize CTA (owner, unfunded) */}
              {isOwner && !contest.prize_funded && contest.status !== 'completed' && contest.status !== 'cancelled' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                  <h3 className="font-bold text-amber-900 flex items-center gap-2 mb-2">
                    <Lock className="w-4 h-4" />
                    Fund the Prize to Go Live
                  </h3>
                  <p className="text-sm text-amber-800 mb-4">
                    Fund the prize pool (₹{(
                      contest.prize_amount + (contest.second_prize || 0) + (contest.third_prize || 0)
                    ).toLocaleString()} + 5% fee) from your wallet. Until then, freelancers can't submit — escrow protects everyone.
                  </p>
                  <button
                    onClick={() => setShowFundConfirm(true)}
                    disabled={funding}
                    className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {funding ? <Loader2 className="animate-spin w-5 h-5" /> : <><IndianRupee className="w-5 h-5" /> Fund Prize</>}
                  </button>
                </div>
              )}

              {/* Winner banner */}
              {contest.status === 'completed' && contest.winner_id && (
                <div className="bg-gradient-to-br from-yellow-400 to-amber-500 rounded-2xl p-5 text-amber-950">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="w-5 h-5" />
                    <span className="font-extrabold">Winner Announced</span>
                  </div>
                  <p className="text-sm font-semibold">Prizes released to the winning freelancers — check the submissions below.</p>
                </div>
              )}

              {/* Winner certificates — auto-issued on award, publicly verifiable */}
              {contest.status === 'completed' && certificates.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-center gap-2">
                    <Medal className="w-5 h-5 text-amber-500" />
                    <h3 className="font-bold text-slate-900">Winner Certificates</h3>
                  </div>
                  <p className="text-xs text-slate-500">
                    Every winner earned a verifiable achievement certificate — share it anywhere, anyone can verify it in real time.
                  </p>
                  <div className="space-y-3">
                    {submissions
                      .filter(s => s.status === 'winner' && s.rank)
                      .sort((a, b) => (a.rank || 9) - (b.rank || 9))
                      .map((sub) => {
                        const cert = certificates.find(c => c.submission_id === sub.id) || certificates.find(c => c.place === sub.rank);
                        if (!cert) return null;
                        const isMe = user?.id === sub.freelancer_id;
                        const rankColor = sub.rank === 1 ? 'from-yellow-400 to-amber-500' : sub.rank === 2 ? 'from-slate-300 to-slate-400' : 'from-orange-300 to-orange-500';
                        return (
                          <div key={sub.id} className={`rounded-xl border ${isMe ? 'border-amber-300 bg-amber-50/60' : 'border-slate-200 bg-slate-50'} p-4 flex items-center gap-4`}>
                            <div className={`shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${rankColor} flex items-center justify-center text-lg font-black text-white shadow`}>
                              {sub.rank === 1 ? '🥇' : sub.rank === 2 ? '🥈' : '🥉'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-bold text-slate-900 truncate">
                                {sub.rank === 1 ? '1st' : sub.rank === 2 ? '2nd' : '3rd'} Place — {sub.freelancer?.name || 'Winner'}{isMe ? ' (You)' : ''}
                              </p>
                              <p className="text-xs text-slate-500 truncate">
                                {contest.title} • ₹{Number(sub.prize_amount || 0).toLocaleString()}
                              </p>
                            </div>
                            <a
                              href={`/verify-certificate/${cert.code}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              View Certificate
                            </a>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Judging — award winners (owner) */}
              {isOwner && contest.status === 'judging' && contest.prize_funded && (
                <div className="bg-violet-50 border border-violet-200 rounded-2xl p-5">
                  <h3 className="font-bold text-violet-900 flex items-center gap-2 mb-2">
                    <Medal className="w-4 h-4" />
                    Award Winners
                  </h3>
                  <p className="text-sm text-violet-800 mb-3">
                    Select the 1st place entry (required), then optional 2nd/3rd. Prizes are released to their wallets instantly.
                  </p>
                  <div className="space-y-2 mb-4">
                    {(['first', 'second', 'third'] as const).map((place) => {
                      const selectedId = awardSelection[place];
                      return (
                        <div key={place} className="flex items-center justify-between bg-white border border-violet-200 rounded-xl px-3 py-2">
                          <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">
                            {place === 'first' ? '🥇 1st' : place === 'second' ? '🥈 2nd' : '🥉 3rd'}
                          </span>
                          <select
                            value={selectedId || ''}
                            onChange={(e) => toggleAwardSelection(e.target.value, place)}
                            className="flex-1 mx-3 px-2 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
                          >
                            <option value="">— Select entry —</option>
                            {submissions.filter(s => s.status !== 'rejected').map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.title} {s.freelancer?.name ? `(by ${s.freelancer.name})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setShowAwardConfirm(true)}
                    disabled={!awardSelection.first || awarding}
                    className="w-full py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {awarding ? <Loader2 className="animate-spin w-5 h-5" /> : <><Trophy className="w-5 h-5" /> Release Prizes</>}
                  </button>
                </div>
              )}

              {/* Time & Submissions */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
                <TipNote tone="protection" compact className="!p-3">
                  <strong>Fair &amp; safe:</strong> the prize is escrowed upfront before any entries are accepted, and
                  released to the winners in real time. Entries and votes are public — everyone sees the same contest.
                </TipNote>
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-sm text-slate-500">Time Remaining</p>
                    <p className="font-bold text-slate-900">{getTimeRemaining(contest.end_date)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-sm text-slate-500">Submissions</p>
                    <p className="font-bold text-slate-900">{contest.submission_count}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-sm text-slate-500">Ends</p>
                    <p className="font-bold text-slate-900">
                      {new Date(contest.end_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              {isContestActive && !contest.prize_funded && (
                <div className="w-full py-3 bg-slate-100 text-slate-500 font-bold rounded-2xl text-center flex items-center justify-center gap-2">
                  <Lock className="w-5 h-5" />
                  Entries paused — prize not funded yet
                </div>
              )}
              {isContestActive && contest.prize_funded && user && !hasSubmitted && !isOwner && (
                <button
                  onClick={() => setShowSubmitForm(true)}
                  className="w-full py-3 bg-emerald-600 text-white font-bold rounded-2xl hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  <Upload className="w-5 h-5" />
                  Submit Your Work
                </button>
              )}

              {hasSubmitted && (
                <div className="w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-2xl text-center flex items-center justify-center gap-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  You've Submitted
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Submit Form Modal */}
      {showSubmitForm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <h3 className="font-display text-xl font-bold text-slate-900 mb-4">Submit Your Entry</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Title *</label>
                <input
                  type="text"
                  required
                  value={submitForm.title}
                  onChange={(e) => setSubmitForm({ ...submitForm, title: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                  placeholder="My awesome submission"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Description</label>
                <textarea
                  rows={4}
                  value={submitForm.description}
                  onChange={(e) => setSubmitForm({ ...submitForm, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none resize-none"
                  placeholder="Describe your submission..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">File URL</label>
                <input
                  type="url"
                  value={submitForm.file_url}
                  onChange={(e) => setSubmitForm({ ...submitForm, file_url: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                  placeholder="https://drive.google.com/..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Preview Image URL</label>
                <input
                  type="url"
                  value={submitForm.preview_url}
                  onChange={(e) => setSubmitForm({ ...submitForm, preview_url: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none"
                  placeholder="https://i.imgur.com/..."
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSubmitForm(false)}
                  className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <Loader2 className="animate-spin w-5 h-5" />
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Submit
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submissions Section */}
      <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Submissions List */}
          <div className="lg:col-span-2">
            <h2 className="font-display text-2xl font-bold text-slate-900 mb-6">
              Submissions ({submissions.length})
            </h2>
            
            {submissions.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No submissions yet. Be the first!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {submissions.map((submission) => (
                  <div key={submission.id} className="bg-white rounded-2xl border border-slate-200 p-6 hover:shadow-lg transition-all">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center">
                          {submission.freelancer?.name?.charAt(0) || 'F'}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{submission.freelancer?.name || 'Freelancer'}</p>
                          <p className="text-sm text-slate-500">
                            {new Date(submission.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getSubmissionStatusColor(submission.status)}`}>
                        {submission.status.charAt(0).toUpperCase() + submission.status.slice(1)}
                      </span>
                    </div>

                    <h3 className="font-bold text-lg text-slate-900 mb-2">{submission.title}</h3>
                    {submission.description && (
                      <p className="text-slate-600 mb-4">{submission.description}</p>
                    )}

                    {/* Preview Image */}
                    {submission.preview_url && (
                      <div className="mb-4 rounded-xl overflow-hidden border border-slate-200">
                        <img
                          src={submission.preview_url}
                          alt={submission.title}
                          className="w-full h-48 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                      <button
                        onClick={() => handleVote(submission.id)}
                        disabled={submission.has_voted}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-colors font-medium ${
                          submission.has_voted
                            ? 'bg-emerald-100 text-emerald-700 cursor-default'
                            : 'bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700'
                        }`}
                      >
                        <ThumbsUp className="w-4 h-4" />
                        {submission.has_voted ? 'Voted' : 'Vote'}
                        <span className="text-xs font-bold bg-white/70 rounded-full px-2 py-0.5">
                          {submission.vote_count || 0}
                        </span>
                      </button>
                      {submission.status === 'winner' && submission.rank && (
                        <span className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-extrabold ${
                          submission.rank === 1 ? 'bg-yellow-100 text-yellow-700' : submission.rank === 2 ? 'bg-slate-100 text-slate-600' : 'bg-orange-100 text-orange-700'
                        }`}>
                          <Trophy className="w-3.5 h-3.5" />
                          {submission.rank === 1 ? '1st' : submission.rank === 2 ? '2nd' : '3rd'} — ₹{Number(submission.prize_amount || 0).toLocaleString()}
                        </span>
                      )}
                      {submission.file_url && (
                        <a
                          href={submission.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 px-4 py-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors font-medium"
                        >
                          <Eye className="w-4 h-4" />
                          View File
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div className="lg:col-span-1">
            <h2 className="font-display text-xl font-bold text-slate-900 mb-6">
              Discussion ({comments.length})
            </h2>

            {/* Comment Form */}
            {user && (
              <form onSubmit={handleComment} className="mb-6">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none text-sm"
                  />
                  <button
                    type="submit"
                    disabled={!newComment.trim()}
                    className="px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            )}

            {/* Comments List */}
            <div className="space-y-4">
              {comments.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
                  <MessageSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No comments yet</p>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="bg-white rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-6 w-6 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                        {comment.user?.name?.charAt(0) || 'U'}
                      </div>
                      <span className="font-medium text-sm text-slate-900">
                        {comment.user?.name || 'User'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(comment.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600">{comment.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Reviews — after completion, winner(s) & client rate each other */}
      {contest.status === 'completed' && (
        <div className="max-w-[100rem] mx-auto px-4 sm:px-6 lg:px-8 2xl:px-12 pb-12">
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-5">
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
                  Reviews
                </h2>
                <p className="text-sm text-slate-500 mt-1">Winners and clients rate each other after the contest completes — real reputation, visible to everyone.</p>
              </div>

              {/* Review CTAs */}
              {user && isOwner && (
                <button
                  onClick={() => {
                    const winnerSub = submissions.find(s => s.status === 'winner' && s.rank === 1);
                    const winner = winnerSub?.freelancer;
                    if (winner) setReviewModal({ revieweeId: winnerSub.freelancer_id, revieweeName: winner.name || 'Winner', label: 'the winner' });
                    else toast.warning('No winner found to review');
                  }}
                  className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all"
                >
                  Review the Winner
                </button>
              )}
              {user && !isOwner && (
                (() => {
                  const mySub = submissions.find(s => s.freelancer_id === user.id && s.status === 'winner');
                  if (mySub) {
                    return (
                      <button
                        onClick={() => setReviewModal({ revieweeId: contest.client_id, revieweeName: contest.client?.name || 'Client', label: 'the client' })}
                        className="px-5 py-2.5 bg-emerald-600 text-white text-sm font-bold rounded-xl hover:bg-emerald-700 transition-all"
                      >
                        Review the Client
                      </button>
                    );
                  }
                  return null;
                })()
              )}
            </div>

            {reviews.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">No reviews yet — the winner and client can rate each other now.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reviews.map((review) => (
                  <div key={review.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                        {review.reviewer?.name?.charAt(0) || 'R'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-slate-900">{review.reviewer?.name || 'User'}</p>
                        <p className="text-[11px] text-slate-400">reviewed {review.reviewee?.name || 'the other party'}</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`w-3.5 h-3.5 ${n <= Math.round(review.rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                        ))}
                        <span className="ml-1 text-sm font-bold text-slate-900">{Number(review.rating).toFixed(1)}</span>
                      </div>
                    </div>
                    {review.comment && <p className="text-sm text-slate-600">{review.comment}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewModal && (
        <ReviewModal
          contestId={contest.id}
          revieweeId={reviewModal.revieweeId}
          revieweeName={reviewModal.revieweeName}
          projectTitle={`${contest.title} — review ${reviewModal.label}`}
          onClose={() => setReviewModal(null)}
          onSubmitted={() => { void fetchContestData(); }}
        />
      )}

      {/* Fund Prize Confirmation */}
      {showFundConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="font-display text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              Fund Prize Pool
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              ₹{(
                contest.prize_amount + (contest.second_prize || 0) + (contest.third_prize || 0)
              ).toLocaleString()} will be escrowed from your wallet plus a 5% platform fee. Once funded, freelancers can submit and winners are paid instantly.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFundConfirm(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleFundPrize()}
                disabled={funding}
                className="flex-1 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {funding ? <Loader2 className="animate-spin w-5 h-5" /> : <><IndianRupee className="w-5 h-5" /> Fund Now</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Award Winners Confirmation */}
      {showAwardConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="font-display text-xl font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Medal className="w-5 h-5 text-violet-600" />
              Release Prizes?
            </h3>
            <p className="text-sm text-slate-600 mb-4">
              Winners will be notified and their prizes released to their wallets instantly. This action finalizes the contest and cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowAwardConfirm(false)}
                className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAward()}
                disabled={awarding}
                className="flex-1 py-3 bg-violet-600 text-white font-bold rounded-xl hover:bg-violet-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {awarding ? <Loader2 className="animate-spin w-5 h-5" /> : <><Trophy className="w-5 h-5" /> Confirm & Release</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
