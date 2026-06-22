// Portfolio Image Upload Service
// Handles uploading images for portfolio items and services to Supabase storage

import { supabase } from './supabase';

const BUCKET_NAME = 'portfolio-images';

export interface UploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

const RECOMMENDED_WIDTH = 800;
const RECOMMENDED_HEIGHT = 450;

/** Validate image dimensions using a hidden Image element */
function validateImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to read image dimensions'));
    };
    img.src = objectUrl;
  });
}

/** Get dimension validation error message */
function getDimensionError(w: number, h: number): string | null {
  if (w < RECOMMENDED_WIDTH) {
    return `Image width too small (${w}px). Minimum width required: ${RECOMMENDED_WIDTH}px.`;
  }
  if (h < RECOMMENDED_HEIGHT) {
    return `Image height too small (${h}px). Minimum height required: ${RECOMMENDED_HEIGHT}px.`;
  }
  const ratio = w / h;
  if (ratio < 1.4) {
    return `Image is too tall (${ratio.toFixed(1)}:1). Cover images must be landscape (minimum ${1.4}:1).`;
  }
  if (ratio > 2.0) {
    return `Image is too wide (${ratio.toFixed(1)}:1). Cover images must be standard landscape (maximum ${2.0}:1).`;
  }
  return null;
}

export const portfolioImageUpload = {
  /**
   * Upload an image file to Supabase storage
   * @param file - The image file to upload
   * @param folder - Subfolder (e.g., 'portfolio', 'services')
   * @returns Upload result with public URL
   */
  async upload(file: File, folder: 'portfolio' | 'services' = 'portfolio'): Promise<UploadResult> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { success: false, error: 'Not authenticated' };

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        return { success: false, error: 'Only JPEG, PNG, WebP, GIF, SVG images are allowed' };
      }

      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        return { success: false, error: 'File must be less than 5MB' };
      }

      // Validate image dimensions
      try {
        const dims = await validateImageDimensions(file);
        const dimError = getDimensionError(dims.width, dims.height);
        if (dimError) {
          return { success: false, error: dimError };
        }
      } catch {
        return { success: false, error: 'Could not read image dimensions. Try a different file.' };
      }

      // Generate unique filename
      const fileExt = file.name.split('.').pop() || 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
      const filePath = `${user.id}/${folder}/${fileName}`;

      // Upload to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(filePath, file, {
          upsert: false,
          contentType: file.type,
        });

      if (uploadError) {
        // If bucket doesn't exist, try to inform user
        if (uploadError.message.includes('Bucket not found') || uploadError.message.includes('not found')) {
          return { success: false, error: `Storage bucket '${BUCKET_NAME}' not configured. Contact support.` };
        }
        return { success: false, error: uploadError.message };
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);

      return { success: true, url: publicUrl };
    } catch (error) {
      console.error('Image upload error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Upload failed' };
    }
  },

  /**
   * Delete an image from storage by its public URL
   */
  async deleteByUrl(imageUrl: string): Promise<UploadResult> {
    try {
      if (!imageUrl) return { success: true };

      // Extract file path from URL
      const bucketUrl = `${supabase.storage.from(BUCKET_NAME).getPublicUrl('').data.publicUrl}`;
      // The URL format is: {supabaseUrl}/storage/v1/object/public/portfolio-images/{path}
      const urlObj = new URL(imageUrl);
      const pathParts = urlObj.pathname.split('/');
      const bucketIndex = pathParts.indexOf(BUCKET_NAME);
      if (bucketIndex === -1) return { success: true }; // Not our bucket
      const filePath = pathParts.slice(bucketIndex + 1).join('/');
      if (!filePath) return { success: true };

      const { error } = await supabase.storage
        .from(BUCKET_NAME)
        .remove([filePath]);

      if (error) {
        console.warn('Failed to delete image file:', error.message);
      }

      return { success: true };
    } catch (error) {
      console.warn('Delete image error:', error);
      return { success: true }; // Non-fatal
    }
  },

  /**
   * Get file extension from a File object
   */
  getFileExtension(filename: string): string {
    return filename.split('.').pop() || 'jpg';
  },
};
