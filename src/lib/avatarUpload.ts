// Avatar Upload Service
// Handles avatar image uploads to Supabase storage

import { supabase } from './supabase';

const BUCKET_NAME = 'avatars';

export const avatarUploadService = {
  // Upload avatar image directly to Supabase storage
  async uploadAvatar(file: File): Promise<{ success: boolean; avatar_url?: string; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Generate unique filename with folder structure
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        // If bucket doesn't exist, try to create it
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
          const createResult = await this.createBucket();
          if (!createResult.success) {
            return { success: false, error: `Storage bucket not found. Please create '${BUCKET_NAME}' bucket in Supabase storage.` };
          }
          // Retry upload after creating bucket
          const { error: retryError } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(filePath, file, {
              upsert: true,
              contentType: file.type,
            });
          
          if (retryError) {
            return { success: false, error: retryError.message };
          }
        } else {
          return { success: false, error: uploadError.message };
        }
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      // Update user profile with new avatar URL
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar: publicUrl })
        .eq('id', user.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true, avatar_url: publicUrl };
    } catch (error) {
      console.error('Avatar upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return { success: false, error: errorMessage };
    }
  },

  // Create avatars bucket (requires admin privileges)
  async createBucket(): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.storage.createBucket(BUCKET_NAME, {
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
      });

      if (error) {
        // Bucket might already exist
        if (error.message.includes('already exists')) {
          return { success: true };
        }
        return { success: false, error: error.message };
      }

      // Set up RLS policies - note: policies are already set via migrations
      // RLS policies are handled by database migrations, no need to call RPC

      return { success: true };
    } catch (error) {
      console.error('Create bucket error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create bucket';
      return { success: false, error: errorMessage };
    }
  },

  // Delete avatar
  async deleteAvatar(): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Get current avatar URL to extract file path
      const { data: profile } = await supabase
        .from('profiles')
        .select('avatar')
        .eq('id', user.id)
        .single();

      if (profile?.avatar) {
        // Extract file path from URL (now includes user folder)
        const urlParts = profile.avatar.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const filePath = `${user.id}/${fileName}`;
        
        // Delete from storage
        const { error: deleteError } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([filePath]);

        if (deleteError) {
          console.warn('Failed to delete avatar file:', deleteError);
        }
      }

      // Update profile to remove avatar
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar: null })
        .eq('id', user.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Delete avatar error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete avatar';
      return { success: false, error: errorMessage };
    }
  },
};
