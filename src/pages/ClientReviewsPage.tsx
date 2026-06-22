import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { List, Loader2, MessageSquare, Reply, Send, Star, User,  } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, realtimeChannels } from '../lib/supabase';
import { reviewService } from '../lib/reviews';

interface ReviewData {
  id: string;
  reviewer?: { full_name?: string; avatar?: string } | null;
  communication_rating: number;
  quality_rating: number;
  timeliness_rating: number;
  professionalism_rating: number;
  overall_rating: number;
  review_text: string | null;
  created_at: string;
}

/**
 * Extended Client Reviews Page
 * Shows reviews the client has received from freelancers
 * (two-way review system - freelancers can review clients too)
 */
export function ClientReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [replyModal, setReplyModal] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const fetchReviews = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const result = await reviewService.getUserReviews(user.id);
      setReviews(result.reviews as unknown as ReviewData[]);
      setAverageRating(result.average_rating);
      setTotalReviews(result.total_reviews);
    } catch (err) {
      console.error('Failed to fetch reviews:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchReviews();

    if (!user) return;
    // Real-time: show new reviews instantly
    const channel = realtimeChannels.profiles(`reviews:${user.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reviews',
        filter: `reviewee_id=eq.${user.id}`,
      }, () => void fetchReviews())
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [fetchReviews, user]);

  const handleReply = async (reviewId: string) => {
    if (!user || !replyText.trim()) return;
    setSubmittingReply(true);
    try {
      const { error } = await supabase.from('review_replies').insert({
        review_id: reviewId,
        user_id: user.id,
        content: replyText.trim(),
      });
      if (error) throw error;
      setReplyModal(null);
      setReplyText('');
      fetchReviews();
    } catch (err) {
      console.error('Failed to submit reply:', err);
    } finally {
      setSubmittingReply(false);
    }
  };

  const RatingStars = ({ rating }: { rating: number }) => (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className={`w-4 h-4 ${star <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
      ))}
    </div>
  );

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Reviews</h1>
        <p className="text-slate-500 mt-1">Reviews from freelancers you've worked with</p>
      </div>

      {/* Stats */}
      <div className="bg-white rounded-2xl border border-slate-100 p-6 flex items-center gap-6">
        <div className="text-center">
          <p className="text-4xl font-bold text-slate-900">{averageRating > 0 ? averageRating.toFixed(1) : '—'}</p>
          <RatingStars rating={averageRating} />
          <p className="text-sm text-slate-500 mt-1">{totalReviews} review{totalReviews !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex-1 grid grid-cols-4 gap-4">
          {[
            { label: 'Quality', key: 'quality_rating' },
            { label: 'Communication', key: 'communication_rating' },
            { label: 'Timeliness', key: 'timeliness_rating' },
            { label: 'Professionalism', key: 'professionalism_rating' },
          ].map((dim) => {
            const avg = reviews.length > 0
              ? reviews.reduce((sum, r) => sum + ((r as any)[dim.key] || 0), 0) / reviews.length
              : 0;
            return (
              <div key={dim.key} className="text-center">
                <p className="text-lg font-bold text-slate-900">{avg > 0 ? avg.toFixed(1) : '—'}</p>
                <p className="text-xs text-slate-500">{dim.label}</p>
                <div className="w-full bg-slate-100 rounded-full h-1.5 mt-1">
                  <div className="bg-amber-400 h-1.5 rounded-full" style={{ width: `${(avg / 5) * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <Star className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No reviews yet</h3>
          <p className="text-slate-500">Reviews from freelancers will appear here after completed projects.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white rounded-2xl border border-slate-100 p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  {review.reviewer?.avatar ? (
                    <img src={review.reviewer.avatar} alt="" className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-semibold text-slate-900">{review.reviewer?.full_name || 'Anonymous'}</p>
                      <RatingStars rating={review.overall_rating} />
                    </div>
                    <span className="text-xs text-slate-400">{new Date(review.created_at).toLocaleDateString()}</span>
                  </div>
                  {review.review_text && (
                    <p className="text-sm text-slate-600 mb-3">{review.review_text}</p>
                  )}
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span>Quality: {review.quality_rating}/5</span>
                    <span>Communication: {review.communication_rating}/5</span>
                    <span>Timeliness: {review.timeliness_rating}/5</span>
                    <span>Professionalism: {review.professionalism_rating}/5</span>
                  </div>
                  <button onClick={() => { setReplyModal(review.id); setReplyText(''); }} className="mt-3 text-xs text-emerald-600 font-medium hover:text-emerald-700 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Reply
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reply Modal */}
      {replyModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setReplyModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Reply to Review</h3>
            <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Write your reply..." rows={4} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm mb-4 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            <div className="flex gap-3">
              <button onClick={() => setReplyModal(null)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50">Cancel</button>
              <button onClick={() => handleReply(replyModal)} disabled={!replyText.trim() || submittingReply} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {submittingReply ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Reply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
