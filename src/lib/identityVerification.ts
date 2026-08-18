// Identity Verification Service
// Pure data-access layer for identity_verifications table with secure file uploads
import { supabase, realtimeChannels } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

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
    status: 'none' | 'pending' | 'verified' | 'rejected' | 'blocked';
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
      let resolvedStatus: 'pending' | 'verified' | 'rejected' | 'blocked' = dataAny.status as 'pending' | 'verified' | 'rejected';
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
   * AI-powered document verification using OpenRouter vision model.
   * Checks image clarity, OCR-extracts details, and compares against user input.
   * Returns structured result that the frontend can show in real time.
   */
  async verifyDocumentWithAI(
    imageUrl: string,
    backImageUrl: string | null,
    details: { full_name: string; date_of_birth: string; document_number: string; document_type: string }
  ): Promise<{
    success: boolean;
    image_clear: boolean;
    clarity_issue: string | null;
    extracted_name: string | null;
    extracted_dob: string | null;
    extracted_number: string | null;
    name_match: boolean | null;
    dob_match: boolean | null;
    number_match: boolean | null;
    verification_result: 'verified' | 'rejected' | 'unclear_image';
    error?: string;
  }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/verify-document`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image_url: imageUrl,
            back_image_url: backImageUrl,
            full_name: details.full_name,
            date_of_birth: details.date_of_birth,
            document_number: details.document_number,
            document_type: details.document_type,
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text().catch(() => 'Unknown error');
        throw new Error(`Verification failed (${response.status}): ${errBody}`);
      }

      return await response.json();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'AI verification failed';
      return {
        success: false,
        image_clear: false,
        clarity_issue: null,
        extracted_name: null,
        extracted_dob: null,
        extracted_number: null,
        name_match: null,
        dob_match: null,
        number_match: null,
        verification_result: 'rejected',
        error: msg,
      };
    }
  },

  /**
   * Submit a new identity verification request.
   * Handles both secure file uploads and URL-based uploads for backward compatibility.
   *
   * AI VERIFICATION: If the document has been pre-verified by the AI vision check
   * (verifiedByAI=true), the row is inserted as 'verified' directly — the trigger
   * still runs as a safety net. If the AI check found unclear images or mismatches,
   * the frontend should handle those BEFORE calling submit (the submit method
   * itself does NOT re-run AI verification).
   */
  async submit(
    userId: string,
    upload: VerificationUpload,
    options?: { verifiedByAI?: boolean; aiResult?: { name_match?: boolean; dob_match?: boolean; number_match?: boolean } }
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

      // Determine initial status: 'verified' if AI pre-verified, else 'pending'
      const initialStatus = options?.verifiedByAI ? 'verified' : 'pending';

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
          status: initialStatus,
          verified_at: options?.verifiedByAI ? new Date().toISOString() : null,
          verification_provider: options?.verifiedByAI ? 'ai_vision' : null,
          rejection_reason: null,
          rejection_count: 0,
          blocked_until: null,
        })
        .select()
        .single();

      if (error) throw error;

      // If AI pre-verified, also sync the profiles (the trigger won't fire for
      // a non-'pending' insert, so we do it here explicitly).
      if (options?.verifiedByAI) {
        await supabase
          .from('profiles' as any)
          .update({ verification_status: 'verified' })
          .eq('id', userId);
        await supabase
          .from('freelancer_profiles' as any)
          .update({ verification_status: 'verified' })
          .eq('user_id', userId);

        // Create notification
        await supabase
          .from('notifications' as any)
          .insert({
            user_id: userId,
            type: 'verification',
            title: 'Identity Verified ✅',
            message: 'Your document has been verified by AI. Your verified badge is now live.',
          });
      } else {
        // Submitted for (possibly manual) review → sync 'pending' so the KYC
        // gate routes the user to the in-progress stepper instead of asking
        // them to start a fresh verification.
        await supabase
          .from('profiles' as any)
          .update({ verification_status: 'pending' })
          .eq('id', userId);
      }

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