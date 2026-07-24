/**
 * Admin QR Manager — Full QR lifecycle management for credentials.
 * 
 * Features:
 * - Generate QR (initial)
 * - Regenerate QR (new token, invalidates old)
 * - Replace QR (same as regenerate but logged as 'replaced')
 * - Revoke QR (invalidate active token without replacement)
 * - Download QR (download as PNG)
 * - Preview QR (show QR code in modal)
 * - Version History tab
 * - Audit Logs tab
 */

import { useState, useEffect, useCallback } from 'react';
import {
  QrCode, Loader2, RefreshCw, Trash2, Download, Eye,
  History, FileText, Copy, CheckCheck, XCircle,
  ArrowLeft,
} from 'lucide-react';
import {
  generateQRToken, regenerateQRToken, replaceQRToken,
  revokeQRToken, deleteQRToken, deleteAllOldTokens,
  getActiveToken, getCredentialTokens,
  getCredentialHistory, getCredentialAuditLogs,
  getQRCodeDataUrl, getVerificationUrl,
  type VerificationToken, type VersionHistoryEntry, type AuditLogEntry,
} from '../../lib/credentialVerification';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../Toast';

interface Props {
  credentialId: string;
  verificationCode: string;
  recipientName: string;
  onBack: () => void;
}

export function AdminQRManager({ credentialId, verificationCode, recipientName, onBack }: Props) {
  const { user } = useAuth();
  const toast = useToast();

  const [activeToken, setActiveToken] = useState<VerificationToken | null>(null);
  const [allTokens, setAllTokens] = useState<VerificationToken[]>([]);
  const [history, setHistory] = useState<VersionHistoryEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'qr' | 'history' | 'audit'>('qr');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const verifyUrl = getVerificationUrl(verificationCode);
  const qrImageUrl = activeToken ? getQRCodeDataUrl(activeToken.token) : null;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [token, tokens, hist, audits] = await Promise.all([
        getActiveToken(credentialId),
        getCredentialTokens(credentialId),
        getCredentialHistory(credentialId),
        getCredentialAuditLogs({ credentialId }),
      ]);
      setActiveToken(token);
      setAllTokens(tokens);
      setHistory(hist);
      setAuditLogs(audits);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [credentialId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleGenerate = async () => {
    if (!user?.id) return;
    if (!confirm(`Generate QR token for ${recipientName}?`)) return;
    setActionLoading('generate');
    try {
      const res = await generateQRToken(credentialId, user.id);
      if (res.success) {
        toast.success('QR Generated', `QR token created for ${recipientName}`);
        fetchData();
      } else {
        toast.error('Failed', res.error || 'Generation failed');
      }
    } catch {
      toast.error('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRegenerate = async () => {
    if (!user?.id || !user?.email) return;
    const reason = prompt('Reason for regenerating QR:');
    if (!reason) return;
    if (!confirm(`REGENERATE QR for ${recipientName}? This will INVALIDATE the current QR code!`)) return;
    setActionLoading('regenerate');
    try {
      const res = await regenerateQRToken(credentialId, user.id, user.email, reason);
      if (res.success) {
        toast.success('QR Regenerated', `New QR token created. Old one is invalidated.`);
        fetchData();
      } else {
        toast.error('Failed', res.error || 'Regeneration failed');
      }
    } catch {
      toast.error('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReplace = async () => {
    if (!user?.id || !user?.email) return;
    const reason = prompt('Reason for replacing QR:');
    if (!reason) return;
    if (!confirm(`REPLACE QR for ${recipientName}? This will mark the current credential as replaced!`)) return;
    setActionLoading('replace');
    try {
      const res = await replaceQRToken(credentialId, user.id, user.email, reason);
      if (res.success) {
        toast.success('QR Replaced', `QR token replaced successfully.`);
        fetchData();
      } else {
        toast.error('Failed', res.error || 'Replacement failed');
      }
    } catch {
      toast.error('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteActive = async () => {
    if (!activeToken || !user?.id || !user?.email) return;
    if (!confirm(`⚠️ PERMANENTLY DELETE active QR token for ${recipientName}?

This will remove the QR code permanently with NO WAY TO RECOVER!
The credential will have NO ACTIVE QR CODE until you generate a new one.

Are you absolutely sure?`)) return;
    const reason = prompt('Reason for deleting QR (required):');
    if (!reason) { toast.info('Cancelled', 'Deletion cancelled - reason is required'); return; }
    setActionLoading('delete-active');
    try {
      const res = await deleteQRToken(activeToken.id, credentialId, user.id, user.email, reason);
      if (res.success) {
        toast.success('QR Deleted', 'Active QR token permanently deleted');
        fetchData();
      } else {
        toast.error('Failed', res.error || 'Deletion failed');
      }
    } catch {
      toast.error('Error', 'Failed to delete QR token');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteOldToken = async (tokenId: string) => {
    if (!user?.id || !user?.email) return;
    if (!confirm('Permanently delete this old QR token?')) return;
    setActionLoading(`delete-${tokenId}`);
    try {
      const res = await deleteQRToken(tokenId, credentialId, user.id, user.email, 'Old token cleaned up');
      if (res.success) {
        toast.success('Deleted', 'Old QR token removed');
        fetchData();
      } else {
        toast.error('Failed', res.error || 'Deletion failed');
      }
    } catch {
      toast.error('Error', 'Failed to delete');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCleanupAllOld = async () => {
    if (!user?.id || !user?.email) return;
    const oldCount = allTokens.filter(t => t.status !== 'active').length;
    if (oldCount === 0) {
      toast.info('No Old Tokens', 'No old/revoked tokens to clean up');
      return;
    }
    if (!confirm(`Delete ALL ${oldCount} old/revoked QR tokens? This cannot be undone!`)) return;
    setActionLoading('cleanup-all');
    try {
      const res = await deleteAllOldTokens(credentialId, user.id, user.email);
      if (res.success) {
        toast.success('Cleaned Up', `${res.count || oldCount} old QR tokens deleted`);
        fetchData();
      } else {
        toast.error('Failed', res.error || 'Cleanup failed');
      }
    } catch {
      toast.error('Error', 'Failed to clean up');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRevoke = async () => {
    if (!activeToken || !user?.id || !user?.email) return;
    const reason = prompt('Reason for revoking QR:');
    if (!reason) return;
    if (!confirm(`REVOKE QR for ${recipientName}? This will invalidate the QR code permanently!`)) return;
    setActionLoading('revoke');
    try {
      const res = await revokeQRToken(activeToken.id, credentialId, user.id, user.email, reason);
      if (res.success) {
        toast.success('QR Revoked', `QR token revoked for ${recipientName}`);
        fetchData();
      } else {
        toast.error('Failed', res.error || 'Revocation failed');
      }
    } catch {
      toast.error('Error', 'An unexpected error occurred');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDownload = async () => {
    if (!qrImageUrl) return;
    try {
      const response = await fetch(qrImageUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `growlancer-qr-${verificationCode}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded', 'QR code image downloaded');
    } catch {
      toast.error('Failed', 'Could not download QR image');
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(verifyUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  function formatDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // ─── Loading State ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
      </div>
    );
  }

  const svgQrImageUrl = activeToken
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(verifyUrl)}&bgcolor=ffffff&color=059669`
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h3 className="text-lg font-bold text-white">QR Management</h3>
            <p className="text-xs text-slate-400">{recipientName} — {verificationCode}</p>
          </div>
        </div>
      </div>

      {/* Sub Tabs */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        {(['qr', 'history', 'audit'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeSubTab === tab
                ? 'bg-purple-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {tab === 'qr' && <QrCode className="w-4 h-4" />}
            {tab === 'history' && <History className="w-4 h-4" />}
            {tab === 'audit' && <FileText className="w-4 h-4" />}
            {tab === 'qr' ? 'QR Code' : tab === 'history' ? 'Version History' : 'Audit Logs'}
          </button>
        ))}
      </div>

      {/* ─── QR Tab ──────────────────────────────────────────────── */}
      {activeSubTab === 'qr' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* QR Code Display */}
          <div className="p-6 rounded-2xl flex flex-col items-center" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
            <h4 className="text-sm font-bold text-white mb-4">Active QR Code</h4>
            {svgQrImageUrl ? (
              <>
                <img
                  src={svgQrImageUrl}
                  alt="Verification QR Code"
                  className="w-48 h-48 rounded-xl bg-white p-2 cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setPreviewUrl(svgQrImageUrl)}
                />
                <p className="text-[10px] text-slate-500 mt-3 font-mono">
                  v{activeToken?.token_version || 1}
                </p>
                <div className="flex items-center gap-2 mt-4">
                  <button onClick={handleDownload}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all">
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button onClick={() => setPreviewUrl(svgQrImageUrl!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-600 text-white text-xs font-bold hover:bg-slate-700 transition-all">
                    <Eye className="w-3.5 h-3.5" /> Preview
                  </button>
                </div>
              </>
            ) : (
              <div className="w-48 h-48 rounded-xl bg-slate-800 flex items-center justify-center border-2 border-dashed border-slate-600">
                <div className="text-center">
                  <QrCode className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-500">No QR generated yet</p>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white mb-2">QR Actions</h4>

            {/* Verification URL */}
            <div className="p-4 rounded-xl" style={{ background: 'rgba(5, 150, 105, 0.08)', border: '1px solid rgba(5, 150, 105, 0.2)' }}>
              <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Verification URL</p>
              <div className="flex items-center gap-2">
                <input type="text" readOnly value={verifyUrl}
                  className="flex-1 bg-slate-800 border border-white/5 rounded-lg px-3 py-2 text-xs font-mono text-slate-300" />
                <button onClick={handleCopyUrl}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-700 text-xs font-bold text-slate-300 hover:text-emerald-400 transition-colors">
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            {!activeToken ? (
              <button onClick={handleGenerate} disabled={actionLoading === 'generate'}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all">
                {actionLoading === 'generate' ? <Loader2 className="w-5 h-5 animate-spin" /> : <QrCode className="w-5 h-5" />}
                Generate QR Code
              </button>
            ) : (
              <div className="space-y-3">
                <button onClick={handleRegenerate} disabled={!!actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-amber-600 text-white text-sm font-bold hover:bg-amber-700 disabled:opacity-50 transition-all">
                  {actionLoading === 'regenerate' ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  Regenerate QR
                </button>
                <button onClick={handleReplace} disabled={!!actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-all">
                  {actionLoading === 'replace' ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  Replace QR (with new)
                </button>
                <button onClick={handleRevoke} disabled={!!actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 disabled:opacity-50 transition-all">
                  {actionLoading === 'revoke' ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />}
                  Revoke QR
                </button>
                <button onClick={handleDeleteActive} disabled={!!actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-800 text-white text-sm font-bold hover:bg-red-900 disabled:opacity-50 transition-all">
                  {actionLoading === 'delete-active' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  Delete Active QR
                </button>
              </div>
            )}

            {/* Token Info */}
            {activeToken && (
              <div className="p-4 rounded-xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Current Token Info</p>
                <div className="space-y-1.5 text-xs">
                  <p className="flex justify-between"><span className="text-slate-500">Version:</span><span className="text-slate-300">{activeToken.token_version}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Status:</span><span className="text-emerald-400 font-bold">{activeToken.status}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Created:</span><span className="text-slate-300">{formatDate(activeToken.created_at)}</span></p>
                  <p className="flex justify-between"><span className="text-slate-500">Token:</span><span className="text-slate-300 font-mono text-[9px] truncate max-w-[200px]">{activeToken.token}</span></p>
                </div>
              </div>
            )}

            {/* Old Tokens Display */}
            {allTokens.filter(t => t.status !== 'active').length > 0 && (
              <div className="p-4 rounded-xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Old QR Tokens</p>
                  <button onClick={handleCleanupAllOld} disabled={!!actionLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 text-red-400 text-[9px] font-bold hover:bg-red-500/20 transition-colors">
                    <Trash2 className="w-3 h-3" /> Delete All
                  </button>
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {allTokens.filter(t => t.status !== 'active').map(t => (
                    <div key={t.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800/50">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-slate-400">v{t.token_version} — <span className={`${t.status === 'revoked' ? 'text-red-400' : 'text-amber-400'}`}>{t.status}</span></p>
                        <p className="text-[9px] font-mono text-slate-600 truncate">{t.token}</p>
                      </div>
                      <button onClick={() => handleDeleteOldToken(t.id)} disabled={!!actionLoading}
                        className="shrink-0 p-1.5 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Version History Tab ─────────────────────────────────── */}
      {activeSubTab === 'history' && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-white">Version History</h4>
          {history.length === 0 ? (
            <div className="text-center py-10 text-slate-500" style={{ background: '#1E293B', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <History className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No version history yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => (
                <div key={entry.id} className="p-4 rounded-xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white">v{entry.version_number}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        entry.action.includes('created') ? 'bg-emerald-500/10 text-emerald-400' :
                        entry.action.includes('regener') ? 'bg-amber-500/10 text-amber-400' :
                        entry.action.includes('replaced') ? 'bg-violet-500/10 text-violet-400' :
                        entry.action.includes('revoked') ? 'bg-red-500/10 text-red-400' :
                        'bg-slate-500/10 text-slate-400'
                      }`}>
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">{formatDate(entry.created_at)}</span>
                  </div>
                  {entry.notes && <p className="text-xs text-slate-400">{entry.notes}</p>}
                  <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-600">
                    {entry.old_qr_token && <span className="truncate max-w-[120px]">Old: {entry.old_qr_token}</span>}
                    {entry.new_qr_token && <span className="truncate max-w-[120px]">New: {entry.new_qr_token}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Audit Logs Tab ──────────────────────────────────────── */}
      {activeSubTab === 'audit' && (
        <div className="space-y-3">
          <h4 className="text-sm font-bold text-white">Audit Logs</h4>
          {auditLogs.length === 0 ? (
            <div className="text-center py-10 text-slate-500" style={{ background: '#1E293B', borderRadius: '1rem', border: '1px solid rgba(255,255,255,0.05)' }}>
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No audit logs yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {auditLogs.map((log) => (
                <div key={log.id} className="p-4 rounded-xl flex items-start gap-3" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    log.action.includes('regener') || log.action.includes('replace') ? 'bg-amber-500/10' :
                    log.action.includes('revoke') ? 'bg-red-500/10' :
                    log.action.includes('generat') ? 'bg-emerald-500/10' :
                    'bg-slate-500/10'
                  }`}>
                    {log.action.includes('revoke') ? <XCircle className="w-4 h-4 text-red-400" /> :
                     log.action.includes('generat') ? <QrCode className="w-4 h-4 text-emerald-400" /> :
                     <RefreshCw className="w-4 h-4 text-amber-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-white capitalize">{log.action.replace(/_/g, ' ')}</p>
                      <span className="text-[10px] text-slate-500 shrink-0">{formatDate(log.created_at)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {log.admin_email ? `by ${log.admin_email}` : 'by system'}
                    </p>
                    {log.details && Object.keys(log.details).length > 0 && (
                      <p className="text-[10px] text-slate-500 mt-1">
                        {JSON.stringify(log.details).slice(0, 200)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* QR Preview Modal */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewUrl(null)}>
          <div className="bg-slate-900 rounded-2xl p-8 border border-white/10 shadow-2xl max-w-sm"
            onClick={e => e.stopPropagation()}>
            <img src={previewUrl} alt="QR Preview" className="w-full rounded-xl" />
            <p className="text-center text-xs text-slate-400 mt-4">Growlancer Credential Verification QR</p>
            <button onClick={() => setPreviewUrl(null)}
              className="w-full mt-4 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-sm font-bold hover:bg-slate-700 transition-colors">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
