import { useState, useEffect, useCallback } from 'react';
import {
  Award, Search, Loader2, RefreshCw, User, Mail, Shield, AlertTriangle,
  CheckCircle2, XCircle, ExternalLink, FileText, Calendar, Clock, Filter,
  Plus, X, ChevronDown, ChevronUp, Ban, Crown, Copy, CheckCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { adminQuery } from '../../lib/adminDataProxy';
import {
  issueCertificate, revokeCertificate, getAllCertificates,
  type Certificate, CERT_LEVEL_STYLES, getCertificateTitle,
} from '../../lib/certificateService';

// ─── Helpers ────────────────────────────────────────────────────────
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

const statusStyles: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-400',
  revoked: 'bg-red-500/10 text-red-400',
  expired: 'bg-slate-500/10 text-slate-400',
};

const typeStyles: Record<string, string> = {
  skill_test: 'bg-blue-500/10 text-blue-400',
  platform: 'bg-purple-500/10 text-purple-400',
  internship: 'bg-amber-500/10 text-amber-400',
  achievement: 'bg-emerald-500/10 text-emerald-400',
};

// ─── Issue Certificate Modal ────────────────────────────────────────
function IssueCertificateModal({ onClose, onIssued }: { onClose: () => void; onIssued: () => void }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; email: string } | null>(null);
  const [skill, setSkill] = useState('');
  const [level, setLevel] = useState<Certificate['level']>('intermediate');
  const [certType, setCertType] = useState<Certificate['certificate_type']>('platform');
  const [issuing, setIssuing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const searchUsers = useCallback(async (q: string) => {
    if (q.length < 2) { setUsers([]); return; }
    setSearching(true);
    try {
      const { data } = await adminQuery({
        table: 'profiles',
        select: 'id, name, email',
        isNull: { deleted_at: true },
        limit: 20,
      });
      const allUsers = (data || []) as { id: string; name: string; email: string }[];
      const filtered = allUsers.filter(u =>
        u.name?.toLowerCase().includes(q.toLowerCase()) ||
        u.email?.toLowerCase().includes(q.toLowerCase())
      );
      setUsers(filtered.slice(0, 10));
    } catch { setUsers([]); }
    finally { setSearching(false); }
  }, []);

  const handleIssue = async () => {
    if (!selectedUser || !skill.trim()) {
      setError('Please select a user and enter a skill name');
      return;
    }
    setIssuing(true);
    setError(null);
    try {
      const result = await issueCertificate({
        userId: selectedUser.id,
        skill: skill.trim(),
        level,
        recipientName: selectedUser.name,
        recipientEmail: selectedUser.email,
        type: certType,
        metadata: {},
      });
      if (result.success) {
        setSuccess(`Certificate issued to ${selectedUser.name}! Code: ${result.certificate?.verification_code}`);
        setTimeout(() => { onIssued(); onClose(); }, 2000);
      } else {
        setError(result.error || 'Failed to issue certificate');
      }
    } catch {
      setError('Failed to issue certificate');
    } finally { setIssuing(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-lg rounded-[2rem] p-6 space-y-5" 
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}
        onClick={e => e.stopPropagation()}>
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Award className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Issue Certificate</h2>
              <p className="text-xs text-slate-500">Grant a platform certificate to a user</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            <p className="text-xs text-emerald-400">{success}</p>
          </div>
        )}

        {/* Search User */}
        <div className="relative">
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Select User</label>
          <Search className="absolute left-3 top-[38px] w-4 h-4 text-slate-500" />
          <input type="text" value={searchQuery} onChange={e => { setSearchQuery(e.target.value); searchUsers(e.target.value); }}
            placeholder="Search by name or email..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          {searching && <Loader2 className="absolute right-3 top-[38px] w-4 h-4 animate-spin text-slate-500" />}
          {users.length > 0 && !selectedUser && (
            <div className="mt-1 bg-slate-800 border border-white/10 rounded-xl overflow-hidden">
              {users.map(u => (
                <button key={u.id} onClick={() => { setSelectedUser(u); setSearchQuery(u.name); setUsers([]); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 transition-colors">
                  <div className="h-8 w-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-white">{u.name.charAt(0)}</div>
                  <div className="text-left"><p className="font-medium">{u.name}</p><p className="text-[10px] text-slate-500">{u.email}</p></div>
                </button>
              ))}
            </div>
          )}
          {selectedUser && (
            <div className="mt-1 flex items-center gap-2 px-3 py-2 bg-emerald-500/10 rounded-lg">
              <span className="text-xs text-emerald-400">{selectedUser.name} ({selectedUser.email})</span>
              <button onClick={() => setSelectedUser(null)} className="ml-auto text-slate-400 hover:text-white"><X className="w-3 h-3" /></button>
            </div>
          )}
        </div>

        {/* Skill Name */}
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Skill / Title</label>
          <input type="text" value={skill} onChange={e => setSkill(e.target.value)}
            placeholder="e.g., React Development, UI Design" className="w-full px-4 py-2.5 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
        </div>

        {/* Level + Type */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Level</label>
            <select value={level} onChange={e => setLevel(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
              <option value="beginner">🌱 Beginner</option>
              <option value="intermediate">📈 Intermediate</option>
              <option value="advanced">🚀 Advanced</option>
              <option value="expert">👑 Expert</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Type</label>
            <select value={certType} onChange={e => setCertType(e.target.value as any)}
              className="w-full px-3 py-2.5 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20">
              <option value="platform">🏆 Platform Certificate</option>
              <option value="skill_test">📝 Skill Certification</option>
              <option value="internship">🎓 Internship Completion</option>
              <option value="achievement">⭐ Achievement Badge</option>
            </select>
          </div>
        </div>

        {/* Issue Button */}
        <button onClick={handleIssue} disabled={issuing || !selectedUser || !skill.trim()}
          className="w-full py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2">
          {issuing ? <><Loader2 className="w-4 h-4 animate-spin" /> Issuing...</> : <><Award className="w-4 h-4" /> Issue Certificate</>}
        </button>
      </div>
    </div>
  );
}

// ─── Main Admin Certificates Page ───────────────────────────────────
export function AdminCertificatesPage() {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchCerts = useCallback(async () => {
    setLoading(true);
    try {
      const certs = await getAllCertificates();
      setCertificates(certs);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCerts(); }, [fetchCerts]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase.channel(`admin-certs-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'skill_certifications' }, () => fetchCerts())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [fetchCerts]);

  const handleRevoke = async (certId: string, skill: string, userName: string) => {
    const reason = prompt(`Reason for revoking "${skill}" certificate for ${userName}:`);
    if (!reason) return;
    setActionLoading(`revoke-${certId}`);
    await revokeCertificate(certId, reason);
    await fetchCerts();
    setActionLoading(null);
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(code);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = certificates.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.recipient_name?.toLowerCase().includes(q) ||
      c.recipient_email?.toLowerCase().includes(q) ||
      c.skill?.toLowerCase().includes(q) ||
      c.verification_code?.toLowerCase().includes(q)
    ) && (statusFilter === 'all' || c.status === statusFilter);
  });

  const stats = {
    total: certificates.length,
    active: certificates.filter(c => c.status === 'active').length,
    revoked: certificates.filter(c => c.status === 'revoked').length,
  };

  return (
    <div className="space-y-8 pb-20 lg:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Certificates</h1>
          <p className="text-slate-400 text-sm mt-1">Issue and manage platform certificates</p>
        </div>
        <button onClick={() => setShowIssueModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-all">
          <Plus className="w-4 h-4" /> Issue Certificate
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Total</p>
          <p className="text-2xl font-bold text-white">{stats.total}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Active</p>
          <p className="text-2xl font-bold text-emerald-400">{stats.active}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Revoked</p>
          <p className="text-2xl font-bold text-red-400">{stats.revoked}</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-4 rounded-2xl"
        style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex items-center gap-3 flex-1 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, skill, or code..." className="w-full pl-9 pr-3 py-2 bg-slate-800/50 border border-white/5 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-slate-800 border border-white/5 text-[10px] font-bold uppercase rounded-lg px-3 py-2 text-slate-300 cursor-pointer">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="revoked">Revoked</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        <button onClick={fetchCerts}
          className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 hover:text-white px-3 py-2 rounded-lg hover:bg-white/5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Certificates List */}
      <div className="space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-slate-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500" style={{ background: '#1E293B', borderRadius: '2rem', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">No certificates found</p>
            <button onClick={() => setShowIssueModal(true)} className="mt-4 text-xs font-bold text-purple-400 hover:text-purple-300 transition-colors">
              Issue your first certificate →
            </button>
          </div>
        ) : (
          filtered.map(cert => {
            const levelStyle = CERT_LEVEL_STYLES[cert.level] || CERT_LEVEL_STYLES.beginner;
            const verifyUrl = `${window.location.origin}/verify-certificate/${cert.verification_code}`;
            return (
              <div key={cert.id} className="p-5 rounded-2xl" style={{ background: '#1E293B', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <div className={`h-12 w-12 rounded-xl ${levelStyle.bg} flex items-center justify-center text-xl shrink-0`}>
                      {levelStyle.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-white text-sm">{getCertificateTitle(cert)}</h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${statusStyles[cert.status]}`}>{cert.status}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${typeStyles[cert.certificate_type]}`}>{cert.certificate_type}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" />{cert.recipient_name}</span>
                        <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{cert.recipient_email}</span>
                        <span className={`flex items-center gap-1 ${levelStyle.color}`}>{levelStyle.label}</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Issued: {formatDate(cert.issued_at || cert.created_at)}</span>
                        {cert.verification_code && (
                          <button onClick={() => handleCopyCode(cert.verification_code!)}
                            className="flex items-center gap-1 hover:text-emerald-400 transition-colors font-mono">
                            {copiedId === cert.verification_code ? <CheckCheck className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            {cert.verification_code}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {cert.verification_code && (
                      <a href={verifyUrl} target="_blank" rel="noopener noreferrer"
                        className="p-1.5 hover:bg-white/5 rounded-lg text-slate-400 hover:text-emerald-400 transition-colors" title="View Certificate">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                    {cert.status === 'active' && (
                      <button onClick={() => handleRevoke(cert.id, cert.skill, cert.recipient_name)}
                        disabled={actionLoading === `revoke-${cert.id}`}
                        className="p-1.5 hover:bg-red-500/10 rounded-lg text-red-400 transition-colors" title="Revoke Certificate">
                        {actionLoading === `revoke-${cert.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Ban className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                </div>
                {cert.revoked_reason && (
                  <div className="mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/10 flex items-start gap-2">
                    <AlertTriangle className="w-3 h-3 text-red-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] font-bold text-red-400 uppercase">Revoked</p>
                      <p className="text-xs text-slate-400">{cert.revoked_reason} — {cert.revoked_at ? formatRelativeTime(cert.revoked_at) : ''}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Issue Modal */}
      {showIssueModal && <IssueCertificateModal onClose={() => setShowIssueModal(false)} onIssued={fetchCerts} />}
    </div>
  );
}
