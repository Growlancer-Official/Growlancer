import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Archive,
  ArchiveRestore,
  ArchiveX,
  Bell,
  BellOff,
  BellRing,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Filter,
  Inbox,
  Loader2,
  Smartphone,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { notificationService, type NotificationWithMeta } from '../../lib/notifications';
import { safeFormatDate } from '../../utils/date';
import { InfoTip } from '../../components/InfoTip';
import { useToast } from '../../components/Toast';

type TabId = 'all' | 'unread' | 'archived';
type FilterValue = string | null;

const TABS: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'all', label: 'All', icon: Inbox },
  { id: 'unread', label: 'Unread', icon: Bell },
  { id: 'archived', label: 'Archived', icon: Archive },
];

/**
 * Notifications Center — full-page replacement for the old Inbox.
 * All messages live inside contract workspaces, so a separate inbox page
 * was redundant. This gives users a dedicated, real-time notification hub
 * with read/archive/delete controls, type filters and push setup.
 */
export function NotificationsCenterPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [filterType, setFilterType] = useState<FilterValue>(null);
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [notifications, setNotifications] = useState<NotificationWithMeta[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [animateItem, setAnimateItem] = useState<string | null>(null);
  const [copiedRef, setCopiedRef] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  const availableTypes = useMemo(() => {
    const types = new Set<string>();
    notifications.forEach(n => n.type && types.add(n.type));
    return Array.from(types).sort();
  }, [notifications]);

  const fetchNotifications = useCallback(async (tab: TabId) => {
    if (!user) return;
    setLoading(true);
    try {
      if (tab === 'archived') {
        const data = await notificationService.getArchived(user.id, { limit: 100 });
        setNotifications(data.notifications);
      } else {
        const data = await notificationService.getByUser(user.id, {
          limit: 100,
          unreadOnly: tab === 'unread',
          type: filterType || undefined,
          forceRefetch: true,
        });
        setNotifications(data.notifications);
        setUnreadCount(data.unread_count);
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      toast.error('Error', 'Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  }, [user, filterType, toast]);

  useEffect(() => {
    fetchNotifications(activeTab);
  }, [activeTab, filterType, fetchNotifications]);

  // Real-time subscription
  useEffect(() => {
    if (!user) return;

    let channel: { unsubscribe?: () => void } | null = null;
    try {
      channel = notificationService.subscribe(
        user.id,
        (notification) => {
          if (!notification.id) return;
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
        },
        (deletedId) => {
          setNotifications(prev => prev.filter(n => n.id !== deletedId));
        },
      );
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
    }

    return () => {
      if (channel?.unsubscribe) {
        try { channel.unsubscribe(); } catch { /* ignore */ }
      }
    };
  }, [user, activeTab]);

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
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    }
  };

  const handleMarkAllAsRead = async () => {
    if (!user) return;
    const ok = await notificationService.markAllAsRead(user.id);
    if (ok) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
      toast.success('Done', 'All notifications marked as read.');
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
        setNotifications(prev => prev.filter(n => !n.read));
      } else {
        fetchNotifications(activeTab);
      }
      setUnreadCount(0);
      toast.success('Done', 'Read notifications archived.');
    }
  };

  const handleRequestPushPermission = async () => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      toast.success('Push enabled', 'Browser notifications are already enabled.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      toast.success('Push enabled', 'You will now get real-time alerts.');
    } else {
      toast.error('Push disabled', 'Enable notifications in your browser settings to get alerts.');
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return safeFormatDate(dateString, { month: 'short', day: 'numeric', year: 'numeric' }) || '—';
  };

  const groupedNotifications = useMemo(() => {
    if (notifications.length === 0) return null;
    return notificationService.groupNotificationsByDate(notifications);
  }, [notifications]);

  const renderNotificationItem = (notification: NotificationWithMeta) => {
    const isAnimatingOut = animateItem === notification.id;

    return (
      <div
        key={notification.id}
        className={`p-5 hover:bg-slate-50/80 transition-all duration-200 ${
          !notification.read ? 'bg-blue-50/40' : ''
        } ${isAnimatingOut ? 'opacity-0 -translate-y-2 scale-95' : 'opacity-100 translate-y-0 scale-100'}`}
      >
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg flex-shrink-0 ${notificationService.getNotificationColor(notification.type)}`}>
            {notificationService.getNotificationIcon(notification.type)}
          </div>
          <div className="flex-1 min-w-0 break-words">
            <div className="flex items-start justify-between gap-1.5">
              <p className={`text-sm ${notification.read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>
                {notification.title}
              </p>
              {!notification.read && (
                <span className="w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
              )}
            </div>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{notification.message}</p>
            <div className="flex items-center gap-1.5 mt-2.5">
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {formatTime(notification.created_at)}
              </span>
              {notification.type && (
                <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  {notificationService.getNotificationTypeLabel(notification.type)}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-xs text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full font-mono">
                Ref: {notification.id.slice(0, 8).toUpperCase()}
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(notification.id);
                    setCopiedRef(notification.id);
                    setTimeout(() => setCopiedRef(prev => prev === notification.id ? null : prev), 1500);
                  }}
                  className="text-slate-400 hover:text-emerald-600 transition-colors"
                  title="Copy reference ID — use this when contacting support"
                >
                  {copiedRef === notification.id ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1.5 flex items-center gap-1">
              <span className="w-1 h-1 bg-slate-300 rounded-full" />
              Keep this reference ID — quote it when contacting support for faster help
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-3 ml-14 flex-wrap">
          {!notification.read && (
            <button
              onClick={() => handleMarkAsRead(notification.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-emerald-600 px-2.5 py-1.5 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <Check className="w-4 h-4" />
              Mark as read
            </button>
          )}
          {notification.archived ? (
            <button
              onClick={() => handleRestore(notification.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-amber-600 px-2.5 py-1.5 rounded-lg hover:bg-amber-50 transition-colors"
            >
              <ArchiveRestore className="w-4 h-4" />
              Restore
            </button>
          ) : (
            <button
              onClick={() => handleArchive(notification.id)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg hover:bg-indigo-50 transition-colors"
            >
              <Archive className="w-4 h-4" />
              Archive
            </button>
          )}
          <button
            onClick={() => handleDelete(notification.id)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>
      </div>
    );
  };

  const renderGrouped = () => {
    if (!groupedNotifications) return null;

    const sections: { label: string; items: NotificationWithMeta[] }[] = [];
    if (groupedNotifications.today.length > 0) sections.push({ label: 'Today', items: groupedNotifications.today });
    if (groupedNotifications.thisWeek.length > 0) sections.push({ label: 'This Week', items: groupedNotifications.thisWeek });
    if (groupedNotifications.earlier.length > 0) sections.push({ label: 'Earlier', items: groupedNotifications.earlier });

    if (sections.length === 0) return null;

    return sections.map(section => (
      <div key={section.label}>
        <div className="px-2.5 py-2.5 bg-slate-50 border-b border-slate-100">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {section.label}
          </span>
        </div>
        {section.items.map(item => renderNotificationItem(item))}
      </div>
    ));
  };

  const filterOptions = useMemo(() => [
    { value: null as FilterValue, label: 'All Types' },
    ...availableTypes.map(t => ({ value: t as FilterValue, label: notificationService.getNotificationTypeLabel(t) })),
  ], [availableTypes]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <BellRing className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900 flex items-center gap-1.5">Notifications <InfoTip text="All your alerts in one place — contracts, payments, messages." /></h1>
            <p className="text-sm text-slate-500">
              {unreadCount > 0
                ? `You have ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
                : 'You are all caught up'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeTab !== 'archived' && unreadCount > 0 && (
            <button
              onClick={handleArchiveAllRead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors"
            >
              <ArchiveX className="w-4 h-4" />
              Archive read
            </button>
          )}
          {activeTab !== 'archived' && unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
            >
              <Check className="w-4 h-4" />
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Notifications guide — plain-language */}
      <InfoTip title="Stay on top of everything" text="Payment, escrow, contract, message and review updates arrive here in real time. Every notification has a reference ID — copy it and quote it when contacting support for faster help. Use Archive to tidy up, and enable push notifications below for instant alerts on this device." />

      {/* Tabs + Filter */}
      <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center gap-1.5">
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setFilterType(null); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {tab.id === 'unread' && unreadCount > 0 && (
                  <span className="w-4 h-4 bg-blue-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab !== 'archived' && availableTypes.length > 0 && (
            <div className="relative sm:ml-auto" ref={filterRef}>
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2 rounded-xl transition-colors"
              >
                <Filter className="w-4 h-4" />
                {filterType ? notificationService.getNotificationTypeLabel(filterType) : 'All Types'}
                <ChevronDown className="w-4 h-4" />
              </button>
              {showFilterDropdown && (
                <div className="absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-100 z-10 min-w-[180px] py-1.5 animate-in fade-in slide-in-from-top-1 duration-150 max-h-72 overflow-y-auto">
                  {filterOptions.map(opt => (
                    <button
                      key={opt.label}
                      onClick={() => {
                        setFilterType(opt.value);
                        setShowFilterDropdown(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-50 transition-colors ${
                        filterType === opt.value ? 'text-emerald-600 font-semibold' : 'text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* List */}
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-7 h-7 text-slate-300 animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-20 text-center">
              {activeTab === 'archived' ? (
                <>
                  <Archive className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">No archived notifications</p>
                  <p className="text-xs text-slate-400 mt-1">Archived notifications will appear here</p>
                </>
              ) : activeTab === 'unread' ? (
                <>
                  <BellOff className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">All caught up!</p>
                  <p className="text-xs text-slate-400 mt-1">No unread notifications right now</p>
                </>
              ) : (
                <>
                  <Bell className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-slate-500 font-semibold">No notifications yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Payment, escrow, contract and message updates will show up here in real time
                  </p>
                </>
              )}
            </div>
          ) : activeTab === 'archived' ? (
            notifications.map(item => renderNotificationItem(item))
          ) : (
            renderGrouped() || notifications.map(item => renderNotificationItem(item))
          )}
        </div>

        {/* Push footer */}
        {'Notification' in window && Notification.permission === 'default' && (
          <div className="p-4 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-blue-50/60">
            <button
              onClick={handleRequestPushPermission}
              className="w-full flex items-center justify-center gap-3 text-xs font-medium text-slate-600 hover:text-blue-600 py-2 rounded-xl hover:bg-blue-50 transition-colors"
            >
              <Smartphone className="w-4 h-4" />
              Enable push notifications for real-time alerts
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
