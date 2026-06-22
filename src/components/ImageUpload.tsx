import { useState, useRef, useCallback } from 'react';
import { AlertCircle,
  CheckCircle2,
  Folder,
  Image as ImageIcon,
  Link,
  Loader2,
  Replace,
  Upload,
  X } from 'lucide-react';
import { portfolioImageUpload } from '../lib/portfolioImageUpload';

const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const RECOMMENDED_DIMENSIONS = '1200 × 675 px';
const RECOMMENDED_WIDTH = 800;
const RECOMMENDED_HEIGHT = 450;
const MIN_ASPECT_RATIO = 1.4;
const MAX_ASPECT_RATIO = 2.0;
const ALLOWED_FORMATS = 'JPEG, PNG, WebP, GIF';

interface ImageUploadProps {
  /** Current image URL (for edit mode preview) */
  currentImage?: string | null;
  /** Called when upload completes with the public URL */
  onUploadComplete: (url: string) => void;
  /** Called when image is removed */
  onRemove?: () => void;
  /** Folder in storage bucket */
  folder?: 'portfolio' | 'services';
  /** Custom label */
  label?: string;
  /** Allow URL input as fallback */
  allowUrl?: boolean;
  /** Aspect ratio for preview display */
  aspectRatio?: string;
  /** If true, shows a compact/smaller upload area */
  compact?: boolean;
}

export function ImageUpload({
  currentImage,
  onUploadComplete,
  onRemove,
  folder = 'portfolio',
  label = 'Cover Image',
  allowUrl = true,
  aspectRatio = '16/9',
  compact = false,
}: ImageUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImage || null);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(!!currentImage);
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlError, setUrlError] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /** Validate image dimensions using a hidden Image element */
  const validateImageDimensions = useCallback((file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image for dimension validation'));
      };
      img.src = objectUrl;
    });
  }, []);

  /** Get dimension validation error message */
  const getDimensionError = useCallback((w: number, h: number): string | null => {
    if (w < RECOMMENDED_WIDTH) {
      return `Image width too small (${w}px). Minimum width: ${RECOMMENDED_WIDTH}px. Recommended: 1200px.`;
    }
    if (h < RECOMMENDED_HEIGHT) {
      return `Image height too small (${h}px). Minimum height: ${RECOMMENDED_HEIGHT}px. Recommended: 675px.`;
    }
    const ratio = w / h;
    if (ratio < MIN_ASPECT_RATIO) {
      return `Image is too tall (${ratio.toFixed(1)}:1). Cover images should be landscape (min ${MIN_ASPECT_RATIO.toFixed(1)}:1).`;
    }
    if (ratio > MAX_ASPECT_RATIO) {
      return `Image is too wide (${ratio.toFixed(1)}:1). Cover images should be landscape (max ${MAX_ASPECT_RATIO.toFixed(1)}:1).`;
    }
    return null;
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setUploaded(false);
    setValidationError(null);
    setImageDimensions(null);
    setSelectedFile(null);

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      setValidationError('Only JPEG, PNG, WebP, GIF images are allowed');
      return;
    }

    // Validate file size (5MB max)
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setValidationError(`File too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Maximum size: ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    // Show local preview immediately
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    // Validate image dimensions
    try {
      const dims = await validateImageDimensions(file);
      setImageDimensions(dims);

      const dimError = getDimensionError(dims.width, dims.height);
      if (dimError) {
        setValidationError(dimError);
        URL.revokeObjectURL(localUrl);
        setPreviewUrl(currentImage || null);
        return;
      }

      // All validations passed — store file for upload
      setSelectedFile(file);
    } catch {
      setValidationError('Could not read image dimensions. Try a different file.');
      URL.revokeObjectURL(localUrl);
      setPreviewUrl(currentImage || null);
    }
  }, [validateImageDimensions, getDimensionError, currentImage]);

  /** Actually upload the selected file to Supabase */
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setUploading(true);
    setValidationError(null);

    try {
      const result = await portfolioImageUpload.upload(selectedFile, folder);
      if (result.success && result.url) {
        setUploaded(true);
        setSelectedFile(null);
        onUploadComplete(result.url);
      } else {
        setValidationError(result.error || 'Upload failed');
        // Keep preview so user can retry
      }
    } catch {
      setValidationError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [selectedFile, folder, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [handleFile]);

  const handleRemove = useCallback(() => {
    setPreviewUrl(null);
    setUrlValue('');
    setUrlError('');
    setValidationError(null);
    setSelectedFile(null);
    setImageDimensions(null);
    setUploaded(false);
    onRemove?.();
  }, [onRemove]);

  const handleUrlSubmit = useCallback(() => {
    const url = urlValue.trim();
    if (!url) {
      setUrlError('Please enter a URL');
      return;
    }
    try {
      new URL(url); // Validate URL format
      setUrlError('');
      setPreviewUrl(url);
      setUploaded(true);
      setSelectedFile(null);
      setImageDimensions(null);
      setValidationError(null);
      onUploadComplete(url);
      setShowUrlInput(false);
    } catch {
      setUrlError('Please enter a valid URL');
    }
  }, [urlValue, onUploadComplete]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>

      {/* File size info badge */}
      <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">Max {MAX_FILE_SIZE_MB}MB</span>
        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">{ALLOWED_FORMATS}</span>
        <span className="px-2 py-0.5 bg-slate-100 rounded-md font-medium">{RECOMMENDED_DIMENSIONS}</span>
      </div>

      {/* Validation Error */}
      {validationError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs text-red-700">{validationError}</p>
            {imageDimensions && (
              <p className="text-[10px] text-red-500 mt-1">
                Your image: {imageDimensions.width} × {imageDimensions.height}px
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { setValidationError(null); handleRemove(); }}
            className="text-red-400 hover:text-red-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Preview / Upload Area */}
      {previewUrl && !uploaded ? (
        <div className="space-y-3">
          {/* Preview */}
          <div
            className={`relative rounded-xl overflow-hidden border-2 border-slate-200 group ${compact ? 'max-h-40' : ''}`}
            style={{ aspectRatio: compact ? undefined : aspectRatio }}
          >
            <img
              src={previewUrl}
              alt="Preview"
              className={`w-full ${compact ? 'h-32' : 'h-full'} object-cover`}
            />
            {/* Dimension badge */}
            {imageDimensions && (
              <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/60 text-white text-[10px] rounded-md backdrop-blur-sm">
                {imageDimensions.width} × {imageDimensions.height}px
              </div>
            )}
            {/* Hover overlay — only if not showing upload state */}
            {!selectedFile && (
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-1.5 bg-white rounded-lg hover:bg-slate-100 transition-colors shadow-lg"
                  title="Replace image"
                >
                  <Upload className="w-4 h-4 text-slate-700" />
                </button>
                <button
                  type="button"
                  onClick={handleRemove}
                  className="p-1.5 bg-white rounded-lg hover:bg-red-50 transition-colors shadow-lg"
                  title="Remove image"
                >
                  <X className="w-4 h-4 text-red-500" />
                </button>
              </div>
            )}
          </div>

          {/* Upload or Confirm button */}
          {selectedFile && !uploading && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleUpload}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-all shadow-sm"
              >
                <Upload className="w-4 h-4" />
                Upload Image
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="px-4 py-2.5 text-sm text-slate-600 font-medium rounded-xl hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              {imageDimensions && (
                <span className="text-[10px] text-slate-400">
                  {imageDimensions.width} × {imageDimensions.height}px · {(selectedFile.size / (1024 * 1024)).toFixed(1)}MB
                </span>
              )}
            </div>
          )}
        </div>
      ) : uploading ? (
        <div
          className={`flex items-center justify-center rounded-xl border-2 border-emerald-200 bg-emerald-50 ${compact ? 'h-32' : ''}`}
          style={{ aspectRatio: compact ? undefined : aspectRatio, minHeight: compact ? undefined : '120px' }}
        >
          <div className="text-center">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mx-auto mb-1" />
            <p className="text-xs text-emerald-600 font-medium">Uploading...</p>
            <p className="text-[10px] text-emerald-500 mt-1">Compressing & optimizing</p>
          </div>
        </div>
      ) : (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all cursor-pointer ${
            dragOver
              ? 'border-emerald-500 bg-emerald-50'
              : 'border-slate-300 bg-slate-50 hover:border-emerald-400 hover:bg-emerald-50/50'
          } ${compact ? 'h-32 py-2' : ''}`}
          style={{ aspectRatio: compact ? undefined : aspectRatio, minHeight: compact ? undefined : '120px' }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />
          <Upload className={`w-6 h-6 mb-1 ${dragOver ? 'text-emerald-500' : 'text-slate-400'}`} />
          <p className={`text-xs font-medium ${dragOver ? 'text-emerald-600' : 'text-slate-500'}`}>
            {dragOver ? 'Drop here' : 'Click or drag to upload'}
          </p>
          <p className="text-[10px] text-slate-400 mt-0.5">{ALLOWED_FORMATS} · Max {MAX_FILE_SIZE_MB}MB · {RECOMMENDED_DIMENSIONS}</p>
        </div>
      )}

      {/* URL input toggle */}
      {allowUrl && !previewUrl && !uploading && (
        <div className="mt-2">
          {showUrlInput ? (
            <div className="flex gap-2">
              <div className="flex-1">
                <input
                  type="url"
                  value={urlValue}
                  onChange={(e) => { setUrlValue(e.target.value); setUrlError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleUrlSubmit()}
                  placeholder="https://example.com/image.jpg"
                  className={`w-full px-3 py-2 text-sm rounded-lg border ${urlError ? 'border-red-300' : 'border-slate-200'} focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition-all`}
                />
                {urlError && <p className="text-xs text-red-500 mt-1">{urlError}</p>}
              </div>
              <button
                type="button"
                onClick={handleUrlSubmit}
                className="px-3 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setShowUrlInput(false); setUrlValue(''); setUrlError(''); }}
                className="px-3 py-2 text-slate-500 text-sm rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowUrlInput(true)}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-600 transition-colors"
            >
              <Link className="w-3.5 h-3.5" />
              Or enter image URL
            </button>
          )}
        </div>
      )}

      {/* Uploaded state badge */}
      {uploaded && !selectedFile && (
        <p className="text-xs text-emerald-600 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Image uploaded
        </p>
      )}
    </div>
  );
}
