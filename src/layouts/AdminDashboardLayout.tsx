import { Suspense, useState, useEffect, useRef } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  Handshake,
  Banknote,
  AlertOctagon,
  Zap,
  BarChart3,
  ChevronDown,
  ShieldCheck,
  ExternalLink,
  Search,
  Award,
} from 'lucide-react';
import { AdminDashboardFallback } from '../components/LoadingSkeleton';
import { NotificationsPanel } from '../components/NotificationsPanel';
import { subscribeAdmin, adminLogout } from '../components/AdminAuthGuard';

const sidebarLinks = [
  { id: 'overview', path: '/admin', icon: LayoutDashboard, label: 'Overview' },
  { id: 'users', path: '/admin/users', icon: Users, label: 'Users' },
  { id: 'projects', path: '/admin/projects', icon: FolderKanban, label: 'Projects' },
  { id: 'contracts', path: '/admin/contracts', icon: Handshake, label: 'Contracts' },
  { id: 'payments', path: '/admin/payments', icon: Banknote, label: 'Payments' },
  { id: 'disputes', path: '/admin/disputes', icon: AlertOctagon, label: 'Disputes' },
  { id: 'subscriptions', path: '/admin/subscriptions', icon: Zap, label: 'Subscriptions' },
  { id: 'reports', path: '/admin/reports', icon: BarChart3, label: 'Reports' },
  { id: 'internships', path: '/admin/internships', icon: Users, label: 'Internships' },
  { id: 'certificates', path: '/admin/certificates', icon: Award, label: 'Certificates' },
  { id: 'identity-verification', path: '/admin/identity-verification', icon: ShieldCheck, label: 'Verification' },
  { id: 'support-tickets', path: '/admin/support-tickets', icon: AlertOctagon, label: 'Support Tickets' },
];

export function AdminDashboardLayout() {
  const location = useLocation();
  const currentPath = location.pathname;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ label: string; path: string; icon: React.ReactNode }[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Get admin session info from global state (real-time via Supabase Auth)
  const [adminName, setAdminName] = useState('Admin');
  const [adminEmail, setAdminEmail] = useState('');

  useEffect(() => {
    const unsub = subscribeAdmin((admin) => {
      setAdminName(admin?.label || 'Admin');
      setAdminEmail(admin?.email || '');
    });
    return unsub;
  }, []);

  // Search functionality
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }
    const q = query.toLowerCase();
    const results = sidebarLinks.filter(link =>
      link.label.toLowerCase().includes(q) || link.id.toLowerCase().includes(q)
    ).map(link => ({
      label: link.label,
      path: link.path,
      icon: <link.icon className="w-4 h-4" />,
    }));
    setSearchResults(results);
    setShowSearchResults(results.length > 0);
  };

  // Close search on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: Ctrl+K to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const input = document.querySelector('#admin-search') as HTMLInputElement;
        input?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const isActive = (path: string) => {
    if (path === '/admin' && currentPath === '/admin') return true;
    if (path !== '/admin' && currentPath.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="flex min-h-screen bg-[#0F172A] text-slate-100">
      {/* Sidebar */}
      <aside
        className="w-72 sticky top-0 h-screen hidden lg:flex flex-col p-6 z-50"
        style={{
          background: 'rgba(30, 41, 59, 0.7)',
          backdropFilter: 'blur(16px)',
          borderRight: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        {/* Logo */}
        <Link to="/" className="flex items-center gap-3 mb-10 px-2">
          <img 
            src="/Growlancer Logo (2).png" 
            alt="Growlancer" 
            className="h-10 w-10 rounded-xl shadow-lg"
          />
          <div>
            <h1 className="font-display text-lg font-bold leading-none text-white">Growlancer</h1>
            <span className="text-[10px] uppercase tracking-widest text-emerald-100 font-bold">Admin Panel</span>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="flex-1 space-y-1">
          {sidebarLinks.map((link) => (
            <Link
              key={link.id}
              to={link.path}
              className={`flex items-center justify-between px-4 py-3 rounded-lg transition-all ${
                isActive(link.path)
                  ? 'bg-emerald-500/10 text-emerald-500'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
              style={isActive(link.path) ? { borderLeft: '3px solid #10B981' } : {}}
            >
              <div className="flex items-center gap-3">
                <link.icon className="w-5 h-5" />
                <span className="font-medium text-sm">{link.label}</span>
              </div>
            </Link>
          ))}
        </nav>

        {/* System Status Card */}
        <div className="mt-auto">
          <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">System Secure</span>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Platform monitoring active. All systems operational.
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-20 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 border-b border-white/5 px-8 flex items-center justify-between">
          {/* Search */}
          <div className="flex items-center gap-4 w-1/2">
            <div ref={searchRef} className="relative w-full max-w-lg">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
              <input
                id="admin-search"
                type="text"
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                onFocus={() => { if (searchResults.length > 0) setShowSearchResults(true); }}
                placeholder="Search sections... (Ctrl+K)"
                className="w-full pl-11 pr-4 py-2.5 bg-slate-800/50 rounded-xl border border-white/5 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-sm text-slate-300"
              />
              {/* Search Results Dropdown */}
              {showSearchResults && searchResults.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-slate-800 rounded-xl border border-white/10 shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                  {searchResults.map((result, i) => (
                    <button
                      key={i}
                      onClick={() => { navigate(result.path); setShowSearchResults(false); setSearchQuery(''); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      {result.icon}
                      <span>{result.label}</span>
                      <ExternalLink className="w-3 h-3 ml-auto text-slate-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-6">
            {/* Live Monitoring Badge */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/5 rounded-full border border-emerald-500/10">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Live Monitoring</span>
            </div>

            {/* Notifications Panel - Real-time with Supabase */}
            <NotificationsPanel />

            <div className="h-8 w-px bg-white/5"></div>

            {/* User Menu */}
            <button className="flex items-center gap-3 pl-1 pr-3 py-1 hover:bg-white/5 rounded-full transition-all group">
              <div className="h-9 w-9 rounded-full overflow-hidden border-2 border-emerald-500/20 group-hover:border-emerald-500 transition-all">
                <div className="w-full h-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                  {adminName.charAt(0).toUpperCase()}
                </div>
              </div>
              <div className="text-left hidden md:block">
                <p className="text-sm font-bold leading-tight">{adminName}</p>
                <p className="text-[10px] text-emerald-500 font-bold tracking-wide uppercase">Administrator</p>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-500" />
            </button>
            {/* Logout button - visible on hover */}
            <button
              onClick={() => void adminLogout()}
              className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
              title="Logout from Admin"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
          <Suspense fallback={<AdminDashboardFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>

      {/* Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-white/5 h-16 lg:hidden flex items-center justify-around px-4 z-50 shadow-[0_-4px_12px_rgba(0,0,0,0.5)]">
        <Link to="/admin" className={`flex flex-col items-center gap-1 ${isActive('/admin') && !isActive('/admin/users') ? 'text-emerald-500' : 'text-slate-400'}`}>
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase">Dash</span>
        </Link>
        <Link to="/admin/users" className={`flex flex-col items-center gap-1 ${isActive('/admin/users') ? 'text-emerald-500' : 'text-slate-400'}`}>
          <Users className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase">Users</span>
        </Link>
        <Link to="/admin/disputes" className={`flex flex-col items-center gap-1 ${isActive('/admin/disputes') ? 'text-emerald-500' : 'text-slate-400'}`}>
          <AlertOctagon className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase">Disputes</span>
        </Link>
        <Link to="/admin/subscriptions" className={`flex flex-col items-center gap-1 ${isActive('/admin/subscriptions') ? 'text-emerald-500' : 'text-slate-400'}`}>
          <Zap className="w-5 h-5" />
          <span className="text-[9px] font-bold uppercase">Config</span>
        </Link>
      </nav>
    </div>
  );
}
