import { useState, useEffect, useCallback } from 'react';
import {
  Shield, Search, Loader2, RefreshCw, Mail, FileText,
  CheckCircle2, XCircle, AlertTriangle, ExternalLink, Clock,
  Eye, BadgeCheck, AlertCircle, ShieldAlert,
  Copy, CheckCheck, X, KeyRound, Save, Trash2, ShieldCheck, Sparkles,
} from 'lucide-react';
import { identityVerificationService, type IdentityVerification } from '../../lib/identityVerification';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

// ─── Types ───────────────────────────────────────────────────────────────────
type TabFilter = 'all' | 'pending' | 'review' | 'verified' | 'rejected';

interface VerificationWithUser extends IdentityVerification {
  user_name?: string;
  user_email?: string;
  user_avatar?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 720) return `${Math.floor(hours / 24)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getTypeLabel(type?: string): string {
  const labels: Record<string, string> = {
    passport: 'Passport',
    drivers_license: "Driver's License",
    national_id: 'National ID',
    aadhaar: 'Aadhaar Card',
    pan: 'PAN Card',
    other: 'Other Document',
  };
  return labels[type || ''] || type || 'Unknown';
}

/**
 * Extract the storage object path from a signed URL or raw path.
 * Signed URL format:  .../object/sign/verification-documents/<path>?token=...
 * Raw path format:    <userId>/verification-docs/<file>   OR   verification-docs/<file>
 * Keeps the FULL path (including the userId prefix) so re-signing works with
 * the storage RLS policy that keys on the first folder being the user UUID.
 */
function extractStoragePath(url: string): string | null {
  if (!url) return null;
  // Signed URL — pull everything after the bucket marker, before the query string
  const marker = '/object/sign/verification-documents/';
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    const rest = url.substring(idx + marker.length);
    return rest.split('?')[0] || null;
  }
  // Raw path — already a storage path (with or without userId prefix)
  if (url.startsWith('verification-documents/')) {
    return url.substring('verification-documents/'.length) || null;
  }
  if (url.includes('verification-docs/')) {
    return url.split('?')[0];
  }
  return null;
}

const statusColors: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  verified: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
};

// ─── Document Preview Modal ──────────────────────────────────────────────────
function DocumentPreviewModal({
  verification,
  onClose,
}: {
  verification: VerificationWithUser;
  onClose: () => void;
}) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isImgLoaded, setIsImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  // BACK-side image (Aadhaar / Passport / DL / National ID)
  const [signedBackUrl, setSignedBackUrl] = useState<string | null>(null);
  const [loadingBack, setLoadingBack] = useState(false);
  const [backError, setBackError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDocument() {
      setLoadingUrl(true);
      setUrlError(null);
      setImgError(false);

      const docUrl = verification.document_url || '';
      if (!docUrl) {
        setUrlError('No document URL available');
        setLoadingUrl(false);
        return;
      }

      // If it's a Supabase storage path (signed URL or raw path), re-sign it
      const filePath = extractStoragePath(docUrl);
      if (filePath) {
        const result = await identityVerificationService.getSignedDocumentUrl(filePath, 600);
        if (result.success && result.url) {
          setSignedUrl(result.url);
        } else {
          setUrlError(result.error || 'Failed to generate signed URL. The document may have expired.');
        }
      } else if (docUrl.startsWith('http://') || docUrl.startsWith('https://')) {
        // External URL — use directly (already a signed URL from upload or external link)
        setSignedUrl(docUrl);
      } else {
        setUrlError('Invalid document path. The document may have been stored with an incompatible format.');
      }

      setLoadingUrl(false);
    }
    loadDocument();

    // BACK side (if present) — async IIFE so the effect callback stays sync
    void (async () => {
      const backDocUrl = verification.document_url_back || '';
      if (!backDocUrl) return;
      setLoadingBack(true);
      setBackError(null);
      const backPath = extractStoragePath(backDocUrl);
      if (backPath) {
        const result = await identityVerificationService.getSignedDocumentUrl(backPath, 600);
        if (result.success && result.url) setSignedBackUrl(result.url);
        else setBackError(result.error || 'Failed to generate signed URL for back side.');
      } else if (backDocUrl.startsWith('http://') || backDocUrl.startsWith('https://')) {
        setSignedBackUrl(backDocUrl);
      } else {
        setBackError('Invalid back document path.');
      }
      setLoadingBack(false);
    })();
  }, [verification.document_url, verification.document_url_back]);

  const isImage = signedUrl?.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i);
  const isPdf = signedUrl?.match(/\.pdf$/i);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[90vh] rounded-[2rem] overflow-hidden animate-in zoom-in-95"
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                {getTypeLabel(verification.document_type)} — {verification.user_name || 'Unknown User'}
              </h3>
              <p className="text-[10px] text-slate-500">{verification.user_email}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Document Viewer */}
        <div className="p-6 max-h-[calc(90vh-80px)] overflow-y-auto">
          {loadingUrl ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-400 mb-3" />
              <p className="text-sm text-slate-400">Generating secure document link...</p>
            </div>
          ) : urlError ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <ShieldAlert className="w-12 h-12 text-red-400 mb-4" />
              <p className="text-sm font-bold text-white mb-2">Document Unavailable</p>
              <p className="text-xs text-slate-400 max-w-md">{urlError}</p>
              <p className="text-[10px] text-slate-500 mt-4">
                The storage bucket is private. Documents are accessed via time-limited signed URLs for security.
              </p>
            </div>
          ) : signedUrl && isImage ? (
            <div className="relative">
              {!isImgLoaded && !imgError && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              )}
              {imgError ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
                  <p className="text-sm text-slate-400">Failed to load image</p>
                </div>
              ) : (
                <img
                  src={signedUrl}
                  alt="Verification Document"
                  onLoad={() => setIsImgLoaded(true)}
                  onError={() => setImgError(true)}
                  className={`w-full rounded-xl ${isImgLoaded ? 'block' : 'hidden'}`}
                  style={{ maxHeight: '70vh', objectFit: 'contain' }}
                />
              )}
            </div>
          ) : signedUrl && isPdf ? (
            <iframe
              src={signedUrl}
              className="w-full rounded-xl"
              style={{ height: '70vh', border: 'none' }}
              title="Verification Document"
            />
          ) : signedUrl ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <FileText className="w-12 h-12 text-emerald-400 mb-4" />
              <p className="text-sm text-slate-300 mb-3">Document available for download</p>
              <a
                href={signedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm font-bold hover:bg-emerald-500/20 transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open Document
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <AlertCircle className="w-8 h-8 text-slate-500 mb-3" />
              <p className="text-sm text-slate-400">No document available</p>
            </div>
          )}

          {/* BACK-side image (two-sided documents) */}
          {verification.document_url_back && (
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-emerald-400" />
                <h4 className="text-xs font-bold text-white">Back Side</h4>
                {backError && <span className="text-[10px] text-red-400">{backError}</span>}
              </div>
              {loadingBack ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                </div>
              ) : signedBackUrl && signedBackUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i) ? (
                <img
                  src={signedBackUrl}
                  alt="Verification Document Back"
                  className="w-full rounded-xl"
                  style={{ maxHeight: '70vh', objectFit: 'contain' }}
                />
              ) : signedBackUrl ? (
                <a
                  href={signedBackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm font-bold hover:bg-emerald-500/20 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Back Document
                </a>
              ) : (
                <p className="text-xs text-slate-500">Back side unavailable.</p>
              )}
            </div>
          )}

          {/* Document Info */}
          <div className="mt-6 grid grid-cols-2 gap-4 p-4 rounded-xl bg-white/[0.03] border border-white/5">
            <div>
              <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Document Type</p>
              <p className="text-sm text-white font-medium mt-1">{getTypeLabel(verification.document_type)}</p>
            </div>
            {verification.document_number && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Document Number</p>
                <p className="text-sm text-white font-medium mt-1">{verification.document_number}</p>
              </div>
            )}
            {verification.expiry_date && (
              <div>
                <p className="text-[9px] uppercase tracking-wider text-slate-500 font-bold">Expiry Date</p>
                <p className="text-sm text-white font-medium mt-1">{formatDate(verification.expiry_date)}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Admin Page ─────────────────────────────────────────────────────────
export function AdminIdentityVerificationPage() {
  const [verifications, setVerifications] = useState<VerificationWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabFilter, setTabFilter] = useState<TabFilter>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewItem, setPreviewItem] = useState<VerificationWithUser | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; variant: 'danger' | 'warning' | 'info'; confirmLabel?: string; onConfirm: () => void | Promise<void> } | null>(null);
  const [rejectionModal, setRejectionModal] = useState<VerificationWithUser | null>(null);
  const toast = useToast();
  const [rejectionReason, setRejectionReason] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stats, setStats] = useState<{ pending: number; review: number; verified: number; rejected: number; total: number }>({
    pending: 0, review: 0, verified: 0, rejected: 0, total: 0,
  });

  // ── KYC provider config (founder-managed; token stored server-side only) ──
  const [providerStatus, setProviderStatus] = useState<{ configured: boolean; provider: string; mode: 'production' | 'development'; updated_at?: string } | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [providerBusy, setProviderBusy] = useState(false);

  const fetchProviderStatus = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('admin_get_kyc_provider_status' as any);
      const result = data as { success: boolean; configured: boolean; provider: string; mode?: 'production' | 'development'; updated_at?: string } | null;
      if (!error && result?.success) {
        setProviderStatus({ configured: !!result.configured, provider: result.provider, mode: result.mode === 'development' ? 'development' : 'production', updated_at: result.updated_at });
      } else {
        setProviderStatus(null);
      }
    } catch {
      setProviderStatus(null);
    }
  }, []);

  useEffect(() => {
    void fetchProviderStatus();
  }, [fetchProviderStatus]);

  const handleSaveToken = async () => {
    const token = tokenInput.trim();
    if (!token) {
      toast.error('Please paste your Surepass API token first.');
      return;
    }
    setProviderBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_set_kyc_provider_config' as any, { p_token: token, p_provider: 'surepass' });
      const result = data as { success: boolean; error?: string } | null;
      if (error || !result?.success) {
        toast.error('Failed to save', result?.error || error?.message || 'Please try again.');
      } else {
        toast.success('Verification provider configured', 'New PAN verifications are now verified automatically in real time.');
        setTokenInput('');
        await fetchProviderStatus();
      }
    } catch {
      toast.error('Failed to save the token. Please try again.');
    } finally {
      setProviderBusy(false);
    }
  };

  const handleSetMode = async (mode: 'production' | 'development') => {
    const isDev = mode === 'development';
    setConfirmDialog({
      isOpen: true,
      variant: isDev ? 'warning' : 'info',
      title: isDev ? 'Enable Development Verification Mode?' : 'Switch back to Production Mode?',
      message: isDev
        ? 'Users will be auto-verified instantly WITHOUT an external provider. Every record is honestly labelled provider="dev_mode" and can be re-verified for real later. Do NOT enable this in production — switch to Production when a real provider token is configured.'
        : 'New verifications will go through the real provider (or fail-safe review if none is configured). Previously dev-verified users keep their status until re-verified for real.',
      confirmLabel: isDev ? 'Enable Dev Mode' : 'Switch to Production',
      onConfirm: async () => {
        setProviderBusy(true);
        try {
          const { data, error } = await supabase.rpc('admin_set_kyc_mode' as any, { p_mode: mode });
          const result = data as { success: boolean; error?: string } | null;
          if (error || !result?.success) {
            toast.error('Failed to switch mode', result?.error || error?.message || 'Please try again.');
          } else {
            toast.success(
              isDev ? 'Development mode enabled' : 'Production mode enabled',
              isDev
                ? 'New submissions are now auto-verified instantly (provider: dev_mode).'
                : 'New submissions now use the real provider or fail-safe review.'
            );
            await fetchProviderStatus();
          }
        } catch {
          toast.error('Failed to switch mode. Please try again.');
        } finally {
          setProviderBusy(false);
        }
      },
    });
  };

  const handleClearToken = async () => {
    setProviderBusy(true);
    try {
      const { data, error } = await supabase.rpc('admin_clear_kyc_provider_config' as any);
      const result = data as { success: boolean; error?: string } | null;
      if (error || !result?.success) {
        toast.error('Failed to clear', result?.error || error?.message || 'Please try again.');
      } else {
        toast.success('Provider token cleared', 'New verifications will wait in review until a token is configured again.');
        await fetchProviderStatus();
      }
    } catch {
      toast.error('Failed to clear the token. Please try again.');
    } finally {
      setProviderBusy(false);
    }
  };

  const fetchVerifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data: allData, error } = await supabase
        .from('identity_verifications' as any)
        .select()
        .order('created_at', { ascending: false });

      if (error) throw error;

      const records = ((allData || []) as unknown) as IdentityVerification[];

      // Calculate stats
      setStats({
        pending: records.filter((v) => v.status === 'pending').length,
        review: records.filter((v) => (v as any).status === 'review').length,
        verified: records.filter((v) => v.status === 'verified').length,
        rejected: records.filter((v) => v.status === 'rejected').length,
        total: records.length,
      });

      // Fetch user info for each verification
      const userIds = [...new Set(records.map((v) => v.user_id))];
      const { data: profiles } = await supabase
        .from('profiles' as any)
        .select()
        .in('id', userIds);

      const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

      const enriched: VerificationWithUser[] = records.map((v) => {
        const profile = profileMap.get(v.user_id);
        return {
          ...v,
          user_name: profile?.name || 'Deleted User',
          user_email: profile?.email || 'Unknown',
          user_avatar: profile?.avatar || null,
        };
      });

      setVerifications(enriched);
    } catch (err) {
      console.error('Failed to fetch verifications:', err);
      toast.error('Failed to fetch verifications', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchVerifications();
  }, [fetchVerifications]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel(`admin-verifications-${Date.now()}`)
      .on('postgres_changes' as any, {
        event: '*',
        schema: 'public',
        table: 'identity_verifications',
      }, () => fetchVerifications())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [fetchVerifications]);

  // ─── Actions ───────────────────────────────────────────────────────────

  const handleApprove = async (verification: VerificationWithUser) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Approve Verification',
      message: `✅ Approve identity verification for "${verification.user_name}"?`,
      variant: 'info',
      confirmLabel: 'Approve',
      onConfirm: async () => {
        setActionLoading(`approve-${verification.id}`);
        try {
          const result = await identityVerificationService.adminUpdateStatus(verification.id, 'verified');
          if (!result.success) throw new Error(result.error);
          await fetchVerifications();
          toast.success(`Verification approved for ${verification.user_name}`);
          setConfirmDialog(null);
        } catch (err) {
          console.error('Approve error:', err);
          toast.error('Failed to approve verification', err instanceof Error ? err.message : 'Unknown error');
        } finally {
          setActionLoading(null);
        }
      },
    });
  };

  const handleRejectSubmit = async () => {
    if (!rejectionModal) return;
    setActionLoading(`reject-${rejectionModal.id}`);
    try {
      const result = await identityVerificationService.adminUpdateStatus(
        rejectionModal.id,
        'rejected',
        rejectionReason.trim() || undefined,
      );
      if (!result.success) throw new Error(result.error);
      setRejectionModal(null);
      setRejectionReason('');
      await fetchVerifications();
    } catch (err) {
      console.error('Reject error:', err);
      toast.error('Failed to reject verification', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCopyUserId = (userId: string) => {
    navigator.clipboard.writeText(userId);
    setCopiedId(userId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ─── Filter ────────────────────────────────────────────────────────────

  const filtered = verifications.filter((v) => {
    if (tabFilter !== 'all' && v.status !== tabFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        v.user_name?.toLowerCase().includes(q) ||
        v.user_email?.toLowerCase().includes(q) ||
        v.id?.toLowerCase().includes(q) ||
        v.user_id?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const tabs: { id: TabFilter; label: string; count: number }[] = [
    { id: 'pending', label: 'Pending', count: stats.pending },
    { id: 'review', label: 'Needs Review', count: stats.review },
    { id: 'verified', label: 'Verified', count: stats.verified },
    { id: 'rejected', label: 'Rejected', count: stats.rejected },
    { id: 'all', label: 'All', count: stats.total },
  ];

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Identity Verification</h1>
        <p className="text-slate-400 text-sm mt-1">
          Review and manage identity verification requests. Documents are securely accessed via signed URLs.
        </p>
      </div>

      {/* Verification Provider Config — founder-managed, token stays server-side */}
      <div
        className="rounded-[2rem] p-6"
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 shrink-0">
              <KeyRound className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h2 className="font-bold text-white text-sm flex items-center gap-2">
                Automatic Verification Provider
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  providerStatus?.configured
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {providerStatus === null ? 'Unknown' : providerStatus.configured ? 'Live' : 'Not Configured'}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  providerStatus?.mode === 'development'
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-emerald-500/15 text-emerald-400'
                }`}>
                  {providerStatus === null ? 'Mode Unknown' : providerStatus.mode === 'development' ? 'Dev Mode' : 'Production'}
                </span>
              </h2>
              <p className="text-slate-400 text-xs mt-1 max-w-2xl">
                Paste your Surepass API token to enable real-time PAN verification.
                The token is stored server-side (never exposed to users or the browser)
                and can be rotated or removed here anytime. Without a token, new
                verifications wait safely in review — nothing is ever auto-approved.
                In <span className="text-amber-400 font-semibold">Development Mode</span> users are
                auto-verified instantly (labelled <span className="text-slate-300">dev_mode</span>);
                switch back to Production before launch.
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={providerStatus?.configured ? 'Paste a new token to rotate…' : 'Paste your Surepass API token…'}
            autoComplete="off"
            className="flex-1 px-4 py-2.5 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => void handleSaveToken()}
            disabled={providerBusy || !tokenInput.trim()}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition-colors"
          >
            {providerBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Token
          </button>
          {providerStatus?.configured && (
            <button
              type="button"
              onClick={() => void handleClearToken()}
              disabled={providerBusy}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm font-bold transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Remove
            </button>
          )}
        </div>
        {providerStatus?.configured && providerStatus.updated_at && (
          <p className="text-slate-500 text-[11px] mt-2">
            Token configured · provider: {providerStatus.provider} · last updated {formatDate(providerStatus.updated_at)}
          </p>
        )}

        {/* Verification Mode — development (instant auto-verify) vs production (real provider / fail-safe) */}
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-200">Verification Mode</p>
            <p className="text-[11px] text-slate-500 mt-0.5 max-w-lg">
              {providerStatus?.mode === 'development'
                ? 'Development: every submission is auto-verified instantly without an external provider (records labelled dev_mode — re-verify for real before launch).'
                : 'Production: submissions use the configured provider — or fail safely into review if no provider token is set. No fake verification, ever.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSetMode('production')}
              disabled={providerBusy || providerStatus?.mode === 'production'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Production
            </button>
            <button
              type="button"
              onClick={() => void handleSetMode('development')}
              disabled={providerBusy || providerStatus?.mode === 'development'}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-white"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Dev Mode
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending', value: stats.pending, color: 'text-amber-400', icon: Clock },
          { label: 'Verified', value: stats.verified, color: 'text-emerald-400', icon: BadgeCheck },
          { label: 'Rejected', value: stats.rejected, color: 'text-red-400', icon: XCircle },
          { label: 'Total', value: stats.total, color: 'text-slate-100', icon: Shield },
        ].map((stat, i) => (
          <div
            key={i}
            className="p-5 rounded-2xl"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-slate-500 text-[9px] font-bold uppercase tracking-widest">{stat.label}</p>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </div>
            <p className={`text-2xl font-bold ${stat.color}`}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin inline" /> : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div
        className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
        style={{
          background: '#1E293B',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '1rem',
          padding: '1rem',
        }}
      >
        {/* Tabs */}
        <div className="flex items-center gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setTabFilter(tab.id)}
              className={`relative px-3 py-1.5 text-[9px] font-bold uppercase rounded-lg transition-all ${
                tabFilter === tab.id
                  ? tab.id === 'verified'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : tab.id === 'rejected'
                    ? 'bg-red-500/10 text-red-400'
                    : tab.id === 'pending'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-1.5 px-1 py-0.5 text-[7px] rounded-full ${
                    tabFilter === tab.id ? 'bg-white/10' : 'bg-white/5'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          {/* Search */}
          <div className="relative flex-1 sm:min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, or ID..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Refresh */}
          <button
            onClick={fetchVerifications}
            className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Verification Table */}
      <div
        className="rounded-[2rem] overflow-hidden"
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-slate-500 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Document</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <Shield className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-slate-500 text-xs">No {tabFilter === 'all' ? '' : tabFilter} verifications found</p>
                  </td>
                </tr>
              ) : (
                filtered.map((verification) => (
                  <tr key={verification.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0 overflow-hidden">
                          {verification.user_avatar ? (
                            <img
                              src={verification.user_avatar}
                              className="h-full w-full object-cover"
                              alt={verification.user_name}
                            />
                          ) : (
                            verification.user_name?.charAt(0)?.toUpperCase() || '?'
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm flex items-center gap-2">
                            {verification.user_name || 'Unknown'}
                            {verification.status === 'verified' && (
                              <BadgeCheck className="w-3.5 h-3.5 text-emerald-400" />
                            )}
                          </p>
                          <p className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {verification.user_email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-500" />
                        <span className="text-xs text-slate-300">{getTypeLabel(verification.document_type)}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                          statusColors[verification.status] || 'bg-slate-500/10 text-slate-400'
                        }`}
                      >
                        {verification.status}
                      </span>
                      {verification.status === 'rejected' && verification.rejection_reason && (
                        <p className="text-[9px] text-red-400 mt-1 max-w-[200px] truncate" title={verification.rejection_reason}>
                          {verification.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-400">{formatDate(verification.created_at || '')}</p>
                      <p className="text-[9px] text-slate-500">{formatRelativeTime(verification.created_at || '')}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* View Document */}
                        <button
                          onClick={() => setPreviewItem(verification)}
                          className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors"
                          title="View Document"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Copy User ID */}
                        <button
                          onClick={() => handleCopyUserId(verification.user_id)}
                          className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors"
                          title="Copy User ID"
                        >
                          {copiedId === verification.user_id ? (
                            <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>

                        {/* Approve (only for pending) */}
                        {verification.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleApprove(verification)}
                              disabled={actionLoading === `approve-${verification.id}`}
                              className="p-1.5 hover:bg-emerald-500/10 rounded-lg text-emerald-400 transition-colors"
                              title="Approve Verification"
                            >
                              {actionLoading === `approve-${verification.id}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              onClick={() => setRejectionModal(verification)}
                              disabled={actionLoading === `reject-${verification.id}`}
                              className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors"
                              title="Reject Verification"
                            >
                              {actionLoading === `reject-${verification.id}` ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Document Preview Modal */}
      {previewItem && <DocumentPreviewModal verification={previewItem} onClose={() => setPreviewItem(null)} />}

      {/* Rejection Reason Modal */}
      {confirmDialog && (
        <ConfirmModal
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(null)}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          variant={confirmDialog.variant}
          confirmLabel={confirmDialog.confirmLabel}
        />
      )}

      {rejectionModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
          onClick={() => { setRejectionModal(null); setRejectionReason(''); }}
        >
          <div
            className="w-full max-w-md rounded-2xl overflow-hidden animate-in zoom-in-95"
            style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-red-500/10">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">Reject Verification</h3>
                  <p className="text-xs text-slate-400">{rejectionModal.user_name}</p>
                </div>
              </div>

              <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-[10px] text-amber-400">
                  Rejecting will mark this verification as rejected. The user can resubmit with corrected documents.
                </p>
              </div>

              <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                Rejection Reason <span className="text-slate-500">(optional)</span>
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Explain why the document was rejected..."
                rows={3}
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/5 rounded-xl text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none"
              />

              <div className="flex items-center gap-3 mt-6">
                <button
                  onClick={() => { setRejectionModal(null); setRejectionReason(''); }}
                  className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-sm font-bold text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectSubmit}
                  disabled={actionLoading === `reject-${rejectionModal.id}`}
                  className="flex-1 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-xl text-sm font-bold text-red-400 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading === `reject-${rejectionModal.id}` ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  Reject
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
