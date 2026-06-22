import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArchiveX,
  Bell,
  BellOff,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Delete,
  Filter,
  Inbox,
  List,
  Loader2,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { notificationService, type NotificationWithMeta } from '../lib/notifications';

type TabId = 'all' | 'unread' | 'archived';
type FilterValue = string | null; // null = all types, otherwise a notification type string

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'all', label: 'All', icon: Inbox },
  { id: 'unread', label: 'Unread', icon: Bell },
  { id: 'archived', label: 'Archived', icon: Archive },
];

export function NotificationsPanel() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [filterType, setFilterType] = useState<FilterValue>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [notifications, setNotifications] = useState<NotificationWithMeta[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [animateItem, setAnimateItem] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  // Derive available notification types from current data
  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    notifications.forEach(n => types.add(n.type));
    return Array.from(types).sort();
  }, [notifications]);

  const fetchNotifications = useCallback(async (tab: TabId) => {
    if (!user) return;
    setLoading(true);
    try {
      if (tab === 'archived') {
        const data = await notificationService.getArchived(user.id, { limit: 50 });
        setNotifications(data.notifications);
      } else {
        const data = await notificationService.getByUser(user.id, {
          limit: 50,
          unreadOnly: tab === 'unread',
          type: filterType || undefined,
          forceRefetch: true,
        });
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user, filterType]);

  // Fetch on tab/filter change
  useEffect(() => {
    fetchNotifications(activeTab);
  }, [activeTab, filterType, fetchNotifications]);

  // Subscribe to real-time updates (only for non-archived tabs)
  useEffect(() => {
    if (!user) return;

    let channel: { unsubscribe?: () => void } | null = null;
    try {
      channel = notificationService.subscribe(user.id, (notification) => {
        if (!notification.id) return;

        // Only auto-add if viewing 'all' or 'unread' tab
        if (activeTab !== 'archived') {
          setNotifications(prev => {
            const existing = prev.find(n => n.id === notification.id);
            if (existing) {
              return prev.map(n => (n.id === notification.id ? notification : n));
            }
            return [notification, ...prev];
          });

          if (!notification.read) {
            setUnreadCount(prev => prev + 1);
          }
        }
      });
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
    }

    return () => {
      if (channel?.unsubscribe) {
        try { channel.unsubscribe(); } catch { /* ignore */ }
      }
    };
  }, [user, activeTab]);

  // Close filter dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setShowFilterDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ==================== HANDLERS ====================

  const handleMarkAsRead = async (notificationId: string) => {
    const ok = await notificationService.markAsRead(notificationId);
    if (ok) {
      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const ok = await notificationService.markAllAsRead(user.id);
    if (ok) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  const handleDelete = async (notificationId: string) => {
    const ok = await notificationService.deleteNotification(notificationId);
    if (ok) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
      if (notifications.find(n => n.id === notificationId)?.read === false) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    }
  };

  const handleArchive = async (notificationId: string) => {
    if (!user) return;
    const ok = await notificationService.archiveNotification(notificationId, user.id);
    if (ok) {
      setAnimateItem(notificationId);
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== notificationId));
        setAnimateItem(null);
      }, 300);
      if (notifications.find(n => n.id === notificationId)?.read === false) {
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    }
  };

  const handleRestore = async (notificationId: string) => {
    if (!user) return;
    const ok = await notificationService.restoreNotification(notificationId, user.id);
    if (ok) {
      setNotifications(prev => prev.filter(n => n.id !== notificationId));
    }
  };

  const handleArchiveAllRead = async () => {
    if (!user) return;
    const ok = await notificationService.archiveAllRead(user.id);
    if (ok) {
      if (activeTab === 'all') {
        // Remove read notifications from current list
        setNotifications(prev => prev.filter(n => !n.read));
      } else {
        fetchNotifications(activeTab);
      }
      setUnreadCount(0);
    }
  };

  const handleRequestPushPermission = async () => {
    if (!('Notification' in window)) {
      console.warn('Push notifications not supported');
      return;
    }

    if (Notification.permission === 'granted') {
      // Already granted — could register service worker here
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Register push token via service worker (future enhancement)
      // For now, just acknowledge permission granted
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Pseudo-categories for date grouping
  const groupedNotifications = useMemo(() => {
    if (notifications.length === 0) return null;
    return notificationService.groupNotificationsByDate(notifications);
  }, [notifications]);

  // Render notifications grouped by date
  const renderGrouped = () => {
    if (!groupedNotifications) return null;

    const sections: { label: string; items: NotificationWithMeta[] }[] = [];
    if (groupedNotifications.today.length > 0) sections.push({ label: 'Today', items: groupedNotifications.today });
    if (groupedNotifications.thisWeek.length > 0) sections.push({ label: 'This Week', items: groupedNotifications.thisWeek });
    if (groupedNotifications.earlier.length > 0) sections.push({ label: 'Earlier', items: groupedNotifications.earlier });

    if (sections.length === 0) return null;

    return sections.map(section => (
      <div key={section.label}>
        <div className="px-4 py-2 bg-slate-50/80 border-b border-slate-100">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            {section.label}
          </span>
        </div>
        {section.items.map(notification => renderNotificationItem(notification))}
      </div>
    ));
  };

  const renderNotificationItem = (notification: NotificationWithMeta) => {
    const isAnimatingOut = animateItem === notification.id;

    return (
      <div
        key={notification.id}
        className={`p-4 hover:bg-slate-50 transition-all duration-200 ${
          !notification.read ? 'bg-blue-50/50' : ''
        } ${isAnimatingOut ? 'opacity-0 -translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'}`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${notificationService.getNotificationColor(notification.type)}`}>
            {notificationService.getNotificationIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm ${notification.read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>
                {notification.title}
              </p>
              {!notification.read && (
                <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1.5" />
              )}
            </div>
            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{notification.message}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTime(notification.created_at)}
              </span>
              {notification.type && (
                <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                  {notificationService.getNotificationTypeLabel(notification.type)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 ml-13 flex-wrap">
          {/* Mark as read */}
          {!notification.read && (
            <button
              onClick={() => handleMarkAsRead(notification.id)}
              className="text-xs text-slate-500 hover:text-emerald-600 flex items-center gap-1 transition-colors"
              title="Mark as read"
            >
              <Check className="w-3 h-3" />
              Mark as read
            </button>
          )}
          {/* Archive / Restore */}
          {notification.archived ? (
            <button
              onClick={() => handleRestore(notification.id)}
              className="text-xs text-slate-500 hover:text-amber-600 flex items-center gap-1 transition-colors"
              title="Restore from archive"
            >
              <ArchiveRestore className="w-3 h-3" />
              Restore
            </button>
          ) : (
            <button
              onClick={() => handleArchive(notification.id)}
              className="text-xs text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
              title="Archive"
            >
              <Archive className="w-3 h-3" />
              Archive
            </button>
          )}
          {/* Delete */}
          <button
            onClick={() => handleDelete(notification.id)}
            className="text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      </div>
    );
  };

  const filterOptions = useMemo(() => [
    { value: null as FilterValue, label: 'All Types' },
    ...availableTypes.map(t => ({ value: t as FilterValue, label: notificationService.getNotificationTypeLabel(t) })),
  ], [availableTypes]);

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={() => user && setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        disabled={!user}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Panel - only render if user is authenticated */}
      {user && isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="fixed md:absolute top-16 md:top-12 left-1/2 md:left-auto -translate-x-1/2 md:-translate-x-0 md:right-0 w-[calc(100vw-2rem)] sm:w-[90vw] md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 z-50 max-h-[85vh] flex flex-col animate-in slide-in-from-top-2 fade-in duration-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-slate-900">Notifications</h3>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { setActiveTab(tab.id); setFilterType(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                      activeTab === tab.id
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.id === 'unread' && unreadCount > 0 && (
                      <span className="w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center ml-0.5">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Actions Row */}
              <div className="flex items-center justify-between mt-3">
                {/* Category Filter (non-archived tabs) */}
                {activeTab !== 'archived' && availableTypes.length > 0 && (
                  <div className="relative" ref={filterRef}>
                    <button
                      onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                      className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg transition-colors"
                    >
                      <Filter className="w-3 h-3" />
                      {filterType ? notificationService.getNotificationTypeLabel(filterType) : 'All Types'}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showFilterDropdown && (
                      <div className="absolute left-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-slate-100 z-10 min-w-[160px] py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                        {filterOptions.map(opt => (
                          <button
                            key={opt.label}
                            onClick={() => {
                              setFilterType(opt.value);
                              setShowFilterDropdown(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors ${
                              filterType === opt.value ? 'text-blue-600 font-medium' : 'text-slate-600'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  {/* Archive All Read (for 'all' and 'unread' tabs) */}
                  {activeTab !== 'archived' && unreadCount > 0 && (
                    <>
                      <button
                        onClick={handleArchiveAllRead}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
                        title="Archive all read notifications"
                      >
                        <ArchiveX className="w-3 h-3" />
                        Archive read
                      </button>
                      <button
                        onClick={handleMarkAllAsRead}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        Mark all read
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Notifications List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-slate-400 animate-spin" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-12 text-center">
                  {activeTab === 'archived' ? (
                    <>
                      <Archive className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No archived notifications</p>
                      <p className="text-xs text-slate-400 mt-1">Archived notifications will appear here</p>
                    </>
                  ) : activeTab === 'unread' ? (
                    <>
                      <BellOff className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">All caught up!</p>
                      <p className="text-xs text-slate-400 mt-1">No unread notifications</p>
                    </>
                  ) : (
                    <>
                      <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500 font-medium">No notifications yet</p>
                      <p className="text-xs text-slate-400 mt-1">When you get notifications, they'll appear here</p>
                    </>
                  )}
                </div>
              ) : activeTab === 'archived' ? (
                <div className="divide-y divide-slate-100">
                  {notifications.map(notification => renderNotificationItem(notification))}
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {renderGrouped() || notifications.map(notification => renderNotificationItem(notification))}
                </div>
              )}
            </div>

            {/* Footer - Push notification permission */}
            {'Notification' in window && Notification.permission === 'default' && (
              <div className="p-3 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/50">
                <button
                  onClick={handleRequestPushPermission}
                  className="w-full flex items-center justify-center gap-2 text-xs text-slate-600 hover:text-blue-600 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Enable push notifications for real-time alerts
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}