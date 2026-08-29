import { useState } from 'react';
import { Loader2, Star, X } from 'lucide-react';
import { reviewService } from '../lib/reviews';
import { useToast } from './Toast';

interface ReviewModalProps {
  contractId?: string;
  contestId?: string;
  revieweeId: string;
  revieweeName: string;
  projectTitle?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

const STAR_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

function StarRow({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <Star
            className={`w-6 h-6 transition-colors ${
              (hover || value) >= n ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
            }`}
          />
        </button>
      ))}
      {value > 0 && <span className="ml-2 text-xs font-medium text-slate-500">{STAR_LABELS[value]}</span>}
    </div>
  );
}

export function ReviewModal({ contractId, contestId, revieweeId, revieweeName, projectTitle, onClose, onSubmitted }: ReviewModalProps) {
  const toast = useToast();
  const [rating, setRating] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [quality, setQuality] = useState(0);
  const [timeliness, setTimeliness] = useState(0);
  const [professionalism, setProfessionalism] = useState(0);
  const [comment, setComment] = useState('');
  const [wouldHireAgain, setWouldHireAgain] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!rating) {
      setError('Please select an overall rating');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await reviewService.createReview({
        contract_id: contractId,
        contest_id: contestId,
        reviewee_id: revieweeId,
        rating,
        communication_rating: communication || undefined,
        quality_rating: quality || undefined,
        timeliness_rating: timeliness || undefined,
        professionalism_rating: professionalism || undefined,
        comment: comment.trim() || undefined,
        would_hire_again: wouldHireAgain ?? undefined,
      });
      if (result.success) {
        toast.success('Review submitted!', `Thanks for reviewing ${revieweeName}.`);
        onSubmitted?.();
        onClose();
      } else {
        setError(result.error || 'Failed to submit review');
      }
    } catch {
      setError('Failed to submit review. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-slate-100">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">Leave a Review</h3>
            <p className="text-xs text-slate-500 mt-0.5">{projectTitle || 'Contract'}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-4.5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">Overall rating for {revieweeName} <span className="text-red-500">*</span></p>
            <StarRow value={rating} onChange={setRating} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { label: 'Communication', v: communication, set: setCommunication },
              { label: 'Quality of work', v: quality, set: setQuality },
              { label: 'Timeliness', v: timeliness, set: setTimeliness },
              { label: 'Professionalism', v: professionalism, set: setProfessionalism },
            ].map((row) => (
              <div key={row.label}>
                <p className="text-xs font-medium text-slate-600 mb-1.5">{row.label}</p>
                <StarRow value={row.v} onChange={row.set} />
              </div>
            ))}
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800 mb-2">Would you work with them again?</p>
            <div className="flex gap-3">
              {[true, false].map((yes) => (
                <button
                  key={String(yes)}
                  type="button"
                  onClick={() => setWouldHireAgain(yes)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                    wouldHireAgain === yes
                      ? yes
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {yes ? 'Yes, definitely' : 'No'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">Written review</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder={`Share your experience working with ${revieweeName}...`}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 resize-none"
            />
            <p className="text-xs text-slate-400 mt-1 text-right">{comment.length}/1000</p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-slate-200 text-slate-700 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-3"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Submitting...
                </>
              ) : (
                'Submit Review'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
