import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { identityVerificationService, documentNeedsBack, KYC_MAX_ATTEMPTS, getRemainingKycAttempts, isKycBlocked, formatKycCooldown, getKycBlockedMsLeft, type VerificationUpload } from '../../lib/identityVerification';
import { supabase } from '../../lib/supabase';
import type { IdentityVerification } from '../../lib/identityVerification';
import { PageSkeleton } from '../../components/PageSkeleton';
import { InfoTip } from '../../components/InfoTip';
import { AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
  XCircle } from 'lucide-react';

type PageStatus = 'loading' | 'idle';

export function IdentityVerificationPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  // This page is shared by BOTH dashboards: /dashboard/identity-verification
  // (freelancer) and /client/verification (client). Keep the copy role-aware.
  const isClient = user?.role === 'client';
  // Where to send the user after verification succeeds (set by the KYC gate
  // via ?redirect=). Falls back to the role dashboard.
  const postVerifyRedirect =
    searchParams.get('redirect') || (isClient ? '/client' : '/dashboard');
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'pending' | 'verified' | 'rejected' | 'blocked'>('none');
  const [blockedMsLeft, setBlockedMsLeft] = useState(0);
  const [verification, setVerification] = useState<IdentityVerification | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Consent — user must explicitly agree before documents are submitted.
  const [consentAgreed, setConsentAgreed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  // Form state — supports FRONT + BACK images per document type
  const [formData, setFormData] = useState<VerificationUpload>({
    document_type: 'passport',
    document_file: undefined,
    document_url: '',
    document_file_back: undefined,
    document_url_back: '',
    document_number: '',
    expiry_date: '',
  });
  // Per-side drag state so the two upload zones highlight independently
  const [dragSide, setDragSide] = useState<'front' | 'back' | null>(null);

  // 🚫 Blocked-state live countdown — state lives at the top level (hooks
  // must not be called inside render functions). Synced from blockedMsLeft
  // and ticks down every second; auto-refreshes when the cooldown expires.
  const [blockedDisplayMs, setBlockedDisplayMs] = useState(0);

  // Sync the display countdown whenever the source blockedMsLeft changes.
  useEffect(() => {
    setBlockedDisplayMs(blockedMsLeft);
  }, [blockedMsLeft]);

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const result = await identityVerificationService.getStatus(user.id);
      setVerification(result.verification);
      setVerificationStatus(result.status);
      if (result.status === 'blocked' && result.verification) {
        setBlockedMsLeft(getKycBlockedMsLeft(result.verification));
      }
    } catch {
      console.error('Failed to fetch verification status');
      setError('Failed to load verification status. Please refresh the page.');
    } finally {
      setPageStatus('idle');
    }
  }, [user]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Tick the countdown once per second while the user is blocked.
  useEffect(() => {
    if (verificationStatus !== 'blocked' || blockedDisplayMs <= 0) return;
    const t = setInterval(() => {
      const left = Math.max(0, blockedDisplayMs - 1000);
      setBlockedDisplayMs(left);
      if (left <= 0) {
        clearInterval(t);
        fetchStatus(); // Auto-refresh when cooldown expires
      }
    }, 1000);
    return () => clearInterval(t);
  }, [verificationStatus, blockedDisplayMs, fetchStatus]);

  // Realtime subscription for status changes — the backend auto-verifies valid
  // documents INSTANTLY, so the pending → verified/rejected flip arrives live.
  // On the verified flip we also send the approval email once (fire-and-forget)
  // so the user gets notified in-app + by email.
  const emailedVerifiedIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!user) return;

    const channel = identityVerificationService.subscribe(user.id, (updated) => {
      const isBlocked = isKycBlocked(updated);
      setVerification(updated);
      setVerificationStatus(isBlocked ? 'blocked' : (updated.status as 'pending' | 'verified' | 'rejected'));
      if (isBlocked) {
        setBlockedMsLeft(getKycBlockedMsLeft(updated));
      }

      // 🔔 Email once when the backend auto-verifies (idempotent per row).
      if (
        updated.status === 'verified' &&
        updated.id &&
        !emailedVerifiedIds.current.has(updated.id)
      ) {
        emailedVerifiedIds.current.add(updated.id);
        supabase.functions
          .invoke('email-notifications', {
            method: 'POST',
            body: {
              type: 'verification_approved',
              data: {
                recipient_email: user.email,
                recipient_name: user.name || user.email?.split('@')[0] || 'User',
              },
            },
          })
          .catch((err) => console.error('[KYC] approval email failed:', err));
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  // Handle file selection — `side` picks which image slot (front/back)
  const handleFileSelect = (file: File, side: 'front' | 'back' = 'front') => {
    // Validate file type (accept images and PDFs)
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!validTypes.includes(file.type)) {
      setError('Invalid file type. Please upload JPG, PNG, GIF, or PDF.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size too large. Maximum size is 5MB.');
      return;
    }

    setFormData(prev =>
      side === 'back'
        ? { ...prev, document_file_back: file, document_url_back: '' }
        : { ...prev, document_file: file, document_url: '' }
    );
    setError(null);
  };

  // Drag and drop handlers (per side)
  const handleDrag = (e: React.DragEvent, side: 'front' | 'back') => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragSide(side);
    } else if (e.type === 'dragleave') {
      setDragSide(null);
    }
  };

  const handleDrop = (e: React.DragEvent, side: 'front' | 'back') => {
    e.preventDefault();
    e.stopPropagation();
    setDragSide(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0], side);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0], side);
    }
  };

  const removeFile = (side: 'front' | 'back') => {
    setFormData(prev =>
      side === 'back'
        ? { ...prev, document_file_back: undefined, document_url_back: '' }
        : { ...prev, document_file: undefined, document_url: '' }
    );
    if (side === 'back') {
      if (backFileInputRef.current) backFileInputRef.current.value = '';
    } else if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!consentAgreed) {
      setError('Please agree to the consent terms before submitting your documents.');
      return;
    }

    if (!formData.document_file && !formData.document_url.trim()) {
      setError('Please upload a document or provide a document URL');
      return;
    }

    // Two-sided documents must include the BACK image too
    if (documentNeedsBack(formData.document_type) && !formData.document_file_back && !formData.document_url_back?.trim()) {
      setError(`Please upload the back side of your ${formData.document_type.replace('_', ' ')} as well.`);
      return;
    }

    setSubmitting(true);
    setUploading(true);
    setError(null);

    try {
      // ── STEP 1: Upload the document image(s) ──
      // Need BOTH: signed URL (for AI vision check) + storage path (for DB)
      let imageSignedUrl = formData.document_url;
      let imageStoragePath = formData.document_url;
      let backSignedUrl = formData.document_url_back || null;
      let backStoragePath = formData.document_url_back || null;

      if (formData.document_file) {
        const uploadResult = await identityVerificationService.uploadVerificationDocument(formData.document_file, user.id);
        if (!uploadResult.success) {
          setError(uploadResult.error || 'Failed to upload document');
          return;
        }
        imageSignedUrl = uploadResult.url || '';
        imageStoragePath = uploadResult.path || uploadResult.url || '';
      }

      if (formData.document_file_back) {
        const uploadBack = await identityVerificationService.uploadVerificationDocument(formData.document_file_back, user.id);
        if (!uploadBack.success) {
          setError(uploadBack.error || 'Failed to upload document back side');
          return;
        }
        backSignedUrl = uploadBack.url || null;
        backStoragePath = uploadBack.path || uploadBack.url || null;
      }

      if (!imageSignedUrl) {
        setError('Could not upload document. Please try again.');
        return;
      }

      // ── STEP 2: AI Vision Verification — check clarity + extract + match ──
      setError(null);
      const aiResult = await identityVerificationService.verifyDocumentWithAI(
        imageSignedUrl,
        backSignedUrl,
        {
          full_name: formData.full_name || '',
          date_of_birth: formData.date_of_birth || '',
          document_number: formData.document_number || '',
          document_type: formData.document_type,
        }
      );

      if (!aiResult.success) {
        setError(aiResult.error || 'AI verification failed. Please try again.');
        return;
      }

      // ── Handle AI verification result ──
      if (aiResult.verification_result === 'unclear_image') {
        // Image quality issue — ask user to upload a clearer image
        const clarityMsg = aiResult.clarity_issue
          ? `The uploaded image is not clear enough: ${aiResult.clarity_issue}. Please upload a clearer image of your document.`
          : 'The uploaded image is not clear enough. Please take a clearer photo and upload again.';
        setError(clarityMsg);
        return;
      }

      if (aiResult.verification_result === 'rejected') {
        // Details don't match — show specific mismatches
        const mismatches: string[] = [];
        if (aiResult.name_match === false) mismatches.push(`Name (extracted: ${aiResult.extracted_name || 'N/A'})`);
        if (aiResult.dob_match === false) mismatches.push(`Date of Birth (extracted: ${aiResult.extracted_dob || 'N/A'})`);
        if (aiResult.number_match === false) mismatches.push(`Document Number (extracted: ${aiResult.extracted_number || 'N/A'})`);
        const mismatchDetail = mismatches.length > 0
          ? ` Mismatch in: ${mismatches.join(', ')}.`
          : ' The details you entered do not match the document.';
        setError(`Document verification failed.${mismatchDetail} Please verify your details and try again.`);
        return;
      }

      // ── STEP 3: AI verified — insert as pre-verified with storage PATH (not signed URL) ──
      const result = await identityVerificationService.submit(user.id, {
        ...formData,
        document_url: imageStoragePath,
        document_url_back: backStoragePath || '',
        document_file: undefined,
        document_file_back: undefined,
      }, {
        verifiedByAI: true,
        aiResult: {
          name_match: aiResult.name_match || false,
          dob_match: aiResult.dob_match || false,
          number_match: aiResult.number_match || false,
        },
      });

      if (result.success && result.verification) {
        setVerification(result.verification);
        setShowForm(false);
        setConsentAgreed(false);
        setFormData({
          document_type: 'passport',
          document_file: undefined,
          document_url: '',
          document_file_back: undefined,
          document_url_back: '',
          document_number: '',
          expiry_date: '',
          full_name: '',
          date_of_birth: '',
        });
        // Re-fetch status to update the UI immediately
        await fetchStatus();
      } else {
        setError(result.error || 'Failed to submit verification');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const handleResubmit = () => {
    if (isKycBlocked(verification)) return;
    setShowForm(true);
    setVerificationStatus('none');
    setVerification(null);
    setError(null);
  };

  // Status renderers
  const renderNoneState = () => (
    <div className="space-y-1.5">
      {/* Info card */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-100 rounded-xl shrink-0">
            <ShieldAlert className="w-4 h-4 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">Identity Verification Required</h3>
            <p className="text-sm text-amber-700">
              Verify your identity to build trust with {isClient ? 'freelancers' : 'clients'}, unlock higher earning limits, and access premium features.
              Your information is securely stored and never shared without your consent.
            </p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { icon: ShieldCheck, label: 'Build Trust', desc: 'Verified badge on your profile' },
          { icon: Upload, label: 'Higher Limits', desc: 'Increased withdrawal and contract limits' },
          { icon: CheckCircle2, label: 'Priority Support', desc: 'Access to faster support responses' },
        ].map((benefit) => (
          <div key={benefit.label} className="bg-white rounded-xl p-3 border border-slate-100 shadow-sm">
            <div className="p-2 bg-emerald-100 rounded-xl w-fit mb-3">
              <benefit.icon className="w-4 h-4 text-emerald-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-1">{benefit.label}</h4>
            <p className="text-sm text-slate-500">{benefit.desc}</p>
          </div>
        ))}
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-3 px-3 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium"
        >
          <Upload className="w-4 h-4" />
          Start Verification
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
          <h3 className="text-lg font-semibold text-slate-900">Submit Your Documents</h3>

          {/* Document Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Document Type</label>
            <select
              value={formData.document_type}
              onChange={(e) => setFormData((prev) => ({ ...prev, document_type: e.target.value as VerificationUpload['document_type'] }))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
            >
              <option value="aadhaar">Aadhaar Card (India)</option>
              <option value="pan">PAN Card (India)</option>
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver's License</option>
              <option value="national_id">National ID Card</option>
              <option value="other">Other Government ID</option>
            </select>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Full Name (as on document) <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.full_name || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
              placeholder="e.g., Rahul Sharma"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
            />
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Date of Birth <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={formData.date_of_birth || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, date_of_birth: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
            />
          </div>

          {/* Secure File Upload — per-document FRONT + BACK slots */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Upload Document</label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* FRONT side */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-600">Front side {formData.document_type === 'pan' || formData.document_type === 'other' ? '(only required)' : ''}</span>
                  {!formData.document_file && (
                    <span className="text-xs font-bold text-red-500">Required</span>
                  )}
                </div>
                <div
                  className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                    dragSide === 'front'
                      ? 'border-emerald-500 bg-emerald-50'
                      : formData.document_file
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-slate-300 hover:border-emerald-400 bg-slate-50'
                  }`}
                  onDragEnter={(e) => handleDrag(e, 'front')}
                  onDragLeave={(e) => handleDrag(e, 'front')}
                  onDragOver={(e) => handleDrag(e, 'front')}
                  onDrop={(e) => handleDrop(e, 'front')}
                >
                  {formData.document_file ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center">
                        <FileText className="w-7 h-7 text-emerald-600" />
                      </div>
                      <p className="text-xs font-medium text-slate-900 break-all">{formData.document_file.name}</p>
                      <button
                        type="button"
                        onClick={() => removeFile('front')}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-medium text-slate-700">Drag & drop front image</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                      >
                        Browse
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
                        onChange={(e) => handleFileInputChange(e, 'front')}
                        className="hidden"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* BACK side — only for two-sided documents */}
              {documentNeedsBack(formData.document_type) && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-slate-600">Back side</span>
                    {!formData.document_file_back && (
                      <span className="text-xs font-bold text-red-500">Required</span>
                    )}
                  </div>
                  <div
                    className={`relative border-2 border-dashed rounded-xl p-6 text-center transition-all ${
                      dragSide === 'back'
                        ? 'border-emerald-500 bg-emerald-50'
                        : formData.document_file_back
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-300 hover:border-emerald-400 bg-slate-50'
                    }`}
                    onDragEnter={(e) => handleDrag(e, 'back')}
                    onDragLeave={(e) => handleDrag(e, 'back')}
                    onDragOver={(e) => handleDrag(e, 'back')}
                    onDrop={(e) => handleDrop(e, 'back')}
                  >
                    {formData.document_file_back ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-center">
                          <FileText className="w-7 h-7 text-emerald-600" />
                        </div>
                        <p className="text-xs font-medium text-slate-900 break-all">{formData.document_file_back.name}</p>
                        <button
                          type="button"
                          onClick={() => removeFile('back')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                        <p className="text-xs font-medium text-slate-700">Drag & drop back image</p>
                        <button
                          type="button"
                          onClick={() => backFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                        >
                          Browse
                        </button>
                        <input
                          ref={backFileInputRef}
                          type="file"
                          accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
                          onChange={(e) => handleFileInputChange(e, 'back')}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* URL fallback option */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <details className="group">
                <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                  Or paste document URL instead
                </summary>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Front side URL</label>
                    <input
                      type="url"
                      value={formData.document_url}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, document_url: e.target.value }));
                        if (e.target.value) {
                          setFormData((prev) => ({ ...prev, document_file: undefined }));
                        }
                      }}
                      placeholder="https://example.com/front.jpg"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                    />
                  </div>
                  {documentNeedsBack(formData.document_type) && (
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Back side URL</label>
                      <input
                        type="url"
                        value={formData.document_url_back}
                        onChange={(e) => {
                          setFormData((prev) => ({ ...prev, document_url_back: e.target.value }));
                          if (e.target.value) {
                            setFormData((prev) => ({ ...prev, document_file_back: undefined }));
                          }
                        }}
                        placeholder="https://example.com/back.jpg"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                      />
                    </div>
                  )}
                </div>
              </details>
            </div>
          </div>

          {/* Document Number */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Document Number <span className="text-red-500">*</span>
              <span className="ml-2 text-xs font-normal text-slate-400">(auto-verified against its format)</span>
            </label>
            <input
              type="text"
              required
              value={formData.document_number || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, document_number: e.target.value.toUpperCase() }))}
              placeholder="e.g., XXXXXXXXXXXX"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all uppercase"
            />
          </div>

          {/* Expiry Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Expiry Date (optional)</label>
            <input
              type="date"
              value={formData.expiry_date || ''}
              onChange={(e) => setFormData((prev) => ({ ...prev, expiry_date: e.target.value }))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
            />
          </div>

          {/* Consent */}
          <label className="flex items-start gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
            <input
              type="checkbox"
              checked={consentAgreed}
              onChange={(e) => {
                setConsentAgreed(e.target.checked);
                if (e.target.checked) setError(null);
              }}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
            />
            <span className="text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-800">I agree</span> to share my identity documents with Growlancer for
              verification purposes only. I understand my documents are stored securely, used solely to verify my
              identity and build trust on the platform, and are never shared with third parties without my consent.
              I may delete my account and data at any time.{' '}
              <Link to="/privacy" className="text-emerald-600 hover:text-emerald-700 font-medium underline underline-offset-2">Privacy Policy</Link>
            </span>
          </label>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-1.5 pt-2">
            <button
              type="submit"
              disabled={submitting || !consentAgreed}
              className="inline-flex items-center gap-3 px-3 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Uploading...
                </>
              ) : submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Submit Verification
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-800 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );

  const renderPendingState = () => {
    // Industry-standard verification stepper: Submitted → In Review → Verified
    const steps = [
      { label: 'Submitted', done: true, current: false },
      { label: 'In Review', done: false, current: true },
      { label: 'Verified', done: false, current: false },
    ];
    return (
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center max-w-lg mx-auto">
        <div className="p-3 bg-amber-100 rounded-xl w-fit mx-auto mb-2">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Verification In Progress</h2>
        <p className="text-slate-500 mb-3">
          Your documents are being <span className="font-semibold text-slate-700">auto-verified</span> against standard
          formats. Verification completes <span className="font-semibold text-amber-700">in seconds</span> —
          your status updates here in real time, no refresh needed.
        </p>
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 flex items-start gap-3 text-left">
          <Shield className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-700 leading-relaxed">
            If your document number doesn't match the expected format, your submission is rejected
            instantly with a clear reason and you can resubmit (3 attempts, then a 24-hour cooldown).
            Your documents are stored securely and never shared without your consent.
          </p>
        </div>

        {/* Status Stepper */}
        <div className="flex items-center justify-center gap-0 mb-3">
          {steps.map((step, idx) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all ${
                    step.done
                      ? 'bg-emerald-500 border-emerald-500 text-white'
                      : step.current
                      ? 'bg-amber-100 border-amber-500 text-amber-600'
                      : 'bg-slate-100 border-slate-200 text-slate-400'
                  }`}
                >
                  {step.done ? <CheckCircle2 className="w-4 h-4" /> : <span className="text-sm font-bold">{idx + 1}</span>}
                </div>
                <span className={`text-xs mt-2 font-medium ${step.current ? 'text-amber-700' : step.done ? 'text-emerald-700' : 'text-slate-400'}`}>
                  {step.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-12 sm:w-16 h-0.5 mb-3 mx-1 ${step.done ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 inline-flex items-center gap-1.5">
          <Loader2 className="w-4 h-4 text-amber-600 animate-spin" />
          <span className="text-sm font-medium text-amber-800">Under Review</span>
        </div>
        {verification?.created_at && (
          <p className="text-xs text-slate-400 mt-4">
            Submitted on {new Date(verification.created_at).toLocaleDateString('en-US', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </p>
        )}
      </div>
    );
  };

  const renderVerifiedState = () => (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center max-w-lg mx-auto">
      <div className="p-3 bg-emerald-100 rounded-xl w-fit mx-auto mb-2">
        <ShieldCheck className="w-8 h-8 text-emerald-600" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Identity Verified</h2>
      <p className="text-slate-500 mb-2">Your identity has been successfully verified.</p>
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 inline-flex items-center gap-1.5">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-800">Verified</span>
      </div>
      {verification?.verified_at && (
        <p className="text-xs text-slate-400 mt-4">
          Verified on {new Date(verification.verified_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      )}
      <Link
        to={postVerifyRedirect}
        className="mt-6 inline-flex items-center justify-center gap-3 w-full h-12 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 transition-all"
      >
        Continue to Dashboard
      </Link>
      <p className="text-xs text-slate-400 mt-3">
        You can now use the full platform — payments, projects, matches and more are unlocked.
      </p>
    </div>
  );

  const renderRejectedState = () => {
    const attemptsLeft = getRemainingKycAttempts(verification);
    // After the 24h cooldown has EXPIRED (blocked_until in the past), the user
    // can resubmit again — a new submission starts a fresh attempt cycle.
    const blockExpired =
      !!verification?.blocked_until && !isKycBlocked(verification);
    const canResubmit = attemptsLeft > 0 || blockExpired;
    return (
      <div className="space-y-1.5">
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center max-w-lg mx-auto">
          <div className="p-3 bg-red-100 rounded-xl w-fit mx-auto mb-2">
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Verification Rejected</h2>
          <p className="text-slate-500 mb-2">
            Your identity verification was not approved. Please review the reason below and resubmit.
          </p>

          {/* Attempts remaining badge */}
          <div className="flex items-center justify-center gap-3 mb-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
              attemptsLeft <= 1 ? 'bg-red-100 text-red-700' :
              attemptsLeft <= 2 ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-700'
            }`}>
              {attemptsLeft} of {KYC_MAX_ATTEMPTS} attempts remaining
            </span>
          </div>

          {verification?.rejection_reason && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left mb-3">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 mb-1">Rejection Reason</p>
                  <p className="text-sm text-red-700">{verification.rejection_reason}</p>
                </div>
              </div>
            </div>
          )}

          {canResubmit ? (
            <button
              onClick={handleResubmit}
              className="inline-flex items-center gap-3 px-3 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-semibold"
            >
              <RefreshCw className="w-4 h-4" />
              {blockExpired ? 'Submit New Verification' : `Resubmit Verification (${attemptsLeft} left)`}
            </button>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-sm font-medium text-amber-800">
                No attempts remaining. You will be able to try again after the cooldown period.
              </p>
            </div>
          )}
        </div>

        {showForm && canResubmit && (
          <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 space-y-3">
            <h3 className="text-lg font-semibold text-slate-900">Resubmit Your Documents</h3>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Document Type</label>
              <select
                value={formData.document_type}
                onChange={(e) => setFormData((prev) => ({ ...prev, document_type: e.target.value as VerificationUpload['document_type'] }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
              >
                <option value="aadhaar">Aadhaar Card (India)</option>
                <option value="pan">PAN Card (India)</option>
                <option value="passport">Passport</option>
                <option value="drivers_license">Driver's License</option>
                <option value="national_id">National ID Card</option>
                <option value="other">Other Government ID</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Full Name (as on document)</label>
              <input
                type="text"
                value={formData.full_name || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, full_name: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Date of Birth</label>
              <input
                type="date"
                value={formData.date_of_birth || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, date_of_birth: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Document Image URL (Front side)</label>
              <input
                type="url"
                value={formData.document_url}
                onChange={(e) => setFormData((prev) => ({ ...prev, document_url: e.target.value }))}
                placeholder="https://example.com/my-document.jpg"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                required
              />
            </div>

            {documentNeedsBack(formData.document_type) && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Document Image URL (Back side)</label>
                <input
                  type="url"
                  value={formData.document_url_back}
                  onChange={(e) => setFormData((prev) => ({ ...prev, document_url_back: e.target.value }))}
                  placeholder="https://example.com/my-document-back.jpg"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Document Number (optional)</label>
              <input
                type="text"
                value={formData.document_number || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, document_number: e.target.value }))}
                placeholder="e.g., Passport number or ID number"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Expiry Date (optional)</label>
              <input
                type="date"
                value={formData.expiry_date || ''}
                onChange={(e) => setFormData((prev) => ({ ...prev, expiry_date: e.target.value }))}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              />
            </div>

            {/* Consent */}
            <label className="flex items-start gap-1.5 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors">
              <input
                type="checkbox"
                checked={consentAgreed}
                onChange={(e) => {
                  setConsentAgreed(e.target.checked);
                  if (e.target.checked) setError(null);
                }}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
              />
              <span className="text-xs text-slate-600 leading-relaxed">
                <span className="font-semibold text-slate-800">I agree</span> to share my identity documents with Growlancer for
                verification purposes only. My documents are stored securely and never shared without my consent.{' '}
                <Link to="/privacy" className="text-emerald-600 hover:text-emerald-700 font-medium underline underline-offset-2">Privacy Policy</Link>
              </span>
            </label>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex items-center gap-1.5 pt-2">
              <button
                type="submit"
                disabled={submitting || !consentAgreed}
                className="inline-flex items-center gap-3 px-3 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Submit Verification
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setError(null); setConsentAgreed(false); }}
                className="px-4 py-2.5 text-slate-600 hover:text-slate-800 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    );
  };

  // 🚫 Blocked state — 24-hour cooldown with live countdown
  const renderBlockedState = () => (
    <div className="bg-white rounded-xl border border-slate-100 shadow-sm p-4 text-center max-w-lg mx-auto">
        <div className="p-3 bg-red-100 rounded-xl w-fit mx-auto mb-2">
          <Clock className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Verification Temporarily Blocked</h2>
        <p className="text-slate-500 mb-3">
          You have used all {KYC_MAX_ATTEMPTS} verification attempts. To protect your account security,
          you can try again after the cooldown period ends.
        </p>

        {/* Live countdown */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-3">
          <p className="text-sm font-medium text-amber-800 mb-2">Cooldown Remaining</p>
          <p className="text-xl font-bold text-amber-900 font-mono">
            {formatKycCooldown(blockedDisplayMs)}
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-left">
          <div className="flex items-start gap-3">
            <Shield className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 mb-1">Why was I blocked?</p>
              <p className="text-xs text-blue-700 leading-relaxed">
                Multiple verification attempts with document numbers that don't match the expected format.
                This is a security measure to prevent misuse. After the cooldown, you can submit a new
                verification with the correct document details.
              </p>
            </div>
          </div>
        </div>
      </div>
  );

  // Loading state
  if (pageStatus === 'loading') {
    return <PageSkeleton />;;
  }

  // Error state
  if (error && pageStatus === 'idle' && verificationStatus === 'none' && !showForm) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">Identity Verification</h1>
            <p className="text-slate-500 mt-1">Verify your identity to unlock platform benefits</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <AlertCircle className="w-7 h-7 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 mb-2">{error}</p>
          <button
            onClick={fetchStatus}
            className="inline-flex items-center gap-3 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-2"><div className="p-2 bg-emerald-100 rounded-xl"><Shield className="w-5 h-5 text-emerald-600" /></div>Identity Verification <InfoTip title="Why verify?" text="Verified freelancers get a trust badge on their profile, higher AI match scores, and priority in client search. Upload a government-issued ID and a selfie — our team reviews within 24 hours. Your documents are encrypted and never shared." /></h1>
          <p className="text-slate-500 mt-1">Verify your identity to unlock platform benefits</p>
        </div>
      </div>

      {/* Status-based content */}
      {verificationStatus === 'none' && renderNoneState()}
      {verificationStatus === 'pending' && renderPendingState()}
      {verificationStatus === 'verified' && renderVerifiedState()}
      {verificationStatus === 'rejected' && renderRejectedState()}
      {verificationStatus === 'blocked' && renderBlockedState()}
    </div>
  );
}