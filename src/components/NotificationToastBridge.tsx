import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { notificationService, type NotificationWithMeta } from '../lib/notifications';
import { useToast } from './Toast';

/**
 * NotificationToastBridge
 *
 * Listens for real-time new notifications from the notificationService
 * and displays them as toast alerts. This component should be placed
 * inside the dashboard layouts (already wrapped by ToastProvider).
 */
export function NotificationToastBridge() {
  const { user } = useAuth();
  const toast = useToast();
  const seenIds = useRef<Set<string>>(new Set());
  const lastToastTime = useRef<number>(0);

  useEffect(() => {
    if (!user) return;

    // Pre-populate seen IDs with existing notifications to avoid
    // showing toasts for notifications that were already there
    notificationService.getByUser(user.id, { limit: 30, unreadOnly: true }).then((data) => {
      data.notifications.forEach((n) => {
        if (n.id) seenIds.current.add(n.id);
      });
    });

    const channel = notificationService.subscribe(user.id, (notification) => {
      if (!notification.id || seenIds.current.has(notification.id)) return;

      seenIds.current.add(notification.id);

      // Throttle toasts to at most one per 2 seconds to avoid spam
      const now = Date.now();
      if (now - lastToastTime.current < 2000) return;
      lastToastTime.current = now;

      const type = notification.type;
      const title = notification.title || 'New Notification';
      const message = notification.message || '';

      // Pick toast variant based on notification type
      if (type === 'payment' || type === 'escrow' || type === 'withdrawal') {
        toast.info(title, message, 5000);
      } else if (type === 'dispute' || type === 'error') {
        toast.error(title, message, 7000);
      } else if (type === 'contract' || type === 'milestone') {
        toast.success(title, message, 5000);
      } else if (type === 'proposal' || type === 'invite') {
        toast.success(title, message, 6000);
      } else if (type === 'message') {
        toast.info(title, message, 4000);
      } else if (type === 'review') {
        toast.success(title, message, 5000);
      } else if (type === 'verification' || type === 'security') {
        toast.warning(title, message, 6000);
      } else {
        toast.info(title, message, 4000);
      }
    });

    return () => {
      channel.unsubscribe();
    };
  }, [user, toast]);

  return null; // This component is invisible — it only bridges events
}