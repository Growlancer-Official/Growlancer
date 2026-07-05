import { useState, useEffect, useCallback } from 'react';
import {
  Briefcase,
  CheckCircle2,
  Clock,
  Loader2,
  Pause,
  Play,
  Timer,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../components/Toast';
import { supabase } from '../../lib/supabase';

interface TimeEntry {
  id: string;
  contract_id: string;
  freelancer_id: string;
  description: string;
  hours: number;
  start_time: string;
  end_time: string | null;
  status: 'running' | 'submitted' | 'approved' | 'rejected';
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
}

interface ContractSummary {
  id: string;
  title: string;
  status: string;
  amount: number;
  rate_type: string;
}

type ActiveTab = 'timer' | 'manual' | 'history';

/**
 * Hourly contract time tracking page
 * Freelancers log hours, clients approve/reject timesheets
 */
export function TimeTrackingPage() {
  const { user } = useAuth();
  const [contracts, setContracts] = useState<ContractSummary[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeContract, setActiveContract] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingStart, setTrackingStart] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [description, setDescription] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('timer');
  const [manualHours, setManualHours] = useState('');
  const [manualDate, setManualDate] = useState(new Date().toISOString().split('T')[0]);
  const toast = useToast();

  // Timer tick
  useEffect(() => {
    if (!isTracking || !trackingStart) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - trackingStart.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isTracking, trackingStart]);

  const fetchContracts = useCallback(async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('contracts')
      .select('id, status, amount, rate_type')
      .eq('freelancer_id', user.id)
      .in('status', ['active', 'in_progress']);

    if (!error && data) {
      const formatted = (data as any[]).map((c: any) => ({
        id: c.id,
        title: `#${c.id.slice(0, 8)}`,
        status: c.status,
        amount: Number(c.amount) || 0,
        rate_type: c.rate_type || 'hourly',
      }));
      setContracts(formatted);
      if (formatted.length > 0 && !activeContract) {
        setActiveContract(formatted[0].id);
      }
    }
  }, [user, activeContract]);

  const fetchTimeEntries = useCallback(async () => {
    if (!user || !activeContract) return;
    setLoading(true);

    const { data, error } = await supabase
      .from('time_entries')
      .select('*')
      .eq('freelancer_id', user.id)
      .eq('contract_id', activeContract)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setTimeEntries(data as unknown as TimeEntry[]);
    }
    setLoading(false);
  }, [user, activeContract]);

  useEffect(() => { fetchContracts(); }, [fetchContracts]);
  useEffect(() => { fetchTimeEntries(); }, [fetchTimeEntries]);

  // Real-time subscription for status changes (approval/rejection by client)
  useEffect(() => {
    if (!activeContract || !user) return;

    const channel = supabase
      .channel(`tracking-${activeContract}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_entries',
          filter: `contract_id=eq.${activeContract}`,
        },
        () => { void fetchTimeEntries(); }
      )
      .subscribe();

    return () => { void channel.unsubscribe(); };
  }, [activeContract, user, fetchTimeEntries]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const startTracking = () => {
    setTrackingStart(new Date());
    setIsTracking(true);
    setElapsed(0);
  };

  const stopTracking = async () => {
    if (!user || !activeContract || !trackingStart) return;
    setIsTracking(false);
    const hours = elapsed / 3600;
    if (hours < 0.01) return;

    await supabase.from('time_entries').insert({
      contract_id: activeContract,
      freelancer_id: user.id,
      description: description || 'Work session',
      hours: Math.round(hours * 100) / 100,
      start_time: trackingStart.toISOString(),
      end_time: new Date().toISOString(),
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    });

    setTrackingStart(null);
    setElapsed(0);
    setDescription('');
    void fetchTimeEntries();
  };

  const submitManualEntry = async () => {
    if (!user || !activeContract || !manualHours) return;
    const hours = parseFloat(manualHours);
    if (isNaN(hours) || hours <= 0) return;

    // Sanity validation
    if (hours > 24) {
      toast.error('A single time entry cannot exceed 24 hours.');
      return;
    }
    if (hours > 16) {
      const confirmed = window.confirm(`You entered ${hours} hours for one day. This is unusually high. Are you sure this is correct?`);
      if (!confirmed) return;
    }
    const selectedDate = new Date(manualDate);
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (selectedDate > today) {
      toast.error('Cannot log time entries for future dates.');
      return;
    }

    await supabase.from('time_entries').insert({
      contract_id: activeContract,
      freelancer_id: user.id,
      description: description || 'Manual time entry',
      hours,
      start_time: new Date(manualDate).toISOString(),
      end_time: new Date(new Date(manualDate).getTime() + hours * 3600000).toISOString(),
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    });

    setManualHours('');
    setDescription('');
    void fetchTimeEntries();
  };

  const totalHours = timeEntries.reduce((sum, e) => sum + e.hours, 0);
  const approvedHours = timeEntries.filter((e) => e.status === 'approved').reduce((sum, e) => sum + e.hours, 0);
  const pendingHours = timeEntries.filter((e) => e.status === 'submitted').reduce((sum, e) => sum + e.hours, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full font-medium flex items-center gap-1"><span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />Running</span>;
      case 'submitted': return <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium"><Clock className="w-3 h-3 inline mr-1" />Pending</span>;
      case 'approved': return <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full font-medium"><CheckCircle2 className="w-3 h-3 inline mr-1" />Approved</span>;
      case 'rejected': return <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">Rejected</span>;
      default: return null;
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Time Tracking</h1>
        <p className="text-slate-500 mt-1">Log hours on hourly contracts</p>
      </div>

      {/* Contract Selector */}
      {contracts.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {contracts.map((c) => (
            <button key={c.id} onClick={() => setActiveContract(c.id)} className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${activeContract === c.id ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              <Briefcase className="w-3.5 h-3.5 inline mr-1.5" />{c.title}
            </button>
          ))}
        </div>
      )}

      {contracts.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100">
          <Timer className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 mb-2">No hourly contracts</h3>
          <p className="text-slate-500">Time tracking is available for hourly contracts.</p>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{totalHours.toFixed(1)}h</p>
              <p className="text-xs text-slate-500">Total Hours</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{approvedHours.toFixed(1)}h</p>
              <p className="text-xs text-slate-500">Approved</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-100 p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{pendingHours.toFixed(1)}h</p>
              <p className="text-xs text-slate-500">Pending</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 border-b border-slate-200">
            {([{ id: 'timer' as const, label: 'Timer' }, { id: 'manual' as const, label: 'Manual Entry' }, { id: 'history' as const, label: 'History' }]).map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-4 py-3 text-sm font-medium relative ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'}`}>
                {tab.label}
                {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600" />}
              </button>
            ))}
          </div>

          {/* Timer Tab */}
          {activeTab === 'timer' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
              <div className="text-6xl font-mono font-bold text-slate-900 mb-6 tracking-wider">{formatElapsed(elapsed)}</div>
              {isTracking && (
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you working on?" className="w-full max-w-md px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm mb-4 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              )}
              <div className="flex justify-center gap-3">
                {!isTracking ? (
                  <button onClick={startTracking} className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2">
                    <Play className="w-5 h-5" /> Start Timer
                  </button>
                ) : (
                  <button onClick={stopTracking} className="px-8 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2">
                    <Pause className="w-5 h-5" /> Stop & Submit ({formatElapsed(elapsed)})
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Manual Entry Tab */}
          {activeTab === 'manual' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Hours</label>
                  <input type="number" step="0.25" min="0.25" value={manualHours} onChange={(e) => setManualHours(e.target.value)} placeholder="e.g. 3.5" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
                  <input type="date" value={manualDate} onChange={(e) => setManualDate(e.target.value)} className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What did you work on?" className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <button onClick={submitManualEntry} disabled={!manualHours} className="w-full py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50">
                  Submit Time Entry
                </button>
              </div>
            </div>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>
              ) : timeEntries.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-2xl border border-slate-100">
                  <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No time entries yet</p>
                </div>
              ) : (
                timeEntries.map((entry) => (
                  <div key={entry.id} className="bg-white rounded-xl border border-slate-100 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="text-center min-w-[50px]">
                        <p className="text-lg font-bold text-slate-900">{entry.hours}h</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-sm">{entry.description}</p>
                        <p className="text-xs text-slate-400">{new Date(entry.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    {getStatusBadge(entry.status)}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}