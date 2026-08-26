import { useState, useEffect, useCallback } from 'react';
import {
  AlertTriangle,
  Database,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { adminQuery, adminPurgeOrphans } from '../../lib/adminDataProxy';
import { useToast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';
import { safeFormatDate } from '../../utils/date';

interface DeletionFailure {
  id: number;
  user_id: string;
  error: string;
  report: any;
  created_at: string;
}

interface PurgeResult {
  success: boolean;
  orphans_found?: number;
  report?: Array<{ orphan_id: string; email?: string; result: any }>;
  error?: string;
}

export function AdminDataIsolationPage() {
  const toast = useToast();
  const [failures, setFailures] = useState<DeletionFailure[]>([]);
  const [loading, setLoading] = useState(true);
  const [purgeRunning, setPurgeRunning] = useState(false);
  const [lastPurge, setLastPurge] = useState<PurgeResult | null>(null);
  const [purgeConfirmOpen, setPurgeConfirmOpen] = useState(false);

  const fetchFailures = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminQuery<DeletionFailure>({
        table: 'deletion_failures',
        order: 'created_at',
        orderDir: 'desc',
        limit: 100,
      });
      setFailures(data || []);
    } catch (err) {
      toast.error('Load Failed', err instanceof Error ? err.message : 'Failed to load deletion failures');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchFailures();
  }, [fetchFailures]);

  const handlePurge = () => {
    if (purgeRunning) return;
    setPurgeConfirmOpen(true);
  };

  const doPurge = async () => {
    setPurgeRunning(true);
    try {
      const res = await adminPurgeOrphans();
      if (!res.success) {
        toast.error('Purge Failed', res.error || 'Unknown error');
      } else {
        const found = res.result?.orphans_found ?? 0;
        toast.success(
          'Purge Complete',
          found === 0
            ? 'No orphan profiles found — database is clean ✅'
            : `${found} orphan profile${found === 1 ? '' : 's'} purged ✅`
        );
      }
      setLastPurge(res.result || null);
      void fetchFailures();
    } catch (err) {
      toast.error('Purge Error', err instanceof Error ? err.message : 'Failed to run purge');
    } finally {
      setPurgeRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/20">
            <ShieldAlert className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-white">Data Isolation</h1>
            <p className="text-slate-400">
              Orphaned user data &amp; deletion failures — GDPR-grade cleanup at scale
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchFailures()}
            className="px-4 py-2.5 border border-white/10 text-slate-400 font-medium rounded-xl hover:bg-white/5 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button
            onClick={handlePurge}
            disabled={purgeRunning}
            className="px-4 py-2.5 bg-rose-600 text-white font-medium rounded-xl hover:bg-rose-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {purgeRunning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {purgeRunning ? 'Purging...' : 'Run Orphan Purge'}
          </button>
        </div>
      </div>

      {/* Explain banner */}
      <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-rose-200 leading-relaxed">
            <p className="font-semibold mb-1">What this does</p>
            <p>
              When a user is deleted, Growlancer wipes every trace of their data automatically. If any deletion
              was interrupted (rare), an <strong>orphan profile</strong> can remain — a profile row whose auth
              account no longer exists. Orphan data is invisible to other users but pollutes the database and
              could block re-signup with the same email. <strong>Run Orphan Purge</strong> finds and completely
              deletes all of it. The weekly cron already runs this every Sunday at 03:00 UTC.
            </p>
          </div>
        </div>
      </div>

      {/* Last purge result */}
      {lastPurge && (
        <div className={`rounded-2xl p-5 border ${lastPurge.success ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-amber-500/10 border-amber-500/20'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Database className={`w-5 h-5 ${lastPurge.success ? 'text-emerald-400' : 'text-amber-400'}`} />
            <h3 className="font-bold text-white">Last Purge Result</h3>
          </div>
          <p className="text-sm text-slate-300 mb-2">
            <strong>Orphans found:</strong> {lastPurge.orphans_found ?? 0}
            {lastPurge.error && <span className="text-amber-400"> · {lastPurge.error}</span>}
          </p>
          {Array.isArray(lastPurge.report) && lastPurge.report.length > 0 && (
            <div className="space-y-2">
              {lastPurge.report.map((r) => (
                <div key={r.orphan_id} className="bg-slate-800/60 rounded-xl border border-white/10 p-3 text-xs text-slate-400">
                  <p className="font-mono mb-1">{r.email || r.orphan_id}</p>
                  <p className={r.result?.success ? 'text-emerald-400' : 'text-rose-600'}>
                    {r.result?.success ? '✓ Fully deleted' : `✗ ${r.result?.errors?.[0]?.error || 'partial failure'}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deletion failures */}
      <div className="bg-slate-800/60 rounded-2xl border border-white/10 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-white">Deletion Failures Log</h3>
            <p className="text-xs text-slate-400">Any incomplete automatic deletion — visible here for follow-up</p>
          </div>
          {failures.length > 0 && (
            <span className="px-2.5 py-1 bg-rose-500/15 text-rose-300 text-xs font-bold rounded-full">
              {failures.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
          </div>
        ) : failures.length === 0 ? (
          <div className="p-10 text-center">
            <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
              <Database className="w-7 h-7 text-emerald-500" />
            </div>
            <p className="font-medium text-slate-300 mb-1">No deletion failures</p>
            <p className="text-sm text-slate-400">Every user deletion has completed cleanly. 🎉</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {failures.map((f) => (
              <div key={f.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-2 md:gap-4">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-xs text-slate-400 mb-1">{f.user_id}</p>
                  <p className="text-sm text-rose-700">{f.error}</p>
                </div>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  {safeFormatDate(f.created_at) || '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={purgeConfirmOpen}
        onClose={() => setPurgeConfirmOpen(false)}
        onConfirm={async () => {
          setPurgeConfirmOpen(false);
          await doPurge();
        }}
        title="Purge Orphaned Data"
        message="This permanently deletes ALL remaining data of orphaned profiles (users whose auth account no longer exists). This cannot be undone. Continue?"
        confirmLabel="Yes, purge"
        variant="danger"
      />
    </div>
  );
}
