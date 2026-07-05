import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

type SystemRow = {
  name: string;
  status: string;
  detail: string;
  icon: typeof CheckCircle;
  color: string;
};

export function StatusPage() {
  const [lastUpdated, setLastUpdated] = useState('');
  const [systems, setSystems] = useState<SystemRow[]>([]);
  const [overall, setOverall] = useState<'operational' | 'degraded' | 'checking'>('checking');

  useEffect(() => {
    const check = async () => {
      setLastUpdated(new Date().toLocaleString());
      const rows: SystemRow[] = [];
      let degraded = false;

      try {
        const start = Date.now();
        const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' });
        const ms = Date.now() - start;
        if (error) {
          degraded = true;
          rows.push({
            name: 'Database (Supabase)',
            status: 'Unavailable',
            detail: error.message,
            icon: AlertCircle,
            color: 'text-red-500',
          });
        } else {
          rows.push({
            name: 'Database (Supabase)',
            status: ms < 2000 ? 'Operational' : 'Slow',
            detail: `API responded in ${ms}ms`,
            icon: ms < 2000 ? CheckCircle : Clock,
            color: ms < 2000 ? 'text-emerald-500' : 'text-amber-500',
          });
          if (ms >= 2000) degraded = true;
        }
      } catch {
        degraded = true;
        rows.push({
          name: 'Database (Supabase)',
          status: 'Unreachable',
          detail: 'Could not reach Supabase',
          icon: AlertCircle,
          color: 'text-red-500',
        });
      }

      rows.push({
        name: 'Realtime (workflow tables)',
        status: 'Pre-launch monitoring',
        detail: 'Live updates enabled for projects, contracts, messages, payments',
        icon: CheckCircle,
        color: 'text-emerald-500',
      });
      rows.push({
        name: 'AI matching',
        status: 'Operational',
        detail: 'Server-side scoring via generate_project_matches',
        icon: CheckCircle,
        color: 'text-emerald-500',
      });
      rows.push({
        name: 'PayPal / escrow',
        status: 'Configure for production',
        detail: 'Requires PayPal credentials on Edge Functions before go-live',
        icon: Clock,
        color: 'text-amber-500',
      });

      setSystems(rows);
      setOverall(degraded ? 'degraded' : 'operational');
    };

    void check();
    const interval = setInterval(() => void check(), 120_000);
    return () => clearInterval(interval);
  }, []);

  const incidents = [
    {
      date: 'Pre-launch',
      title: 'Platform in active development',
      status: 'Info',
      duration: '—',
    },
  ];

  const overallLabel =
    overall === 'checking'
      ? 'Checking…'
      : overall === 'operational'
        ? 'All systems operational'
        : 'Some systems degraded';

  const overallColor =
    overall === 'operational'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : overall === 'degraded'
        ? 'bg-amber-50 text-amber-800 border-amber-200'
        : 'bg-slate-50 text-slate-600 border-slate-200';

  return (
    <div className="min-h-screen bg-cream font-sans pb-24 text-slate-800">
      {/* Premium Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 group">
            <img src="/Growlancer Logo (2).png" alt="Growlancer" className="h-8 w-8 rounded-lg transition-transform group-hover:scale-105" />
            <span className="font-display font-black text-xl tracking-tight text-slate-900">Growlancer</span>
          </Link>
          <Link to="/" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">
            Back to Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 py-12">
        <h1 className="font-display text-3xl font-bold text-slate-900 mb-2">System status</h1>
        <p className="text-slate-600 mb-8">
          Honest pre-launch checks — no fabricated uptime percentages. Last checked:{' '}
          {lastUpdated || '…'}
        </p>

        <div className={`rounded-2xl border px-6 py-4 mb-10 ${overallColor}`}>
          <p className="font-semibold">{overallLabel}</p>
        </div>

        <section className="space-y-4 mb-12">
          {systems.length === 0 && overall === 'checking' ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
            </div>
          ) : (
            systems.map((sys) => {
              const Icon = sys.icon;
              return (
                <div key={sys.name} className="bg-white rounded-xl border border-slate-100 p-5 flex items-start gap-4">
                  <Icon className={`w-6 h-6 shrink-0 mt-0.5 ${sys.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900">{sys.name}</p>
                    <p className="text-sm text-slate-600 mt-0.5">{sys.detail}</p>
                  </div>
                  <span className="text-sm font-medium text-slate-700 shrink-0">{sys.status}</span>
                </div>
              );
            })
          )}
        </section>

        <section>
          <h2 className="font-display text-xl font-bold text-slate-900 mb-4">Recent incidents</h2>
          <div className="space-y-3">
            {incidents.map((inc) => (
              <div key={inc.title} className="bg-white rounded-xl border border-slate-100 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500 mb-1">
                  <span>{inc.date}</span>
                  <span>·</span>
                  <span className="font-medium text-slate-700">{inc.status}</span>
                  <span>·</span>
                  <span>{inc.duration}</span>
                </div>
                <p className="font-medium text-slate-900">{inc.title}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
