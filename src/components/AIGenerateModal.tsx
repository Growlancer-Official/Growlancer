import { useState } from 'react';
import { Sparkles, Loader2, Check, RefreshCw, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useToast } from './Toast';
import { ModalShell } from './ModalShell';

export interface AIWriterUsage {
  isPro: boolean;
  used: number;
  limit: number;
}

export type AIWriterField =
  | 'project_title'
  | 'project_description'
  | 'cover_letter'
  | 'service_title'
  | 'service_description';

interface AIGenerateModalProps {
  /** Which field the AI should write */
  field: AIWriterField;
  /** Short hint shown inside the "what do you want" input */
  placeholder?: string;
  /** Extra context sent to the AI (budget, skills, project details...) */
  context?: Record<string, unknown>;
  /** Called with the generated text when the user clicks "Use this" */
  onApply: (text: string) => void;
  /** Trigger button label */
  triggerLabel?: string;
  className?: string;
  /**
   * Real-time usage reporter — fires after every generation / limit response so
   * the surrounding page can render a live remaining counter.
   */
  onUsageChange?: (usage: AIWriterUsage) => void;
  /**
   * Client AI features are free for life (platform promise): suppress the
   * "Free: 5/day · Pro" copy and any upgrade prompts on client surfaces.
   */
  clientFree?: boolean;
  /**
   * Pre-loaded usage (e.g. from get_ai_writer_usage) so the meter is visible
   * before the user's first generation.
   */
  initialUsage?: AIWriterUsage | null;
}

const FIELD_TITLES: Record<AIWriterField, string> = {
  project_title: 'AI Project Title',
  project_description: 'AI Project Description',
  cover_letter: 'AI Cover Message',
  service_title: 'AI Service Title',
  service_description: 'AI Service Description',
};

const FIELD_PLACEHOLDERS: Record<AIWriterField, string> = {
  project_title: "e.g., I want a website for my bakery with online ordering and payments",
  project_description: "e.g., Build a mobile app for my fitness coaching business — users should be able to book sessions, track progress and pay online...",
  cover_letter: "e.g., I have 5 years of React and Node.js experience and have built 3 e-commerce websites exactly like this...",
  service_title: "e.g., I build modern, fast React websites for small businesses",
  service_description: "e.g., I design and develop complete business websites — responsive, SEO-friendly, with a contact form and WhatsApp integration...",
};

/**
 * ✨ AIGenerateModal — one-click professional AI writing.
 *
 * Opens a small popup that asks the user what they want, generates a
 * professional result in real time, and lets them regenerate as many
 * times as they like (Free: 5/day, Pro: unlimited). The generated text
 * is applied to the target field with "Use this text".
 */
export function AIGenerateModal({
  field,
  placeholder,
  context,
  onApply,
  triggerLabel = 'Write with AI',
  className = '',
  onUsageChange,
  clientFree = false,
  initialUsage = null,
}: AIGenerateModalProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [editedResult, setEditedResult] = useState('');
  const [usage, setUsage] = useState<AIWriterUsage | null>(initialUsage);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const openModal = () => {
    setInput('');
    setResult(null);
    setError(null);
    setUsage(initialUsage);
    setOpen(true);
  };

  const reportUsage = (next: AIWriterUsage) => {
    setUsage(next);
    onUsageChange?.(next);
  };

  const generate = async () => {
    const prompt = input.trim();
    if (!prompt) {
      setError('Please describe what you want first.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('ai-writer', {
        body: { field, input: prompt, context: context ?? {} },
      });
      if (invokeError) {
        const msg = (data as any)?.error || 'AI generation failed. Please try again.';
        if (msg === 'daily_limit_reached' || msg === 'fair_use_limit_reached') {
          setError((data as any)?.message || 'Daily AI writing limit reached.');
          reportUsage({ isPro: !!(data as any)?.isPro, used: (data as any)?.used ?? (data as any)?.limit ?? 5, limit: (data as any)?.limit ?? 5 });
        } else {
          setError(msg);
        }
        return;
      }
      if (data?.success && data.text) {
        setResult(data.text);
        setEditedResult(data.text);
        reportUsage({ isPro: !!data.isPro, used: data.used ?? 0, limit: data.limit ?? 0 });
      } else {
        setError(data?.error || 'AI generation failed. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const apply = () => {
    if (!editedResult.trim()) return;
    onApply(editedResult.trim());
    toast.success('Done', 'AI text added — review & submit whenever you\'re ready.');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openModal}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-xs font-semibold hover:from-violet-700 hover:to-fuchsia-700 transition-all shadow-sm ${className}`}
      >
        <Sparkles className="w-4 h-4" />
        {triggerLabel}
      </button>
    );
  }

  return (
    <ModalShell
      isOpen={open}
      onClose={() => setOpen(false)}
      title={FIELD_TITLES[field]}
      maxWidth="max-w-lg"
    >
        {/* Usage info */}
        <p className="text-xs text-slate-500 -mt-2 mb-4 flex items-center gap-1">
          {clientFree ? (
            <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
              <Zap className="w-3.5 h-3.5" /> Free for you — no limits, ever
            </span>
          ) : usage ? (
            usage.isPro ? (
              <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
                <Zap className="w-3.5 h-3.5" /> Unlimited Pro AI writing
              </span>
            ) : (
              `${Math.max(0, usage.limit - usage.used)} of ${usage.limit} free AI writes left today`
            )
          ) : (
            'Free: 5/day · Pro: unlimited'
          )}
        </p>

        <div className="p-3 space-y-4">
          {/* Step 1: what do you want */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              What do you want? <span className="text-slate-400 font-normal">— describe it in your own words</span>
            </label>
            <textarea
              rows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={generating}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all resize-none text-sm"
              placeholder={placeholder || FIELD_PLACEHOLDERS[field]}
            />
            <p className="text-xs text-slate-400 mt-1.5">
              The AI writes in the same language you type — English, Hindi, Hinglish, anything.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700">
              {error}
              {!clientFree && usage && !usage.isPro && (
                <span className="block mt-1 text-rose-500">
                  Upgrade to Pro on the <span className="font-semibold">Pricing</span> page for unlimited AI writing.
                </span>
              )}
            </div>
          )}

          {/* Step 2: result */}
          {result !== null && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Your AI result <span className="text-slate-400 font-normal">— tweak it if you like</span>
              </label>
              <textarea
                rows={6}
                value={editedResult}
                onChange={(e) => setEditedResult(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-violet-200 bg-violet-50/40 focus:border-violet-500 focus:ring-2 focus:ring-violet-200 outline-none transition-all resize-none text-sm"
              />
              <div className="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  onClick={apply}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors"
                >
                  <Check className="w-4 h-4" /> Use this text
                </button>
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} /> Regenerate
                </button>
              </div>
            </div>
          )}

          {/* Generate button */}
          {result === null && (
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="w-full inline-flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-bold rounded-xl hover:from-violet-700 hover:to-fuchsia-700 transition-all disabled:opacity-60"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Writing your {field.includes('title') ? 'title' : 'text'}...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generate
                </>
              )}
            </button>
          )}
        </div>
    </ModalShell>
  );
}

export default AIGenerateModal;
