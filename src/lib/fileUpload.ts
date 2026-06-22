// File Upload Service
// Handles file uploads to the backend edge function

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zttwsjehcgaicziqyxpq.supabase.co';

export interface ContractFile {
  id: string;
  contract_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_size: number;
  file_type: string;
  public_url: string;
  description: string | null;
  created_at: string;
}

export const fileUploadService = {
  // Upload a file for a contract
  async uploadFile(
    file: File,
    contractId: string,
    description?: string
  ): Promise<{ success: boolean; file?: ContractFile; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const formData = new FormData();
      formData.append('file', file);
      formData.append('contract_id', contractId);
      if (description) {
        formData.append('description', description);
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/file-upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Failed to upload file' };
      }

      return { success: true, file: data.file };
    } catch (error) {
      console.error('File upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return { success: false, error: errorMessage };
    }
  },

  // Get files for a contract
  async getContractFiles(contractId: string): Promise<ContractFile[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return [];
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/file-upload?contract_id=${contractId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to fetch files:', data.error || data.message || data);
        return [];
      }

      return data.files || [];
    } catch (error) {
      console.error('Fetch files error:', error);
      return [];
    }
  },

  // Delete a file
  async deleteFile(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/file-upload`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ fileId }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        return { success: false, error: data.error || data.message || 'Failed to delete file' };
      }

      return { success: true };
    } catch (error) {
      console.error('Delete file error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete file';
      return { success: false, error: errorMessage };
    }
  },

  // Subscribe to file updates in real-time
  subscribeToContractFiles(
    contractId: string,
    callback: () => void
  ) {
    const channel = supabase
      .channel(`contract-files-updates-${contractId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'contract_files',
          filter: `contract_id=eq.${contractId}`,
        },
        () => {
          callback();
        }
      )
      .subscribe();

    return channel;
  },

  // Format file size for display
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  },

  // Get file icon based on type
  getFileIcon(type: string): string {
    if (type.startsWith('image/')) return '🖼️';
    if (type === 'application/pdf') return '📄';
    if (type.includes('word') || type.includes('document')) return '📝';
    if (type.includes('excel') || type.includes('spreadsheet')) return '📊';
    if (type.includes('powerpoint') || type.includes('presentation')) return '📽️';
    if (type.includes('zip') || type.includes('compressed')) return '📦';
    return '📎';
  },
};
