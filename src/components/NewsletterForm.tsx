import { useState } from 'react';
import { CheckCircle2, Loader2, Mail, Send, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim() || !email.includes('@')) {
      setMessage('Please enter a valid email address.');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setMessage('');

    try {
      const { data, error } = await supabase.functions.invoke('newsletter-subscribe', {
        method: 'POST',
        body: { email: email.trim(), name: name.trim() || undefined },
      });

      if (error) {
        setMessage(error.message || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }

      if (data?.success) {
        setStatus('success');
        setMessage(data.welcome_email_sent
          ? 'Subscribed! Check your inbox for the welcome email 🎉'
          : 'Subscribed successfully! Welcome aboard 🎉'
        );
        setEmail('');
        setName('');
      } else {
        setMessage(data?.error || 'Failed to subscribe. Please try again.');
        setStatus('error');
      }
    } catch {
      setMessage('Network error. Please check your connection.');
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl p-5 border border-emerald-200 shadow-sm text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <p className="font-bold text-emerald-800 text-sm">You're subscribed! 🎉</p>
        <p className="text-xs text-emerald-600 mt-1">{message}</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 rounded-2xl p-5 md:p-6 border border-emerald-800/30 shadow-lg">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles className="w-4 h-4 text-emerald-400" />
        <p className="text-sm font-bold text-white">Stay in the loop</p>
      </div>
      <p className="text-xs text-slate-400 mb-4 leading-relaxed">
        Get product updates, freelancing tips, and early access opportunities.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (optional)"
            className="w-full h-10 px-3.5 bg-white/10 border border-white/10 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
          />
        </div>
        <div className="relative">
          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            className="w-full h-10 pl-10 pr-4 bg-white/10 border border-white/10 rounded-xl text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
          />
        </div>
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="w-full h-10 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all text-sm shadow-lg shadow-emerald-600/20"
        >
          {status === 'submitting' ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Subscribing...</>
          ) : (
            <><Send className="w-4 h-4" /> Subscribe</>
          )}
        </button>
      </form>

      {status === 'error' && (
        <p className="text-xs text-red-400 mt-2">{message}</p>
      )}

      <p className="text-[10px] text-slate-500 mt-3">
        No spam, unsubscribe anytime. We respect your inbox.
      </p>
    </div>
  );
}
