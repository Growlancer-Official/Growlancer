// Identity Verification Service
// Pure data-access layer for identity_verifications table with secure file uploads
import { supabase, realtimeChannels } from './supabase';
export type IdentityVerification = Record<string, any> & { id: string; user_id: string; status: string; document_type?: string; document_url?: string; created_at?: string; };

export interface VerificationUpload {
  document_type: 'passport' | 'drivers_license' | 'national_id' | 'other';
  document_file?: File; // Secure file upload instead of URL
  document_url?: string; // Fallback for URL-based uploads
  document_number?: string;
  expiry_date?: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zttwsjehcgaicziqyxpq.supabase.co';

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
   * Upload verification document securely to Supabase Storage
   */
  async uploadVerificationDocument(
    file: File,
    userId: string
  ): Promise<{ success: boolean; url?: string; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      // Create a unique file name
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}_${Date.now()}.${fileExt}`;
      const filePath = `verification-docs/${fileName}`;

      // Upload to Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase
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

      // Generate a signed URL instead of public URL (security: bucket is private)
      const { data: signedData, error: signedError } = await supabase
        .storage
        .from('verification-documents')
        .createSignedUrl(filePath, 300); // 5 minute expiry

      if (signedError || !signedData?.signedUrl) {
        return { success: false, error: signedError?.message || 'Failed to generate signed URL' };
      }

      return { success: true, url: signedData.signedUrl };
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
    status: 'none' | 'pending' | 'verified' | 'rejected';
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
      return {
        verification: dataAny as IdentityVerification,
        status: dataAny.status as 'pending' | 'verified' | 'rejected',
      };
    } catch (error) {
      console.error('Error fetching verification status:', error);
      return { verification: null, status: 'none' };
    }
  },

  /**
   * Submit a new identity verification request.
   * Handles both secure file uploads and URL-based uploads for backward compatibility.
   */
  async submit(
    userId: string,
    upload: VerificationUpload
  ): Promise<{ success: boolean; verification?: IdentityVerification; error?: string }> {
    try {
      let documentUrl = upload.document_url;

      // If a file is provided, upload it securely
      if (upload.document_file) {
        const uploadResult = await this.uploadVerificationDocument(upload.document_file, userId);
        if (!uploadResult.success) {
          return { success: false, error: uploadResult.error || 'Failed to upload document' };
        }
        documentUrl = uploadResult.url;
      }

      if (!documentUrl) {
        return { success: false, error: 'Document URL or file is required' };
      }

      const { data, error } = await supabase
        .from('identity_verifications' as any)
        .insert({
          user_id: userId,
          document_type: upload.document_type,
          document_url: documentUrl,
          document_number: upload.document_number || null,
          expiry_date: upload.expiry_date || null,
          status: 'pending',
          verified_at: null,
          rejection_reason: null,
        })
        .select()
        .single();

      if (error) throw error;
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

      // If verified, also update the user's profile
      if (status === 'verified') {
        const { data: ver } = await supabase
          .from('identity_verifications' as any)
          .select('user_id')
          .eq('id', verificationId)
          .single();

        if (ver) {
          await supabase
            .from('profiles' as any)
            .update({ identity_verified: true } as any)
            .eq('id', (ver as any).user_id);
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