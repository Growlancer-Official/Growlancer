import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, ArrowRight, Briefcase, Calendar, CheckCircle2, Clock, Loader2, Mail, MessageSquare, User, Wallet, XCircle,  } from 'lucide-react';
import { LoadingSkeleton } from '../../components/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { Tables } from '../../types/supabase';

type InviteWithDetails = Tables<'invites'> & {
  projects: {
    title: string;
    description: string;
    budget_min: number | null;
    budget_max: number | null;
    skills_required: string[] | null;
    client_id: string;
    experience_level: string | null;
  };
  profiles: {
    id?: string;
    name: string;
    email: string;
    avatar: string | null;
  };
};

export function InvitesPage() {
  const { user } = useAuth();
  const [invites, setInvites] = useState<InviteWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingInvite, setProcessingInvite] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'accepted' | 'declined'>('pending');
  const [newInviteAlert, setNewInviteAlert] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    const fetchInvites = async () => {
      try {
        const { data, error } = await supabase
          .from('invites')
          .select(`
            *,
            projects!inner(title, description, budget_min, budget_max, skills_required, client_id, experience_level),
            profiles!invites_client_id_fkey(name, email, avatar, deleted_at)
          `)
          .eq('freelancer_id', user.id)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Supabase error:', error);
          throw error;
        }

        if (data) {
          // Filter out invites from deleted clients
          setInvites((data as unknown as InviteWithDetails[]).filter(i => {
            const clientProf = i.profiles as { deleted_at?: string | null } | null;
            return clientProf && !clientProf.deleted_at;
          }));
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching invites:', error);
        setLoading(false);
      }
    };

    // Add timeout to prevent infinite loading - reduced to 3 seconds for faster UX
    const timeoutId = setTimeout(() => {
      if (loading) {
        setLoading(false);
      }
    }, 3000);

    fetchInvites();

    // Set up real-time subscription for invites
    const invitesChannel = supabase
      .channel('invites-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'invites',
          filter: `freelancer_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            // Fetch new invite with details
            const fetchNewInvite = async () => {
              const { data } = await supabase
                .from('invites')
                .select(`
                  *,
                  projects!inner(title, description, budget_min, budget_max, skills_required, client_id, experience_level),
                  profiles!invites_client_id_fkey(name, email, avatar, deleted_at)
                `)
                .eq('id', payload.new.id)
                .single();
              
              if (data) {
                const inviteData = data as unknown as InviteWithDetails;
                const clientProf = inviteData.profiles as { deleted_at?: string | null } | null;
                // Only add the invite if the client is not deleted
                if (clientProf && !clientProf.deleted_at) {
                  setInvites(prev => [inviteData, ...prev]);
                  setNewInviteAlert(`New invite from ${inviteData.profiles?.name}`);
                  setTimeout(() => setNewInviteAlert(null), 5000);
                }
              }
            };
            fetchNewInvite();
          } else if (payload.eventType === 'UPDATE') {
            setInvites(prev => 
              prev.map(invite => 
                invite.id === payload.new.id 
                  ? { ...invite, ...payload.new }
                  : invite
              )
            );
          } else if (payload.eventType === 'DELETE') {
            setInvites(prev => prev.filter(invite => invite.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    // Real-time subscription for profile/avatar changes
    const profilesChannel = supabase
      .channel('profiles-avatar-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`
        },
        (payload) => {
          // Update avatar in all invites that reference this user's profile
          if (payload.new.avatar !== payload.old.avatar) {
            setInvites(prev => 
              prev.map(invite => 
                invite.profiles?.id === user.id
                  ? { 
                      ...invite, 
                      profiles: { 
                        ...invite.profiles, 
                        avatar: payload.new.avatar 
                      }
                    }
                  : invite
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(timeoutId);
      invitesChannel.unsubscribe();
      profilesChannel.unsubscribe();
    };
  }, [user, loading]);

  const handleAcceptInvite = async (inviteId: string) => {
    setProcessingInvite(inviteId);
    try {
      // Get the invite with project details
      const { data: invite } = await supabase
        .from('invites')
        .select('*, projects!inner(id, client_id, title, budget_min, budget_max)')
        .eq('id', inviteId)
        .single();

      if (!invite) throw new Error('Invite not found');

      // Accept the invite
      const { error: acceptError } = await supabase
        .from('invites')
        .update({ status: 'accepted', updated_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (acceptError) throw acceptError;

      // Auto-create a contract so the project can proceed
      const bidAmount = Number(invite.projects.budget_max) || 500;
      const platformFee = Math.round(bidAmount * 0.05);

      const { error: contractError } = await supabase.from('contracts').insert({
        project_id: invite.project_id,
        freelancer_id: user!.id,
        client_id: invite.projects.client_id,
        amount: bidAmount,
        platform_fee: platformFee,
        freelancer_amount: bidAmount - platformFee,
        status: 'pending',
      });

      if (!contractError) {
        // Update project status to in_progress so it shows as active
        await supabase
          .from('projects')
          .update({ status: 'in_progress', updated_at: new Date().toISOString() })
          .eq('id', invite.projects.id);
      } else {
        console.error('Failed to create contract from invite:', contractError);
        // Still mark invite as accepted — contract can be created manually
      }

      // Update local state
      setInvites(prev =>
        prev.map((invite) =>
          invite.id === inviteId
            ? { ...invite, status: 'accepted', updated_at: new Date().toISOString() }
            : invite
        )
      );
    } catch (error) {
      console.error('Error accepting invite:', error);
      alert('Failed to accept invite. Please try again.');
    } finally {
      setProcessingInvite(null);
    }
  };

  const handleDeclineInvite = async (inviteId: string) => {
    setProcessingInvite(inviteId);
    try {
      const { error } = await supabase
        .from('invites')
        .update({ status: 'declined', updated_at: new Date().toISOString() })
        .eq('id', inviteId);

      if (error) throw error;

      setInvites(prev =>
        prev.map((invite) =>
          invite.id === inviteId
            ? { ...invite, status: 'declined', updated_at: new Date().toISOString() }
            : invite
        )
      );
    } catch (error) {
      console.error('Error declining invite:', error);
      alert('Failed to decline invite. Please try again.');
    } finally {
      setProcessingInvite(null);
    }
  };

  const filteredInvites = invites.filter((invite) => invite.status === activeTab);

  const pendingCount = invites.filter((i) => i.status === 'pending').length;
  const acceptedCount = invites.filter((i) => i.status === 'accepted').length;
  const declinedCount = invites.filter((i) => i.status === 'declined').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 text-sm font-medium rounded-full">
            <Clock className="w-3 h-3" />
            Pending
          </span>
        );
      case 'accepted':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            Accepted
          </span>
        );
      case 'declined':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-red-100 text-red-700 text-sm font-medium rounded-full">
            <XCircle className="w-3 h-3" />
            Declined
          </span>
        );
      case 'expired':
        return (
          <span className="flex items-center gap-1 px-3 py-1 bg-slate-100 text-slate-600 text-sm font-medium rounded-full">
            <AlertCircle className="w-3 h-3" />
            Expired
          </span>
        );
      default:
        return null;
    }
  };

  const isExpired = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    return new Date(expiresAt) < new Date();
  };

  if (loading) {
    return <LoadingSkeleton variant="full-page" />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
            <Mail className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">Project Invites</h1>
            <p className="text-slate-500">
              Clients have invited you to {pendingCount} project{pendingCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 rounded-xl border border-orange-100">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
            <span className="text-sm font-medium text-orange-700">
              {pendingCount} pending response{pendingCount !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* New Invite Alert */}
      {newInviteAlert && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3 animate-in slide-in-from-top">
          <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
            <Mail className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <p className="font-medium text-purple-900">{newInviteAlert}</p>
            <p className="text-sm text-purple-600">You've received a new project invitation!</p>
          </div>
          <button
            onClick={() => setNewInviteAlert(null)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-purple-100 transition-colors"
          >
            <XCircle className="w-4 h-4 text-purple-600" />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'pending'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Pending
          {pendingCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-orange-500 text-white text-xs rounded-full">
              {pendingCount}
            </span>
          )}
          {activeTab === 'pending' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('accepted')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'accepted'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Accepted
          {acceptedCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-full">
              {acceptedCount}
            </span>
          )}
          {activeTab === 'accepted' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('declined')}
          className={`px-4 py-3 text-sm font-medium transition-colors relative ${
            activeTab === 'declined'
              ? 'text-emerald-600'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Declined
          {declinedCount > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded-full">
              {declinedCount}
            </span>
          )}
          {activeTab === 'declined' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-600"></span>
          )}
        </button>
      </div>

      {/* Invites List */}
      {filteredInvites.length > 0 ? (
        <div className="space-y-4">
          {filteredInvites.map((invite) => (
            <div
              key={invite.id}
              className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm"
            >
              <div className="flex items-start gap-6">
                {/* Client Avatar */}
                <div className="flex-shrink-0">
                  <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center overflow-hidden">
                    {invite.profiles?.avatar ? (
                      <img
                        src={invite.profiles.avatar}
                        alt={invite.profiles.name}
                        className="w-full h-full object-cover object-top"
                        style={{
                          objectPosition: 'center 20%',
                          filter: 'brightness(1.05) contrast(1.02)'
                        }}
                      />
                    ) : (
                      <User className="w-7 h-7 text-slate-400" />
                    )}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-display text-lg font-bold text-slate-900">
                          {invite.projects.title}
                        </h3>
                        {getStatusBadge(invite.status)}
                      </div>
                      
                      <p className="text-slate-600 mb-4">
                        {invite.projects.description}
                      </p>

                      {/* Client Info */}
                      <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                        <span className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          Invited by <span className="font-medium text-slate-700">{invite.profiles?.name}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(invite.created_at || '').toLocaleDateString()}
                        </span>
                        {invite.expires_at && !isExpired(invite.expires_at) && (
                          <span className="flex items-center gap-1 text-orange-600">
                            <Clock className="w-4 h-4" />
                            Expires {new Date(invite.expires_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* Project Details */}
                      <div className="flex items-center gap-6 text-sm">
                        <span className="flex items-center gap-1 text-slate-600">
                          <Wallet className="w-4 h-4 text-slate-400" />
                          ${invite.projects.budget_min?.toLocaleString()} - ${
                            invite.projects.budget_max?.toLocaleString()
                          }
                        </span>
                        <span className="flex items-center gap-1 text-slate-600">
                          <Briefcase className="w-4 h-4 text-slate-400" />
                          {invite.projects.experience_level}
                        </span>
                      </div>

                      {/* Message from client */}
                      {invite.message && (
                        <div className="mt-4 p-4 bg-slate-50 rounded-xl">
                          <div className="flex items-center gap-2 mb-2">
                            <MessageSquare className="w-4 h-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-700">Message from client:</span>
                          </div>
                          <p className="text-sm text-slate-600 italic">"{invite.message}"</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      {invite.status === 'pending' && !isExpired(invite.expires_at) ? (
                        <>
                          <button
                            onClick={() => handleAcceptInvite(invite.id)}
                            disabled={processingInvite === invite.id}
                            className="px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                            {processingInvite === invite.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                            Accept
                          </button>
                          <button
                            onClick={() => handleDeclineInvite(invite.id)}
                            disabled={processingInvite === invite.id}
                            className="px-6 py-2.5 border border-slate-200 text-slate-600 font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </>
                      ) : invite.status === 'accepted' ? (
                        <Link
                          to="/dashboard/contracts"
                          className="px-6 py-2.5 bg-emerald-50 text-emerald-700 font-medium rounded-xl hover:bg-emerald-100 transition-colors flex items-center gap-2"
                        >
                          View Contract
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-12 border border-slate-100 text-center">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="font-display text-xl font-bold text-slate-900 mb-2">
            {activeTab === 'pending'
              ? 'No pending invites'
              : activeTab === 'accepted'
              ? 'No accepted invites'
              : 'No declined invites'}
          </h3>
          <p className="text-slate-500 max-w-md mx-auto">
            {activeTab === 'pending'
              ? 'When clients invite you to their projects, they will appear here.'
              : activeTab === 'accepted'
              ? 'Accepted invites will be converted to contracts.'
              : 'Declined invites are archived here for reference.'}
          </p>
          {activeTab === 'pending' && (
            <Link
              to="/dashboard/feed"
              className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors"
            >
              Browse Projects
              <ArrowRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
