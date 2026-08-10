import { useState, useEffect, useCallback } from 'react';
import {
  Globe,
  Loader2,
  Mail,
  MapPin,
  RefreshCw,
  Search,
  User,
  Users,
} from 'lucide-react';
import { adminQuery } from '../../lib/adminDataProxy';
import { realtimeChannels } from '../../lib/supabase';
import { useToast } from '../../components/Toast';

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  country: string | null;
  signup_source: string | null;
  created_at: string;
}

export function AdminWaitlistPage() {
  const toast = useToast();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [countryFilter, setCountryFilter] = useState('all');

  const fetchWaitlist = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminQuery<WaitlistEntry>({
        table: 'waitlist',
        order: 'created_at',
        orderDir: 'desc',
        limit: 500,
      });
      setEntries(data || []);
    } catch (err) {
      toast.error('Load Failed', err instanceof Error ? err.message : 'Failed to load waitlist');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void fetchWaitlist();
  }, [fetchWaitlist]);

  // Realtime — live updates when someone joins the waitlist
  useEffect(() => {
    const channel = realtimeChannels
      .waitlist(`admin-waitlist-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'waitlist' },
        () => void fetchWaitlist()
      )
      .subscribe();
    return () => { void channel.unsubscribe(); };
  }, [fetchWaitlist]);

  // Country breakdown
  const countryCounts = entries.reduce<Record<string, number>>((acc, e) => {
    const c = e.country || 'Unknown';
    acc[c] = (acc[c] || 0) + 1;
    return acc;
  }, {});
  const countriesSorted = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]);
  const totalCountries = countriesSorted.length;
  const totalEntries = entries.length;
  const topCountry = countriesSorted[0]?.[0] || '—';

  // Search + filter
  const filtered = entries.filter((e) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      e.email.toLowerCase().includes(q) ||
      (e.name || '').toLowerCase().includes(q) ||
      (e.country || '').toLowerCase().includes(q);
    const matchesCountry = countryFilter === 'all' || e.country === countryFilter;
    return matchesSearch && matchesCountry;
  });

  const maxCount = countriesSorted[0]?.[1] || 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Waitlist</h1>
          <p className="text-sm text-slate-400">
            Who's interested in Growlancer, from which country — live.
          </p>
        </div>
        <button
          onClick={() => void fetchWaitlist()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 border border-white/10 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/60 rounded-2xl p-5 border border-white/10 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white">{totalEntries}</p>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Total Signups</p>
        </div>
        <div className="bg-slate-800/60 rounded-2xl p-5 border border-white/10 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3">
            <Globe className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white">{totalCountries}</p>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Countries Reached</p>
        </div>
        <div className="bg-slate-800/60 rounded-2xl p-5 border border-white/10 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-3">
            <MapPin className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white truncate">{topCountry}</p>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Top Country</p>
        </div>
        <div className="bg-slate-800/60 rounded-2xl p-5 border border-white/10 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-3">
            <Mail className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold text-white">{countryFilter === 'all' ? totalEntries : countryCounts[countryFilter] || 0}</p>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Current View</p>
        </div>
      </div>

      {/* Country Breakdown */}
      <div className="bg-slate-800/60 rounded-2xl border border-white/10 shadow-sm p-6">
        <h2 className="font-bold text-white mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-emerald-400" />
          Interest by Country
        </h2>
        {countriesSorted.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No waitlist entries yet</p>
        ) : (
          <div className="space-y-3">
            {countriesSorted.slice(0, 15).map(([country, count]) => (
              <button
                key={country}
                onClick={() => setCountryFilter(countryFilter === country ? 'all' : country)}
                className={`w-full group transition-colors ${
                  countryFilter === country ? '' : 'hover:opacity-80'
                }`}
                title="Click to filter entries"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-300 flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {country}
                    {countryFilter === country && (
                      <span className="text-[10px] bg-emerald-100 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">Filtered</span>
                    )}
                  </span>
                  <span className="text-sm font-bold text-white">{count}</span>
                </div>
                <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.max(4, (count / maxCount) * 100)}%` }}
                  />
                </div>
              </button>
            ))}
            {countriesSorted.length > 15 && (
              <p className="text-xs text-slate-400 pt-2">
                + {countriesSorted.length - 15} more countries — use the country filter to explore
              </p>
            )}
          </div>
        )}
      </div>

      {/* Entries Table */}
      <div className="bg-slate-800/60 rounded-2xl border border-white/10 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or country..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-slate-800/50 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
          >
            <option value="all">All countries</option>
            {countriesSorted.map(([country]) => (
              <option key={country} value={country}>{country}</option>
            ))}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-800/50 text-xs font-bold uppercase tracking-widest text-slate-400">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Country</th>
                <th className="px-6 py-3">Source</th>
                <th className="px-6 py-3">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                    No waitlist entries found
                  </td>
                </tr>
              ) : (
                filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-3">
                      <span className="flex items-center gap-2 font-medium text-slate-100">
                        <span className="w-7 h-7 rounded-full bg-slate-700/50 flex items-center justify-center">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                        </span>
                        {e.name || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400">{e.email}</td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full">
                        <MapPin className="w-3 h-3" />
                        {e.country || '—'}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400 capitalize">{e.signup_source || '—'}</td>
                    <td className="px-6 py-3 text-slate-400">
                      {e.created_at ? new Date(e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}


