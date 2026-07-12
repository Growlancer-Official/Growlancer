import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { identityVerificationService, type VerificationUpload } from '../../lib/identityVerification';
import type { IdentityVerification } from '../../lib/identityVerification';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
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
  const [pageStatus, setPageStatus] = useState<PageStatus>('loading');
  const [verificationStatus, setVerificationStatus] = useState<'none' | 'pending' | 'verified' | 'rejected'>('none');
  const [verification, setVerification] = useState<IdentityVerification | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formData, setFormData] = useState<VerificationUpload>({
    document_type: 'passport',
    document_file: undefined,
    document_url: '',
    document_number: '',
    expiry_date: '',
  });

  const fetchStatus = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const result = await identityVerificationService.getStatus(user.id);
      setVerification(result.verification);
      setVerificationStatus(result.status);
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

  // Realtime subscription for status changes
  useEffect(() => {
    if (!user) return;

    const channel = identityVerificationService.subscribe(user.id, (updated) => {
      setVerification(updated);
      setVerificationStatus(updated.status as 'pending' | 'verified' | 'rejected');
    });

    return () => {
      channel.unsubscribe();
    };
  }, [user]);

  // Handle file selection
  const handleFileSelect = (file: File) => {
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

    setFormData(prev => ({ ...prev, document_file: file, document_url: '' }));
    setError(null);
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const removeFile = () => {
    setFormData(prev => ({ ...prev, document_file: undefined, document_url: '' }));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!formData.document_file && !formData.document_url.trim()) {
      setError('Please upload a document or provide a document URL');
      return;
    }

    setSubmitting(true);
    setUploading(true);
    setError(null);

    try {
      const result = await identityVerificationService.submit(user.id, formData);
      if (result.success && result.verification) {
        setVerification(result.verification);
        setVerificationStatus('pending');
        setShowForm(false);
        setFormData({
          document_type: 'passport',
          document_file: undefined,
          document_url: '',
          document_number: '',
          expiry_date: '',
        });
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
    setShowForm(true);
    setVerificationStatus('none');
    setVerification(null);
    setError(null);
  };

  // Status renderers
  const renderNoneState = () => (
    <div className="space-y-6">
      {/* Info card */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-amber-100 rounded-xl shrink-0">
            <ShieldAlert className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h3 className="font-semibold text-amber-900 mb-1">Identity Verification Required</h3>
            <p className="text-sm text-amber-700">
              Verify your identity to build trust with clients, unlock higher earning limits, and access premium features.
              Your information is securely stored and never shared without your consent.
            </p>
          </div>
        </div>
      </div>

      {/* Benefits */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: ShieldCheck, label: 'Build Trust', desc: 'Verified badge on your profile' },
          { icon: Upload, label: 'Higher Limits', desc: 'Increased withdrawal and contract limits' },
          { icon: CheckCircle2, label: 'Priority Support', desc: 'Access to faster support responses' },
        ].map((benefit) => (
          <div key={benefit.label} className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
            <div className="p-2 bg-emerald-100 rounded-xl w-fit mb-3">
              <benefit.icon className="w-5 h-5 text-emerald-600" />
            </div>
            <h4 className="font-semibold text-slate-900 mb-1">{benefit.label}</h4>
            <p className="text-sm text-slate-500">{benefit.desc}</p>
          </div>
        ))}
      </div>

      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium"
        >
          <Upload className="w-5 h-5" />
          Start Verification
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <h3 className="text-lg font-semibold text-slate-900">Submit Your Documents</h3>

          {/* Document Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Document Type</label>
            <select
              value={formData.document_type}
              onChange={(e) => setFormData((prev) => ({ ...prev, document_type: e.target.value as VerificationUpload['document_type'] }))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
            >
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver's License</option>
              <option value="national_id">National ID Card</option>
              <option value="other">Other Government ID</option>
            </select>
          </div>

          {/* Secure File Upload */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Upload Document</label>
            
            {/* Drag & Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                dragActive
                  ? 'border-emerald-500 bg-emerald-50'
                  : formData.document_file
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-300 hover:border-emerald-400 bg-slate-50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              {formData.document_file ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-center">
                    <FileText className="w-12 h-12 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-slate-900">{formData.document_file.name}</p>
                    <p className="text-xs text-slate-500">
                      {(formData.document_file.size / 1024 / 1024).toFixed(2)} MB • {formData.document_file.type}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Remove File
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-center">
                    <Upload className="w-12 h-12 text-slate-400" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium text-slate-700">
                      Drag and drop your document here
                    </p>
                    <p className="text-sm text-slate-500">
                      JPG, PNG, GIF, or PDF (max 5MB)
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                  >
                    Browse Files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif,application/pdf"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>
            
            {/* URL fallback option */}
            <div className="mt-4 pt-4 border-t border-slate-200">
              <details className="group">
                <summary className="text-sm text-slate-500 cursor-pointer hover:text-slate-700">
                  Or paste document URL instead
                </summary>
                <div className="mt-3">
                  <input
                    type="url"
                    value={formData.document_url}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, document_url: e.target.value }));
                      if (e.target.value) {
                        setFormData((prev) => ({ ...prev, document_file: undefined }));
                      }
                    }}
                    placeholder="https://example.com/my-document.jpg"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
                  />
                  {formData.document_url && (
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, document_url: '' }))}
                      className="mt-2 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Clear URL
                    </button>
                  )}
                </div>
              </details>
            </div>
          </div>

          {/* Document Number */}
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

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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

  const renderPendingState = () => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center max-w-lg mx-auto">
      <div className="p-3 bg-amber-100 rounded-2xl w-fit mx-auto mb-4">
        <Clock className="w-8 h-8 text-amber-600" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Verification Pending</h2>
      <p className="text-slate-500 mb-6">
        Your identity documents are being reviewed by our team. This usually takes 1-2 business days.
        We'll notify you once the review is complete.
      </p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 inline-flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
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

  const renderVerifiedState = () => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center max-w-lg mx-auto">
      <div className="p-3 bg-emerald-100 rounded-2xl w-fit mx-auto mb-4">
        <ShieldCheck className="w-8 h-8 text-emerald-600" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Identity Verified</h2>
      <p className="text-slate-500 mb-4">Your identity has been successfully verified.</p>
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 inline-flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
        <span className="text-sm font-medium text-emerald-800">Verified</span>
      </div>
      {verification?.verified_at && (
        <p className="text-xs text-slate-400 mt-4">
          Verified on {new Date(verification.verified_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      )}
    </div>
  );

  const renderRejectedState = () => (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center max-w-lg mx-auto">
        <div className="p-3 bg-red-100 rounded-2xl w-fit mx-auto mb-4">
          <XCircle className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Verification Rejected</h2>
        <p className="text-slate-500 mb-6">
          Your identity verification was not approved. Please review the reason below and resubmit.
        </p>
        {verification?.rejection_reason && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-left mb-6">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800 mb-1">Rejection Reason</p>
                <p className="text-sm text-red-700">{verification.rejection_reason}</p>
              </div>
            </div>
          </div>
        )}
        <button
          onClick={handleResubmit}
          className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Resubmit Verification
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5">
          <h3 className="text-lg font-semibold text-slate-900">Resubmit Your Documents</h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Document Type</label>
            <select
              value={formData.document_type}
              onChange={(e) => setFormData((prev) => ({ ...prev, document_type: e.target.value as VerificationUpload['document_type'] }))}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all bg-white"
            >
              <option value="passport">Passport</option>
              <option value="drivers_license">Driver's License</option>
              <option value="national_id">National ID Card</option>
              <option value="other">Other Government ID</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Document Image URL</label>
            <input
              type="url"
              value={formData.document_url}
              onChange={(e) => setFormData((prev) => ({ ...prev, document_url: e.target.value }))}
              placeholder="https://example.com/my-document.jpg"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all"
              required
            />
          </div>

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

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
              onClick={() => { setShowForm(false); setError(null); }}
              className="px-4 py-2.5 text-slate-600 hover:text-slate-800 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );

  // Loading state
  if (pageStatus === 'loading') {
    return <LoadingSkeleton variant="full-page" />;
  }

  // Error state
  if (error && pageStatus === 'idle' && verificationStatus === 'none' && !showForm) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Identity Verification</h1>
            <p className="text-slate-500 mt-1">Verify your identity to unlock platform benefits</p>
          </div>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-red-700 mb-4">{error}</p>
          <button
            onClick={fetchStatus}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Identity Verification</h1>
          <p className="text-slate-500 mt-1">Verify your identity to unlock platform benefits</p>
        </div>
        <div className="p-2 bg-emerald-100 rounded-xl">
          <Shield className="w-6 h-6 text-emerald-600" />
        </div>
      </div>

      {/* Status-based content */}
      {verificationStatus === 'none' && renderNoneState()}
      {verificationStatus === 'pending' && renderPendingState()}
      {verificationStatus === 'verified' && renderVerifiedState()}
      {verificationStatus === 'rejected' && renderRejectedState()}
    </div>
  );
}