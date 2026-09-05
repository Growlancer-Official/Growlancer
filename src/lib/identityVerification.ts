// Identity Verification Service
// Pure data-access layer for identity_verifications table with secure file uploads
import { supabase, realtimeChannels } from './supabase';

export type IdentityVerification = Record<string, any> & {
  id: string;
  user_id: string;
  status: string;
  document_type?: string;
  document_url?: string;
  created_at?: string;
  rejection_count?: number;
  blocked_until?: string | null;
};

/** Max KYC resubmit attempts before the 24-hour cooldown kicks in. */
export const KYC_MAX_ATTEMPTS = 3;

/**
 * How many resubmit attempts the user has left (0 when blocked/cooldown active).
 */
export function getRemainingKycAttempts(v: IdentityVerification | null | undefined): number {
  if (!v) return KYC_MAX_ATTEMPTS;
  const count = Number(v.rejection_count) || 0;
  return Math.max(0, KYC_MAX_ATTEMPTS - count);
}

/**
 * True while the user is locked out (3 failed attempts → 24-hour block).
 */
export function isKycBlocked(v: IdentityVerification | null | undefined): boolean {
  if (!v?.blocked_until) return false;
  return new Date(v.blocked_until).getTime() > Date.now();
}

/**
 * Milliseconds remaining in the 24-hour cooldown (0 when not blocked / expired).
 */
export function getKycBlockedMsLeft(v: IdentityVerification | null | undefined): number {
  if (!isKycBlocked(v)) return 0;
  return Math.max(0, new Date(v!.blocked_until as string).getTime() - Date.now());
}

/** Human-readable cooldown label, e.g. "23h 45m" — live-updates from the page. */
export function formatKycCooldown(msLeft: number): string {
  if (msLeft <= 0) return '0m';
  const totalMin = Math.ceil(msLeft / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export interface VerificationUpload {
  document_type: 'passport' | 'drivers_license' | 'national_id' | 'aadhaar' | 'pan' | 'other';
  document_file?: File; // FRONT image — secure file upload instead of URL
  document_url?: string; // Fallback for URL-based uploads (front)
  document_file_back?: File; // BACK image (Aadhaar / Passport / DL / National ID)
  document_url_back?: string; // Fallback for URL-based uploads (back)
  document_number?: string;
  expiry_date?: string;
  full_name?: string;
  date_of_birth?: string;
}

/**
 * Which document types require a BACK-side image?
 * Aadhaar, Passport, Driver's License and National ID carry printed info on
 * both sides; PAN and other IDs are single-sided (front only).
 */
export function documentNeedsBack(
  type: VerificationUpload['document_type']
): boolean {
  return ['aadhaar', 'passport', 'drivers_license', 'national_id'].includes(type);
}

export const identityVerificationService = {
  /**
   * Get a fresh signed URL for an existing verification document.
   * Used when an admin needs to review a document.
   */
  async getSignedDocumentUrl(filePath: string, expirySeconds: number = 300): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const { data: signedData, error } = await supabase
        .storage
        .from('verification-documents')
        .createSignedUrl(filePath, expirySeconds);

      if (error || !signedData?.signedUrl) {
        return { success: false, error: error?.message || 'Failed to generate signed URL' };
      }

      return { success: true, url: signedData.signedUrl };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate signed URL';
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Upload verification document securely to Supabase Storage.
   * Returns BOTH the storage path (persisted in the DB — never expires) and a
   * short-lived signed URL for immediate preview.
   */
  async uploadVerificationDocument(
    file: File,
    userId: string
  ): Promise<{ success: boolean; url?: string; path?: string; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      // Create a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      // 🔑 The storage RLS policy for the private `verification-documents` bucket
      // requires the FIRST path segment to be the user's UUID:
      //   (storage.foldername(name))[1] = auth.uid()
      // Any other first segment (e.g. `verification-docs/`) makes the INSERT
      // fail with "new row violates row-level security policy".
      const filePath = `${userId}/verification-docs/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase
        .storage
        .from('verification-documents')
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return { success: false, error: uploadError.message };
      }

      // Generate a signed URL for immediate preview (bucket is private)
      const { data: signedData, error: signedError } = await supabase
        .storage
        .from('verification-documents')
        .createSignedUrl(filePath, 300); // 5 minute expiry — preview only

      if (signedError || !signedData?.signedUrl) {
        return { success: false, error: signedError?.message || 'Failed to generate signed URL' };
      }

      // Return the raw storage path too — the DB stores the PATH (never expires),
      // and admins re-sign it on demand via createSignedUrl.
      return { success: true, url: signedData.signedUrl, path: filePath };
    } catch (error) {
      console.error('Document upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      return { success: false, error: errorMessage };
    }
  },

  /**
   * Get the current user's verification status.
   */
  async getStatus(userId: string): Promise<{
    verification: IdentityVerification | null;
    status: 'none' | 'pending' | 'verified' | 'rejected' | 'blocked' | 'review';
  }> {
    try {
      const { data, error } = await supabase
        .from('identity_verifications' as any)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (!data) return { verification: null, status: 'none' };

      const dataAny = data as any;
      // Blocked = latest attempt rejected AND cooldown still active
      let resolvedStatus: 'pending' | 'verified' | 'rejected' | 'blocked' | 'review' = dataAny.status as 'pending' | 'verified' | 'rejected' | 'review';
      if (resolvedStatus === 'rejected' && isKycBlocked(dataAny as IdentityVerification)) {
        resolvedStatus = 'blocked';
      }
      return {
        verification: dataAny as IdentityVerification,
        status: resolvedStatus,
      };
    } catch (error) {
      console.error('Error fetching verification status:', error);
      return { verification: null, status: 'none' };
    }
  },

  /**
   * Run the automated KYC engine (kyc-submit edge function) on a PENDING
   * verification row. The REAL provider call happens server-side; the row
   * flips to verified/rejected/review there and Supabase Realtime pushes the
   * change to every open page — no refresh needed.
   *
   * Returns a friendly, user-safe message (technical provider errors never
   * reach the UI).
   */
  async process(
    verificationId: string
  ): Promise<{ success: boolean; status?: string; message?: string; error?: string }> {
    try {
      const { data, error } = await supabase.functions.invoke('kyc-submit', {
        body: { verification_id: verificationId },
      });
      if (error) throw error;
      return {
        success: data?.success !== false,
        status: data?.status,
        message: data?.message,
        error: data?.error,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to process verification';
      console.error('KYC processing error:', msg);
      return {
        success: false,
        error: 'Verification is temporarily unavailable. Please try again shortly.',
      };
    }
  },

  /**
   * Submit a new identity verification request.
   * Handles both secure file uploads and URL-based uploads for backward compatibility.
   *
   * MANUAL REVIEW: every submission enters the compliance queue as 'pending'.
   * An admin reviews the documents (AdminIdentityVerificationPage) and the
   * user's status flips to verified/rejected in real time via the sync trigger.
   */
  async submit(
    userId: string,
    upload: VerificationUpload
  ): Promise<{ success: boolean; verification?: IdentityVerification; error?: string }> {
    try {
      let documentUrl = upload.document_url;
      let documentUrlBack = upload.document_url_back || null;

      // FRONT image — secure file upload when a file is provided.
      // Store the raw storage PATH in the DB (never expires); admins re-sign it
      // on demand. Signed URLs are only used for the immediate upload preview.
      if (upload.document_file) {
        const uploadResult = await this.uploadVerificationDocument(upload.document_file, userId);
        if (!uploadResult.success) {
          return { success: false, error: uploadResult.error || 'Failed to upload document' };
        }
        documentUrl = uploadResult.path || uploadResult.url;
      }

      // BACK image (Aadhaar / Passport / DL / National ID)
      if (upload.document_file_back) {
        const uploadBack = await this.uploadVerificationDocument(upload.document_file_back, userId);
        if (!uploadBack.success) {
          return { success: false, error: uploadBack.error || 'Failed to upload document back side' };
        }
        documentUrlBack = uploadBack.path || uploadBack.url;
      }

      if (!documentUrl) {
        return { success: false, error: 'Document URL or file is required' };
      }

      // A document type that requires a back image must actually have one
      if (documentNeedsBack(upload.document_type) && !documentUrlBack) {
        return { success: false, error: 'Please upload the back side of your document.' };
      }

      // MNC-style manual review: submissions ALWAYS enter the compliance
      // queue as 'pending'. A human reviewer (admin) approves or rejects the
      // document — automated/AI verification is never trusted for identity.
      const { data, error } = await supabase
        .from('identity_verifications' as any)
        .insert({
          user_id: userId,
          document_type: upload.document_type,
          document_url: documentUrl,
          document_url_back: documentUrlBack,
          document_number: upload.document_number || null,
          expiry_date: upload.expiry_date || null,
          full_name: upload.full_name || null,
          date_of_birth: upload.date_of_birth || null,
          status: 'pending',
          verified_at: null,
          verification_provider: 'manual',
          rejection_reason: null,
          rejection_count: 0,
          blocked_until: null,
        })
        .select()
        .single();

      if (error) throw error;

      // The kyc_auto_verify_trigger_fn (SECURITY DEFINER) now handles:
      // 1. Processing pending rows via kyc_verify_row
      // 2. Syncing verification_status to profiles + freelancer_profiles
      // 3. Sending real-time notifications
      // No client-side profile updates needed — RLS WITH CHECK blocks direct
      // verification_status changes anyway.

      return { success: true, verification: data as unknown as IdentityVerification };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to submit verification';
      return { success: false, error: msg };
    }
  },

  /**
   * Admin: Update verification status.
   */
  async adminUpdateStatus(
    verificationId: string,
    status: 'verified' | 'rejected',
    rejectionReason?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updates: { status: string; verified_at?: string | null; rejection_reason?: string | null } = { status };

      if (status === 'verified') {
        updates.verified_at = new Date().toISOString();
      }
      if (status === 'rejected' && rejectionReason) {
        updates.rejection_reason = rejectionReason;
      }

      const { error } = await supabase
        .from('identity_verifications' as any)
        .update(updates)
        .eq('id', verificationId);

      if (error) throw error;

      // Get user details for email notification
      const { data: ver } = await supabase
        .from('identity_verifications' as any)
        .select('user_id')
        .eq('id', verificationId)
        .single();

      if (ver) {
        const userId = (ver as any).user_id;
        
        // If verified, also update the user's profile
        if (status === 'verified') {
          await supabase
            .from('profiles' as any)
            .update({ identity_verified: true } as any)
            .eq('id', userId);
        }

        // 🔔 In-app real-time notification is created by the DB trigger
        //    (kyc_auto_verify_trigger_fn, SECURITY DEFINER) on the status
        //    UPDATE — inserting from here would fail notifications RLS
        //    (user_id = auth.uid()). The trigger covers both roles and
        //    pushes to the realtime publication automatically.

        // Send email notification (fire-and-forget)
        const { data: profilePub } = await supabase
          .from('profiles' as any)
          .select('name')
          .eq('id', userId)
          .single();
        const { data: profilePriv } = await supabase
          .from('profiles_private')
          .select('email')
          .eq('id', userId)
          .maybeSingle();
        const profile = profilePub ? { name: (profilePub as any).name, email: profilePriv?.email || '' } : null;

        if (profile) {
          const type = status === 'verified' ? 'verification_approved' : 'verification_rejected';
          supabase.functions.invoke('email-notifications', {
            method: 'POST',
            body: {
              type,
              data: {
                recipient_email: (profile as any).email,
                recipient_name: (profile as any).name || (profile as any).email?.split('@')[0] || 'User',
                rejection_reason: rejectionReason || undefined,
              },
            },
          }).catch(err => console.error('[Email notification failed]', err));
        }
      }

      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update verification status';
      return { success: false, error: msg };
    }
  },

  /**
   * Admin: Get all pending verifications.
   */
  async getPendingVerifications(): Promise<IdentityVerification[]> {
    try {
      const { data, error } = await supabase
        .from('identity_verifications' as any)
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as IdentityVerification[];
    } catch (error) {
      console.error('Error fetching pending verifications:', error);
      return [];
    }
  },

  /**
   * Subscribe to verification status changes.
   */
  subscribe(
    userId: string,
    callback: (verification: IdentityVerification) => void
  ) {
    const channel = realtimeChannels.identity(`${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'identity_verifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          callback(payload.new as IdentityVerification);
        }
      )
      .subscribe();

    return channel;
  },
};

/**
 * Map a backend failure_category to a user-friendly, non-technical message.
 * Technical provider details never reach the UI.
 */
export function getKycFriendlyError(failureCategory: string | null | undefined): string {
  switch (failureCategory) {
    case 'name_mismatch':
      return 'The name you entered does not match the official record. Please check your name and try again.';
    case 'invalid_pan':
      return 'This identity number could not be verified. Please check it and try again.';
    case 'duplicate_identity':
      return 'This identity is already verified on another Growlancer account.';
    case 'rate_limited':
      return 'Too many verification attempts. Please try again in a while.';
    case 'email_unverified':
      return 'Please verify your email address first, then try again.';
    case 'provider_timeout':
    case 'provider_error':
    case 'rate_limited_provider':
      return 'Verification is temporarily unavailable. Please try again shortly.';
    default:
      return 'Your identity could not be verified. Please check your information and try again.';
  }
}