import { Suspense } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import {
  LayoutGrid,
  PlusCircle,
  FolderKanban,
  Sparkles,
  MailCheck,
  FileText,
  Handshake,
  CreditCard,
  Settings,
  Search,
  User,
  Users2,
  LogOut,
  Home,
  Bot,
  Crown,
  Laptop,
  Shield,
  Menu,
  X,
  MessageSquare,
  Star,
  Trophy,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase, realtimeChannels } from '../lib/supabase';
import { ClientDashboardFallback } from '../components/LoadingSkeleton';
import { messagesService } from '../lib/messages';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { NotificationToastBridge } from '../components/NotificationToastBridge';

// ─── Sidebar Link Groups with Section Headers ───────────────────────────
interface SidebarLink {
  id: string;
  path: string;
  icon: LucideIcon;
  label: string;
}

interface SidebarGroup {
  label: string;
  links: SidebarLink[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    label: 'HIRE',
    links: [
      { id: 'overview', path: '/client', icon: LayoutGrid, label: 'Overview' },
      { id: 'matches', path: '/client/matches', icon: Sparkles, label: 'AI Matches' },
      { id: 'invites', path: '/client/invites', icon: MailCheck, label: 'Invites' },
      { id: 'proposals', path: '/client/proposals', icon: FileText, label: 'Proposals' },
      { id: 'contracts', path: '/client/contracts', icon: Handshake, label: 'Contracts' },
      { id: 'workspace', path: '/client/workspace', icon: Laptop, label: 'Workspace' },
    ],
  },
  {
    label: 'PROJECTS',
    links: [
      { id: 'projects', path: '/client/projects', icon: FolderKanban, label: 'My Projects' },
      { id: 'contests', path: '/client/contests', icon: Trophy, label: 'Contests' },
    ],
  },
  {
    label: 'COMMUNICATION',
    links: [
      { id: 'inbox', path: '/client/inbox', icon: MessageSquare, label: 'Inbox' },
      { id: 'ai-assistant', path: '/client/ai-assistant', icon: Bot, label: 'AI Assistant' },
    ],
  },
  {
    label: 'GROWTH',
    links: [
      { id: 'referrals', path: '/client/referrals', icon: Users2, label: 'Refer & Hire' },
    ],
  },
];

const accountLinks: SidebarLink[] = [
  { id: 'find-talent', path: '/client/find-talent', icon: Search, label: 'Find Talent' },
  { id: 'reviews', path: '/client/reviews', icon: Star, label: 'Reviews' },
  { id: 'payments', path: '/client/payments', icon: CreditCard, label: 'Payments' },
  { id: 'settings', path: '/client/settings', icon: Settings, label: 'Settings' },
  { id: 'verification', path: '/client/verification', icon: Shield, label: 'Verification' },
  { id: 'ai-subscription', path: '/client/ai-subscription', icon: Crown, label: 'AI Subscription' },
  { id: 'tickets', path: '/client/tickets', icon: Bot, label: 'AI Support' },
];

export function ClientDashboardLayout() {
  const location = useLocation();
  const { logout, user } = useAuth();
  const currentPath = location.pathname;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [badgeCounts, setBadgeCounts] = useState({
    invites: 0,
    proposals: 0,
    contracts: 0,
  });

  const safeUnsubscribe = (channel: { unsubscribe?: () => void } | null | undefined) => {
    if (channel?.unsubscribe) {
      try {
        channel.unsubscribe();
      } catch {
        // Unsubscribe failed silently
      }
    }
  };

  const isActive = (path: string) => {
    if (path === '/client' && currentPath === '/client') return true;
    if (path !== '/client' && (currentPath === path || currentPath.startsWith(path + '/'))) return true;
    return false;
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    // Fetch unread message count
    const fetchUnreadCount = async () => {
      try {
        const count = await messagesService.getUnreadCount(user.id);
        setUnreadMessages(count);
      } catch {
        // Unread count fetch failed silently
      }
    };

    const fetchBadgeCounts = async () => {
      try {
        // Find client's projects to get proposals
        const { data: projects } = await supabase.from('projects').select('id').eq('client_id', user.id);
        const projectIds = projects?.map(p => p.id) || [];

        const proposalsPromise = projectIds.length > 0 
          ? supabase.from('proposals').select('id', { count: 'exact' }).in('project_id', projectIds).eq('status', 'pending')
          : Promise.resolve({ count: 0 });

        const [invitesRes, proposalsRes, contractsRes] = await Promise.all([
          supabase.from('invites').select('id', { count: 'exact' }).eq('client_id', user.id).eq('status', 'pending'),
          proposalsPromise,
          supabase.from('contracts').select('id', { count: 'exact' }).eq('client_id', user.id).in('status', ['active', 'pending']),
        ]);

        setBadgeCounts({
          invites: invitesRes.count || 0,
          proposals: proposalsRes.count || 0,
          contracts: contractsRes.count || 0,
        });
      } catch {
        // Badge count fetch failed silently
      }
    };

    fetchUnreadCount();
    fetchBadgeCounts();

    // Subscribe to new messages for real-time inbox badge updates
    const messagesSub = messagesService.subscribeToMessages(user.id, () => {
      fetchUnreadCount();
    });

    // Set up real-time subscriptions for profile changes
    const profilesChannel = realtimeChannels.profiles('client-layout-profile')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (payload.new.avatar !== payload.old.avatar ||
              payload.new.name !== payload.old.name ||
              payload.new.rating !== payload.old.rating ||
              payload.new.total_reviews !== payload.old.total_reviews) {
            // Profile changed — could update UI here if needed
          }
        }
      )
      .subscribe();

    const invitesChannel = realtimeChannels.invites('client-layout-invites')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invites',
        filter: `client_id=eq.${user.id}`,
      }, () => fetchBadgeCounts())
      .subscribe();

    const proposalsChannel = realtimeChannels.proposals('client-layout-proposals')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'proposals',
      }, () => fetchBadgeCounts())
      .subscribe();

    const contractsChannel = realtimeChannels.contracts('client-layout-contracts')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'contracts',
        filter: `client_id=eq.${user.id}`,
      }, () => fetchBadgeCounts())
      .subscribe();

    return () => {
      safeUnsubscribe(messagesSub);
      safeUnsubscribe(profilesChannel);
      safeUnsubscribe(invitesChannel);
      safeUnsubscribe(proposalsChannel);
      safeUnsubscribe(contractsChannel);
    };
  }, [user]);


  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {/* Mobile Drawer Overlay */}
      <div
        className={`fixed inset-0 bg-slate-900/40 z-40 transition-opacity duration-200 lg:hidden ${mobileNavOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileNavOpen(false)}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 max-w-[85vw] bg-white shadow-2xl border-r border-slate-200 p-6 transform transition-transform duration-300 ease-out lg:hidden ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/UpdatedLogo.webp"
              alt="Growlancer"
              className="h-10 w-10 rounded-xl shadow-lg"
            />
            <div>
              <h1 className="font-display text-lg font-bold leading-none">Growlancer</h1>
              <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Client Dashboard</span>
            </div>
          </Link>
          <button
            onClick={() => setMobileNavOpen(false)}
            className="inline-flex items-center justify-center h-10 w-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <nav className="space-y-1">
            {sidebarGroups.map((group) => (
              <div key={group.label} className="mb-2">
                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {group.label}
                </div>
                {group.links.map((link) => {
                  const getBadgeCount = () => {
                    switch (link.id) {
                      case 'inbox':
                        return unreadMessages > 0 ? unreadMessages : null;
                      case 'invites':
                        return badgeCounts.invites > 0 ? badgeCounts.invites : null;
                      case 'proposals':
                        return badgeCounts.proposals > 0 ? badgeCounts.proposals : null;
                      case 'contracts':
                        return badgeCounts.contracts > 0 ? badgeCounts.contracts : null;
                      default:
                        return null;
                    }
                  };
                  
                  const badgeCount = getBadgeCount();
                  
                  return (
                    <Link
                      key={link.id}
                      to={link.path}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                        isActive(link.path)
                          ? 'bg-slate-100 text-emerald-600 shadow-sm border border-emerald-100'
                          : 'text-slate-700 hover:bg-slate-50 hover:text-emerald-600'
                      }`}
                    >
                      <link.icon className="w-5 h-5" />
                      <span className="font-medium">{link.label}</span>
                      {badgeCount && (
                        <span className={`ml-auto text-white text-[10px] min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center font-bold ${
                          link.id === 'inbox' ? 'bg-blue-500' : 'bg-orange-500'
                        }`}>
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            ))}

            <Link
              to="/client/post"
              onClick={() => setMobileNavOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 mt-2 ${
                isActive('/client/post')
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100'
              }`}
            >
              <PlusCircle className="w-5 h-5" />
              <span className="font-bold">Post a Project</span>
            </Link>

            <div className="mb-2">
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                ACCOUNT
              </div>
              {accountLinks.map((link) => (
                <Link
                  key={link.id}
                  to={link.path}
                  onClick={() => setMobileNavOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    isActive(link.path)
                      ? 'bg-slate-100 text-emerald-600 shadow-sm border border-emerald-100'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-emerald-600'
                  }`}
                >
                  <link.icon className="w-5 h-5" />
                  <span className="font-medium">{link.label}</span>
                </Link>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-200 space-y-2">
              <Link
                to="/"
                onClick={() => setMobileNavOpen(false)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-700 hover:bg-slate-50 hover:text-emerald-600 transition-all duration-200"
              >
                <Home className="w-5 h-5" />
                <span className="font-medium">Homepage</span>
              </Link>
              <button
                onClick={() => {
                  logout();
                  setMobileNavOpen(false);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </nav>
        </div>
      </div>
      </aside>

      {/* Desktop Sidebar */}
      <aside className="w-72 sticky top-0 h-screen hidden lg:flex flex-col p-6 z-50 overflow-y-auto bg-white border-r border-slate-200">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 mb-6 px-2">
          <img 
            src="/UpdatedLogo.webp" 
            alt="Growlancer" 
            className="h-10 w-10 rounded-xl shadow-lg"
          />
          <div>
            <h1 className="font-display text-lg font-bold leading-none">Growlancer</h1>
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Client Dashboard</span>
          </div>
        </Link>

        
        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          {sidebarGroups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {group.label}
              </div>
              {group.links.map((link) => {
                const getBadgeCount = () => {
                  switch (link.id) {
                    case 'inbox':
                      return unreadMessages > 0 ? unreadMessages : null;
                    case 'invites':
                      return badgeCounts.invites > 0 ? badgeCounts.invites : null;
                    case 'proposals':
                      return badgeCounts.proposals > 0 ? badgeCounts.proposals : null;
                    case 'contracts':
                      return badgeCounts.contracts > 0 ? badgeCounts.contracts : null;
                    default:
                      return null;
                  }
                };
                
                const badgeCount = getBadgeCount();
                
                return (
                  <Link
                    key={link.id}
                    to={link.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive(link.path)
                        ? 'bg-white text-emerald-600 shadow-md border border-emerald-100'
                        : 'text-slate-500 hover:bg-white hover:text-emerald-600'
                    }`}
                  >
                    <link.icon className="w-5 h-5" />
                    <span className="font-medium">{link.label}</span>
                    {badgeCount && (
                      <span className={`ml-auto text-white text-[10px] min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center font-bold ${
                        link.id === 'inbox' ? 'bg-blue-500' : 'bg-orange-500'
                      }`}>
                        {badgeCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Post Project CTA */}
          <Link
            to="/client/post"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 mt-2 ${
              isActive('/client/post')
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-orange-50 text-orange-600 border border-orange-100 hover:bg-orange-100'
            }`}
          >
            <PlusCircle className="w-5 h-5" />
            <span className="font-bold">Post a Project</span>
          </Link>

          <div className="mb-2">
            <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              ACCOUNT
            </div>
            {accountLinks.map((link) => (
              <Link
                key={link.id}
                to={link.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive(link.path)
                    ? 'bg-white text-emerald-600 shadow-md border border-emerald-100'
                    : 'text-slate-500 hover:bg-white hover:text-emerald-600'
                }`}
              >
                <link.icon className="w-5 h-5" />
                <span className="font-medium">{link.label}</span>
              </Link>
            ))}
          </div>
        </nav>


        {/* Logout & Home */}
        <div className="mt-4 pt-4 border-t border-slate-200 space-y-1">
          <Link
            to="/"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-white hover:text-emerald-600 transition-all duration-200"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium">Homepage</span>
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">          {/* Top Bar */}
        <header className="min-h-16 sm:h-20 bg-white sticky top-0 z-40 border-b border-slate-100 px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-2 sm:gap-4">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <button
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden inline-flex items-center justify-center h-9 w-9 sm:h-10 sm:w-10 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all shrink-0"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="hidden sm:flex items-center gap-4 flex-1 min-w-0">
              <div className="relative w-full max-w-xs md:max-w-sm group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full pl-9 sm:pl-11 pr-3 sm:pr-4 py-2 sm:py-2.5 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm"
                />
              </div>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-1 sm:gap-2 md:gap-4 shrink-0">
            {/* AI Match Engine Badge - hidden on mobile, shown on md+ */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">
                AI Active
              </span>
            </div>

            {/* Notifications */}
            <NotificationsPanel />

            <div className="hidden sm:block h-8 w-px bg-slate-200"></div>

            {/* User Menu */}
            <button className="flex items-center gap-1 sm:gap-3 pl-1 pr-1 sm:pr-3 py-1 hover:bg-slate-50 rounded-full transition-all group">
              {user?.avatar ? (
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full overflow-hidden border-2 border-emerald-500/20 group-hover:border-emerald-500 transition-all">
                  <img
                    src={user.avatar}
                    alt={user.name || 'Client'}
                    className="w-full h-full object-cover object-top"
                    style={{
                      objectPosition: 'center 20%',
                      filter: 'brightness(1.05) contrast(1.02)'
                    }}
                  />
                </div>
              ) : (
                <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-slate-100 flex items-center justify-center border-2 border-emerald-500/20">
                  <User className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />
                </div>
              )}
              <div className="text-left hidden lg:block">
                <p className="text-sm font-bold leading-tight truncate max-w-[120px]">{user?.name || 'Client'}</p>
              </div>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-8 max-w-7xl mx-auto w-full pb-24 sm:pb-16">
          <Suspense fallback={<ClientDashboardFallback />}>
            <Outlet />
          </Suspense>
        </div>
        <NotificationToastBridge />
      </main>

    </div>
  );
}
