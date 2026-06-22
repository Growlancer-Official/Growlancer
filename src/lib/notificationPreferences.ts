/**
 * Notification Preferences Service
 * Pure data-access layer for user notification preferences.
 * No React state, no lifecycle — hook/wrapper components manage those.
 */

import { supabase } from './supabase';
import { captureError } from './telemetry';
import type { Json } from '../types/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationChannel = 'email' | 'inApp' | 'push';

export type NotificationCategory =
  | 'proposals'
  | 'contracts'
  | 'messages'
  | 'payments'
  | 'milestones'
  | 'marketing'
  | 'invitations';

export type NotificationPreferences = Record<NotificationCategory, Record<NotificationChannel, boolean>>;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  proposals: { email: true, inApp: true, push: true },
  contracts: { email: true, inApp: true, push: true },
  messages: { email: true, inApp: true, push: true },
  payments: { email: true, inApp: true, push: true },
  milestones: { email: true, inApp: true, push: true },
  marketing: { email: false, inApp: true, push: false },
  invitations: { email: true, inApp: true, push: true },
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const notificationPreferencesService = {
  /**
   * Get the current user's notification preferences.
   * Returns defaults if none are saved yet.
   */
  async get(): Promise<{ preferences: NotificationPreferences; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) {
        return { preferences: DEFAULT_NOTIFICATION_PREFERENCES, error: 'Not authenticated' };
      }

      const { data, error } = await supabase
        .rpc('get_notification_preferences' as any, { p_user_id: user.user.id });

      if (error) {
        captureError('Failed to get notification preferences', { source: 'notifications' });
        return { preferences: DEFAULT_NOTIFICATION_PREFERENCES, error: error.message };
      }

      // Merge with defaults to ensure all keys exist
      const merged = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...((data as unknown as Record<string, unknown>) || {}) } as NotificationPreferences;
      return { preferences: merged };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      captureError('Exception getting notification preferences', { source: 'notifications' });
      return { preferences: DEFAULT_NOTIFICATION_PREFERENCES, error: message };
    }
  },

  /**
   * Save (merge) notification preferences for the current user.
   * Only the provided categories/channels are updated; others remain unchanged.
   */
  async save(
    preferences: Partial<NotificationPreferences>
  ): Promise<{ success: boolean; preferences?: NotificationPreferences; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data, error } = await supabase
        .rpc('set_notification_preferences' as any, {
          p_user_id: user.user.id,
          p_preferences: preferences,
        });

      if (error) {
        captureError('Failed to save notification preferences', { source: 'notifications' });
        return { success: false, error: error.message };
      }

      return { success: true, preferences: (data || {}) as NotificationPreferences };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      captureError('Exception saving notification preferences', { source: 'notifications' });
      return { success: false, error: message };
    }
  },

  /**
   * Update a single notification category's channel settings.
   *
   * @param category - The category to update (e.g. 'proposals', 'messages')
   * @param channels - The channel toggles (e.g. { email: true, push: false })
   */
  async updateCategory(
    category: NotificationCategory,
    channels: Partial<Record<NotificationChannel, boolean>>
  ): Promise<{ success: boolean; preferences?: NotificationPreferences; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) {
        return { success: false, error: 'Not authenticated' };
      }

      // Get current preferences first
      const { data: currentPrefs } = await supabase
        .rpc('get_notification_preferences' as any, { p_user_id: user.user.id });

      const mergedPrefs = {
        ...((currentPrefs as unknown as Record<string, unknown>) || {}),
        [category]: {
          ...((currentPrefs as Record<string, unknown>)?.[category] as Record<string, boolean> || {}),
          ...channels,
        },
      };

      const { data, error } = await supabase
        .rpc('set_notification_preferences' as any, {
          p_user_id: user.user.id,
          p_preferences: mergedPrefs as unknown as Json,
        });

      if (error) {
        captureError('Failed to update notification category', { source: 'notifications', category });
        return { success: false, error: error.message };
      }

      return { success: true, preferences: (data || {}) as NotificationPreferences };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      captureError('Exception updating notification category', { source: 'notifications', category });
      return { success: false, error: message };
    }
  },

  /**
   * Reset notification preferences to defaults.
   */
  async resetToDefaults(): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user?.user?.id) {
        return { success: false, error: 'Not authenticated' };
      }

      const { error } = await supabase
        .from('notification_preferences')
        .upsert({
          user_id: user.user.id,
          categories: DEFAULT_NOTIFICATION_PREFERENCES as unknown as Json,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: 'user_id' });

      if (error) {
        captureError('Failed to reset notification preferences', { source: 'notifications' });
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      captureError('Exception resetting notification preferences', { source: 'notifications' });
      return { success: false, error: message };
    }
  },
};