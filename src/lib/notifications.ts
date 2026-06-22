// Notifications Service
// Pure data-access layer for notifications. Direct Supabase queries with CacheManager.
// No React state, no lifecycle - hook/wrapper components manage those.

import { supabase, dbFunctions, realtimeChannels } from './supabase';
import { CacheManager } from './services/cacheManager';
import type { Tables, Json } from '../types/supabase';

// Re-export canonical DB type
export type Notification = Tables<'notifications'>;

// Use intersection type to make 'metadata' optional without breaking interface extension rules.
// Notification requires metadata: Json, so extending with optional metadata is a TS error.
export type NotificationWithMeta = Omit<Notification, 'metadata'> & {
  archived?: boolean;
  metadata?: Json;
  updated_at?: string;
};

export interface GroupedNotifications {
  today: NotificationWithMeta[];
  thisWeek: NotificationWithMeta[];
  earlier: NotificationWithMeta[];
}

export const notificationService = {
  /**
   * Get user's notifications with caching
   */
  async getByUser(userId: string, options?: {
    unreadOnly?: boolean;
    limit?: number;
    offset?: number;
    type?: string;
    forceRefetch?: boolean;
  }): Promise<{ notifications: NotificationWithMeta[]; unread_count: number }> {
    const cacheKey = `notifications:${userId}:${options?.unreadOnly ? 'unread' : 'all'}:${options?.type || 'all'}`;
    const forceRefetch = options?.forceRefetch ?? false;

    if (!forceRefetch) {
      const cached = CacheManager.get<{ notifications: NotificationWithMeta[]; unread_count: number }>(cacheKey);
      if (cached) return cached;
    }

    try {
      let query = (supabase
        .from('notifications') as any)
        .select('*', { count: 'exact', head: false })
        .eq('user_id', userId)
        .eq('archived', false)
        .order('created_at', { ascending: false });

      if (options?.unreadOnly) {
        query = query.eq('read', false);
      }

      if (options?.type) {
        query = query.eq('type', options.type);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      } else {
        query = query.limit(50);
      }

      if (options?.offset && options.offset > 0) {
        query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Get unread count
      const { count: unreadCount } = await (supabase
        .from('notifications') as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
        .eq('archived', false);

      const result = {
        notifications: (data || []) as NotificationWithMeta[],
        unread_count: unreadCount || 0,
      };

      CacheManager.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return { notifications: [], unread_count: 0 };
    }
  },

  /**
   * Get archived notifications for a user
   */
  async getArchived(userId: string, options?: {
    limit?: number;
    offset?: number;
    type?: string;
  }): Promise<{ notifications: NotificationWithMeta[]; unread_count: number }> {
    try {
      const { data, error } = await (supabase
        .from('notifications') as any)
        .select('*')
        .eq('user_id', userId)
        .eq('archived', true)
        .order('created_at', { ascending: false })
        .limit(options?.limit || 50);

      if (error) throw error;

      // Get unread count (non-archived)
      const { count: unreadCount } = await (supabase
        .from('notifications') as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
        .eq('archived', false);

      return {
        notifications: (data || []) as NotificationWithMeta[],
        unread_count: unreadCount || 0,
      };
    } catch (error) {
      console.error('Error fetching archived notifications:', error);
      return { notifications: [], unread_count: 0 };
    }
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId);

      if (error) throw error;

      // Invalidate cache
      CacheManager.invalidate('notifications:');
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  },

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false);

      if (error) throw error;

      CacheManager.invalidate('notifications:');
      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  },

  /**
   * Get unread count for a user
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const { count, error } = await (supabase
        .from('notifications') as any)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('read', false)
        .eq('archived', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  },

  /**
   * Archive a notification (soft-delete pattern)
   */
  async archiveNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await dbFunctions.archiveNotification(notificationId, userId);
      if (error) throw error;
      CacheManager.invalidate('notifications:');
      return (data as any)?.success === true;
    } catch (error) {
      console.error('Error archiving notification:', error);
      return false;
    }
  },

  /**
   * Restore a notification from archive
   */
  async restoreNotification(notificationId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await dbFunctions.restoreNotification(notificationId, userId);
      if (error) throw error;
      CacheManager.invalidate('notifications:');
      return (data as any)?.success === true;
    } catch (error) {
      console.error('Error restoring notification:', error);
      return false;
    }
  },

  /**
   * Archive all read notifications for a user
   */
  async archiveAllRead(userId: string): Promise<boolean> {
    try {
      const { data, error } = await dbFunctions.archiveAllReadNotifications(userId);
      if (error) throw error;
      CacheManager.invalidate('notifications:');
      return (data as any)?.success === true;
    } catch (error) {
      console.error('Error archiving all read:', error);
      return false;
    }
  },

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;

      CacheManager.invalidate('notifications:');
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  },

  // ==================== PUSH TOKENS ====================

  /**
   * Register a push notification token
   */
  async registerPushToken(token: string, platform: string, deviceName?: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await dbFunctions.registerPushToken(user.id, token, platform, deviceName);
      if (error) throw error;
      return (data as any)?.success === true;
    } catch (error) {
      console.error('Error registering push token:', error);
      return false;
    }
  },

  /**
   * Unregister a push notification token
   */
  async unregisterPushToken(token: string): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const { data, error } = await dbFunctions.unregisterPushToken(user.id, token);
      if (error) throw error;
      return (data as any)?.success === true;
    } catch (error) {
      console.error('Error unregistering push token:', error);
      return false;
    }
  },

  /**
   * Get user's active push tokens
   */
  async getPushTokens(): Promise<Array<{ id: string; platform: string; device_name?: string; created_at: string }>> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await dbFunctions.getUserPushTokens(user.id);
      if (error) throw error;
      return (data as unknown as Array<{ id: string; platform: string; device_name?: string; created_at: string }>) || [];
    } catch (error) {
      console.error('Error getting push tokens:', error);
      return [];
    }
  },

  // ==================== REALTIME SUBSCRIPTION ====================

  /**
   * Subscribe to real-time notification changes for a user
   * Handles INSERT, UPDATE, and DELETE events
   */
  subscribe(userId: string, callback: (notification: NotificationWithMeta) => void) {
    const channel = realtimeChannels.notifications(`${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          try {
            if (!payload || !payload.new) return;

            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
              const notification = payload.new as NotificationWithMeta;
              if (notification.id) {
                callback(notification);
              }
            }
          } catch (error) {
            // Silently ignore subscription errors to prevent console spam
          }
        }
      )
      .subscribe();

    return channel;
  },

  // ==================== UI HELPERS ====================

  /**
   * Get notification icon based on type
   */
  getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      proposal: '📝',
      invite: '📨',
      contract: '📋',
      message: '💬',
      payment: '💰',
      escrow: '🔒',
      review: '⭐',
      system: '🔔',
      milestone: '🏁',
      dispute: '⚖️',
      verification: '✅',
      subscription: '🔄',
      withdrawal: '🏧',
      referral: '🤝',
      security: '🛡️',
    };
    return icons[type] || '🔔';
  },

  /**
   * Get notification color class based on type
   */
  getNotificationColor(type: string): string {
    const colors: Record<string, string> = {
      proposal: 'bg-blue-100 text-blue-600',
      invite: 'bg-purple-100 text-purple-600',
      contract: 'bg-emerald-100 text-emerald-600',
      message: 'bg-cyan-100 text-cyan-600',
      payment: 'bg-green-100 text-green-600',
      escrow: 'bg-orange-100 text-orange-600',
      review: 'bg-yellow-100 text-yellow-600',
      system: 'bg-slate-100 text-slate-600',
      milestone: 'bg-indigo-100 text-indigo-600',
      dispute: 'bg-red-100 text-red-600',
      verification: 'bg-teal-100 text-teal-600',
      subscription: 'bg-violet-100 text-violet-600',
      withdrawal: 'bg-rose-100 text-rose-600',
      referral: 'bg-pink-100 text-pink-600',
      security: 'bg-amber-100 text-amber-600',
    };
    return colors[type] || 'bg-slate-100 text-slate-600';
  },

  /**
   * Get a human-readable label for a notification type
   */
  getNotificationTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      proposal: 'Proposals',
      invite: 'Invites',
      contract: 'Contracts',
      message: 'Messages',
      payment: 'Payments',
      escrow: 'Escrow',
      review: 'Reviews',
      system: 'System',
      milestone: 'Milestones',
      dispute: 'Disputes',
      verification: 'Verification',
      subscription: 'Subscriptions',
      withdrawal: 'Withdrawals',
      referral: 'Referrals',
      security: 'Security',
    };
    return labels[type] || type.charAt(0).toUpperCase() + type.slice(1);
  },

  // ==================== GROUPING UTILITY ====================

  /**
   * Group notifications by date (Today, This Week, Earlier)
   */
  groupNotificationsByDate(notifications: NotificationWithMeta[]): GroupedNotifications {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Start of current week (Sunday)

    const grouped: GroupedNotifications = {
      today: [],
      thisWeek: [],
      earlier: [],
    };

    for (const notification of notifications) {
      const createdAt = new Date(notification.created_at);
      if (createdAt >= startOfToday) {
        grouped.today.push(notification);
      } else if (createdAt >= startOfWeek) {
        grouped.thisWeek.push(notification);
      } else {
        grouped.earlier.push(notification);
      }
    }

    return grouped;
  },
};