// Avatar Pack Service
// Provides pre-uploaded avatars for users and company branding for clients

import { supabase } from './supabase';

// Professional cartoon avatar URLs - mixed collection (PNG format)
const PROFESSIONAL_CARTOON_AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional1',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional2',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional3',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional4',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional5',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional6',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional7',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional8',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional9',
  'https://api.dicebear.com/7.x/avataaars/png?seed=Professional10'
];

// Professional company logo/branding presets
const COMPANY_BRANDING_PRESETS = [
  { name: 'Tech Startup', color: '#3B82F6', icon: '💻' },
  { name: 'Creative Agency', color: '#8B5CF6', icon: '🎨' },
  { name: 'Financial Services', color: '#059669', icon: '💰' },
  { name: 'Healthcare', color: '#EF4444', icon: '🏥' },
  { name: 'Education', color: '#F59E0B', icon: '📚' },
  { name: 'Retail', color: '#EC4899', icon: '🛍️' },
  { name: 'Manufacturing', color: '#6B7280', icon: '🏭' },
  { name: 'Consulting', color: '#6366F1', icon: '💼' },
];

const COMPANY_BUCKET = 'company-logos';

export const avatarPackService = {
  // Get all professional cartoon avatars
  getAvatars() {
    return PROFESSIONAL_CARTOON_AVATARS;
  },

  // Download and upload a professional cartoon avatar to user's storage
  async selectProfessionalCartoonAvatar(avatarUrl: string): Promise<{ success: boolean; avatar_url?: string; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Fetch the avatar image
      const response = await fetch(avatarUrl);
      if (!response.ok) {
        return { success: false, error: 'Failed to fetch avatar image' };
      }

      const blob = await response.blob();
      const file = new File([blob], `professional-cartoon-${Date.now()}.png`, { type: 'image/png' });

      // Upload to user's avatar storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(`${user.id}/professional-cartoon-${Date.now()}.png`, file, {
          upsert: true,
          contentType: 'image/png',
        });

      if (uploadError) {
        return { success: false, error: uploadError.message };
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(uploadData.path);

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
      console.error('Professional cartoon avatar selection error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return { success: false, error: errorMessage };
    }
  },

  // Get avatar pack statistics
  getPackStats() {
    return {
      total: PROFESSIONAL_CARTOON_AVATARS.length,
      available: PROFESSIONAL_CARTOON_AVATARS.length
    };
  },

  // Get company branding presets
  getCompanyBrandingPresets() {
    return COMPANY_BRANDING_PRESETS;
  },

  // Upload company logo
  async uploadCompanyLogo(file: File, companyId: string): Promise<{ success: boolean; logo_url?: string; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp'];
      if (!validTypes.includes(file.type)) {
        return { success: false, error: 'Invalid file type. Please upload JPG, PNG, SVG, or WebP.' };
      }

      // Validate file size (max 2MB for logos)
      if (file.size > 2 * 1024 * 1024) {
        return { success: false, error: 'File size too large. Maximum size is 2MB.' };
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `company-logo-${Date.now()}.${fileExt}`;
      const filePath = `${companyId}/${fileName}`;

      // Upload to company logos bucket
      const { error: uploadError } = await supabase.storage
        .from(COMPANY_BUCKET)
        .upload(filePath, file, {
          upsert: true,
          contentType: file.type,
        });

      if (uploadError) {
        // Try to create bucket if it doesn't exist
        if (uploadError.message.includes('Bucket not found')) {
          const { error: createError } = await supabase.storage.createBucket(COMPANY_BUCKET, {
            public: true,
            fileSizeLimit: 2097152, // 2MB
            allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml', 'image/webp'],
          });

          if (createError && !createError.message.includes('already exists')) {
            return { success: false, error: createError.message };
          }

          // Retry upload
          const { error: retryError } = await supabase.storage
            .from(COMPANY_BUCKET)
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
        .from(COMPANY_BUCKET)
        .getPublicUrl(filePath);

      // Update client profile with company logo
      const clientProfilesUpdate = supabase
        .from('client_profiles') as any;
      const { error: updateError } = await clientProfilesUpdate
        .update({ company_logo: publicUrl })
        .eq('user_id', user.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true, logo_url: publicUrl };
    } catch (error) {
      console.error('Company logo upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      return { success: false, error: errorMessage };
    }
  },

  // Delete company logo
  async deleteCompanyLogo(companyId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Get current logo URL
      const clientProfilesSelect = supabase
        .from('client_profiles') as any;
      const { data: profile } = await clientProfilesSelect
        .select('company_logo')
        .eq('user_id', user.id)
        .single();
      const profileAny = profile as any;

      if (profileAny?.company_logo) {
        // Extract file path from URL
        const urlParts = profileAny.company_logo.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const filePath = `${companyId}/${fileName}`;
        
        // Delete from storage
        const { error: deleteError } = await supabase.storage
          .from(COMPANY_BUCKET)
          .remove([filePath]);

        if (deleteError) {
          console.warn('Failed to delete company logo file:', deleteError);
        }
      }

      // Update profile to remove logo
      const clientProfilesUpdate = supabase
        .from('client_profiles') as any;
      const { error: updateError } = await clientProfilesUpdate
        .update({ company_logo: null })
        .eq('user_id', user.id);

      if (updateError) {
        return { success: false, error: updateError.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Delete company logo error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete logo';
      return { success: false, error: errorMessage };
    }
  },
};
