import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle, Clock, Eye, FileText, Loader2, MessageSquare, Send, ThumbsUp, Trophy, Upload, Users,  } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';
import { supabase } from '../lib/supabase';
import { contestService, type Contest, type ContestSubmission, type ContestComment, getTimeRemaining } from '../lib/contests';

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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                  <p className="font-semibold text-slate-900">{contest.client?.name || 'Anonymous'}</p>
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
                    <span className="font-extrabold text-xl">${contest.prize_amount.toLocaleString()}</span>
                  </div>
                  {contest.second_prize > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-100">🥈 2nd Place</span>
                      <span className="font-bold">${contest.second_prize.toLocaleString()}</span>
                    </div>
                  )}
                  {contest.third_prize > 0 && (
                    <div className="flex justify-between items-center">
                      <span className="text-emerald-100">🥉 3rd Place</span>
                      <span className="font-bold">${contest.third_prize.toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Time & Submissions */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
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
              {isContestActive && user && !hasSubmitted && !isOwner && (
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
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
                          <p className="font-semibold text-slate-900">{submission.freelancer?.name || 'Anonymous'}</p>
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
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-emerald-100 text-slate-700 hover:text-emerald-700 rounded-xl transition-colors font-medium"
                      >
                        <ThumbsUp className="w-4 h-4" />
                        Vote
                      </button>
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
                        {comment.user?.name || 'Anonymous'}
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
    </div>
  );
}
