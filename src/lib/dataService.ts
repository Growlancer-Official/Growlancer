// Comprehensive Data Service - All Database Operations
import { supabase, realtimeChannels } from './supabase';
import { captureError } from './telemetry';
import { CacheManager } from './services/cacheManager';
import { calculatePlatformFee } from './config';

// Types
export interface Project {
  id: string;
  client_id: string;
  title: string;
  description: string;
  budget_min: number;
  budget_max: number;
  category: string;
  skills_required: string[];
  experience_level: string;
  status: string;
  visibility: string;
  deadline?: string;
  created_at: string;
  updated_at: string;
}

export interface Proposal {
  id: string;
  project_id: string;
  freelancer_id: string;
  message: string;
  proposed_rate: number;
  cover_letter?: string;
  bid_amount?: number;
  estimated_duration: number;
  status: string;
  created_at: string;
  updated_at: string;
  projects?: any;
  project?: any;
}

export interface Contract {
  id: string;
  project_id: string;
  proposal_id: string;
  freelancer_id: string;
  client_id: string;
  amount: number;
  platform_fee: number;
  freelancer_amount: number;
  status: string;
  escrow_funded?: boolean;
  milestones: any;
  start_date?: string;
  end_date?: string;
  created_at: string;
  updated_at: string;
  projects?: any;
  project?: any;
}

export interface Escrow {
  id: string;
  contract_id: string;
  client_id: string;
  freelancer_id: string;
  amount: number;
  status: string;
  funded_at?: string;
  released_at?: string;
  created_at: string;
}

export interface Invite {
  id: string;
  project_id: string;
  freelancer_id: string;
  client_id: string;
  message?: string;
  status: string;
  expires_at?: string;
  created_at: string;
  projects?: any;
  project?: any;
}

// ==================== PROJECTS ====================

export const projectsService = {
  // Client: Create new project
  async create(clientId: string, project: Partial<Project>): Promise<{ success: boolean; data?: Project; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('projects')
        .insert({
          client_id: clientId,
          title: project.title,
          description: project.description,
          budget_min: project.budget_min,
          budget_max: project.budget_max,
          category: project.category,
          skills_required: project.skills_required || [],
          experience_level: project.experience_level || 'intermediate',
          status: 'open',
          visibility: project.visibility || 'public',
          deadline: project.deadline,
        })
        .select()
        .single();

      if (error) throw error;

      // Invalidate project caches
      CacheManager.invalidate(`client_projects:${clientId}`);
      CacheManager.invalidate(`open_projects:`);

      return { success: true, data };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to create project';
      captureError('Create project failed', { error });
      return { success: false, error };
    }
  },

  // Client: Get all their projects (Cached)
  async getClientProjects(clientId: string, forceRefetch = false): Promise<Project[]> {
    const cacheKey = `client_projects:${clientId}`;
    if (!forceRefetch) {
      const cached = CacheManager.get<Project[]>(cacheKey);
      if (cached) return cached;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) {
      captureError('Get client projects failed', { error: error.message });
      return [];
    }
    
    const result = data || [];
    CacheManager.set(cacheKey, result);
    return result;
  },

  // Freelancer: Get open projects (Cached)
  async getOpenProjects(limit = 50, forceRefetch = false): Promise<Project[]> {
    const cacheKey = `open_projects:${limit}`;
    if (!forceRefetch) {
      const cached = CacheManager.get<Project[]>(cacheKey);
      if (cached) return cached;
    }

    const { data, error } = await supabase
      .from('projects')
      .select('*, profiles!projects_client_id_fkey(name, avatar, deleted_at)')
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      captureError('Get open projects failed', { error: error.message });
      return [];
    }
    
    // Filter out projects belonging to deleted users (soft-delete: deleted_at set, or hard-delete: profile null)
    const result = (data || []).filter((project: any) => {
      const clientProfile = project.profiles as { name?: string; deleted_at?: string | null } | null;
      // Skip if client profile is null (hard-deleted) or has deleted_at set (soft-deleted) or no name
      if (!clientProfile || clientProfile.deleted_at || !clientProfile.name) return false;
      return true;
    });
    CacheManager.set(cacheKey, result);
    return result;
  },

  // Get single project with client info (filters out deleted clients)
  async getById(projectId: string): Promise<Project | null> {
    const { data, error } = await supabase
      .from('projects')
      .select('*, profiles!projects_client_id_fkey(name, avatar, email, deleted_at)')
      .eq('id', projectId)
      .single();

    if (error) return null;
    // Don't return projects belonging to deleted clients
    const clientProfile = (data as any)?.profiles as { deleted_at?: string | null } | null;
    if (!clientProfile || clientProfile.deleted_at) return null;
    return data;
  },

  // Client: Update project
  async update(projectId: string, updates: Partial<Project>): Promise<boolean> {
    const { error } = await supabase
      .from('projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', projectId);

    return !error;
  },

  // Client: Delete project (only if no contracts)
  async delete(projectId: string): Promise<boolean> {
    // Check for active contracts first
    const { data: contracts } = await supabase
      .from('contracts')
      .select('id')
      .eq('project_id', projectId)
      .in('status', ['active', 'pending']);

    if (contracts && contracts.length > 0) {
      return false; // Cannot delete project with active contracts
    }

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId);

    return !error;
  },
};

// ==================== PROPOSALS ====================

export const proposalsService = {
  // Freelancer: Submit proposal
  async create(freelancerId: string, proposal: Partial<Proposal>): Promise<{ success: boolean; data?: Proposal; error?: string }> {
    try {
      // Check if already applied
      const { data: existing } = await supabase
        .from('proposals')
        .select('id')
        .eq('project_id', proposal.project_id)
        .eq('freelancer_id', freelancerId)
        .single();

      if (existing) {
        return { success: false, error: 'You have already submitted a proposal for this project' };
      }

      const { data, error } = await supabase
        .from('proposals')
        .insert({
          project_id: proposal.project_id,
          freelancer_id: freelancerId,
          message: proposal.cover_letter || proposal.message || '',
          proposed_rate: proposal.bid_amount || proposal.proposed_rate || 0,
          estimated_duration: proposal.estimated_duration,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Invalidate proposals cache
      CacheManager.invalidate(`freelancer_proposals:${freelancerId}`);

      return { success: true, data };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to submit proposal';
      return { success: false, error };
    }
  },

  // Get proposals for a project (Client view)
  async getByProject(projectId: string): Promise<Proposal[]> {
    const { data, error } = await supabase
      .from('proposals')
      .select('*, profiles!proposals_freelancer_id_fkey(name, avatar, email, deleted_at), freelancer_profiles(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (error) return [];
    // Filter out proposals from deleted users
    return (data || []).filter((p: any) => {
      const prof = p.profiles as { deleted_at?: string | null } | null;
      return prof && !prof.deleted_at;
    }).map(p => ({
      ...p,
      cover_letter: p.message,
      bid_amount: p.proposed_rate
    })) as unknown as Proposal[];
  },

  // Get freelancer's proposals (Cached)
  async getByFreelancer(freelancerId: string, forceRefetch = false): Promise<Proposal[]> {
    const cacheKey = `freelancer_proposals:${freelancerId}`;
    if (!forceRefetch) {
      const cached = CacheManager.get<Proposal[]>(cacheKey);
      if (cached) return cached;
    }

    const { data, error } = await supabase
      .from('proposals')
      .select('*, projects(*)')
      .eq('freelancer_id', freelancerId)
      .order('created_at', { ascending: false });

    if (error) return [];
    const result = (data || []).map(p => ({
      ...p,
      cover_letter: p.message,
      bid_amount: p.proposed_rate
    })) as unknown as Proposal[];
    CacheManager.set(cacheKey, result);
    return result;
  },

  // Client: Accept proposal
  async accept(proposalId: string): Promise<boolean> {
    const { error } = await supabase
      .from('proposals')
      .update({ status: 'accepted' })
      .eq('id', proposalId);

    return !error;
  },

  // Client: Reject proposal
  async reject(proposalId: string): Promise<boolean> {
    const { error } = await supabase
      .from('proposals')
      .update({ status: 'rejected' })
      .eq('id', proposalId);

    return !error;
  },

  // Freelancer: Withdraw proposal
  async withdraw(proposalId: string): Promise<boolean> {
    const { error } = await supabase
      .from('proposals')
      .update({ status: 'withdrawn' })
      .eq('id', proposalId);

    return !error;
  },

  /** Pending proposals across all of a client's projects (dashboard badge). */
  async countPendingForClient(clientId: string): Promise<number> {
    const { data: projects } = await supabase.from('projects').select('id').eq('client_id', clientId);
    const projectIds = projects?.map((p) => p.id) ?? [];
    if (projectIds.length === 0) return 0;

    const { count, error } = await supabase
      .from('proposals')
      .select('id', { count: 'exact', head: true })
      .in('project_id', projectIds)
      .eq('status', 'pending');

    if (error) return 0;
    return count ?? 0;
  },

  subscribe(freelancerId: string, onChange: () => void) {
    const channel = realtimeChannels.proposals(`freelancer:${freelancerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposals', filter: `freelancer_id=eq.${freelancerId}` },
        () => onChange()
      )
      .subscribe();
    return { unsubscribe: () => void channel.unsubscribe() };
  },

  /** Refetch when any proposal changes on client's projects (also listens to new projects). */
  subscribeForClientProjects(clientId: string, onChange: () => void) {
    const channel = realtimeChannels.projects(`client:${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `client_id=eq.${clientId}` },
        () => onChange()
      )
      .subscribe();
    return { unsubscribe: () => void channel.unsubscribe() };
  },

  subscribeForClient(clientId: string, onChange: () => void) {
    const channel = realtimeChannels.proposals(`client:${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'proposals' },
        () => onChange()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects', filter: `client_id=eq.${clientId}` },
        () => onChange()
      )
      .subscribe();
    return { unsubscribe: () => void channel.unsubscribe() };
  },
};

// ==================== CONTRACTS ====================

export const contractsService = {
  // Create contract from accepted proposal
  async createFromProposal(proposalId: string, clientId: string): Promise<{ success: boolean; data?: Contract; error?: string }> {
    try {
      // Get proposal details
      const { data: proposal, error: proposalError } = await supabase
        .from('proposals')
        .select('*, projects(*), profiles!proposals_freelancer_id_fkey(*)')
        .eq('id', proposalId)
        .single();

      if (proposalError || !proposal) {
        return { success: false, error: 'Proposal not found' };
      }

      const bidAmount = Number(proposal.proposed_rate || 0);
      // Client pays bid + 5% platform fee (added on top). Freelancer gets full bid amount.
      // This matches the Terms of Service: "Client Fee 5%, Freelancer Fee 0%"
      const platformFee = calculatePlatformFee(bidAmount);
      // freelancer_amount = full bid amount (freelancer gets paid in full)
      const freelancerAmount = bidAmount;

      const { data, error } = await supabase
        .from('contracts')
        .insert({
          project_id: proposal.project_id,
          proposal_id: proposalId,
          freelancer_id: proposal.freelancer_id,
          client_id: clientId,
          amount: bidAmount,
          platform_fee: platformFee,
          freelancer_amount: freelancerAmount,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Update proposal status
      await supabase.from('proposals').update({ status: 'accepted' }).eq('id', proposalId);

      // Update project status
      await supabase.from('projects').update({ status: 'in_progress' }).eq('id', proposal.project_id);

      // Invalidate caches
      CacheManager.invalidate(`user_contracts:${clientId}`);
      CacheManager.invalidate(`user_contracts:${proposal.freelancer_id}`);
      CacheManager.invalidate(`client_projects:${clientId}`);
      CacheManager.invalidate(`open_projects:`);
      CacheManager.invalidate(`freelancer_proposals:${proposal.freelancer_id}`);

      // Decline other pending proposals on this project (one hire per project)
      await supabase
        .from('proposals')
        .update({ status: 'rejected' })
        .eq('project_id', proposal.project_id)
        .eq('status', 'pending')
        .neq('id', proposalId);

      return { success: true, data };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Failed to create contract';
      return { success: false, error };
    }
  },

  subscribe(userId: string, role: 'freelancer' | 'client', onChange: () => void) {
    const col = role === 'freelancer' ? 'freelancer_id' : 'client_id';
    const channel = realtimeChannels.contracts(`${role}:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'contracts', filter: `${col}=eq.${userId}` },
        () => onChange()
      )
      .subscribe();
    return { unsubscribe: () => void channel.unsubscribe() };
  },

  // Get user's contracts (freelancer or client) (Cached)
  async getByUser(userId: string, role: 'freelancer' | 'client', forceRefetch = false): Promise<Contract[]> {
    const cacheKey = `user_contracts:${userId}:${role}`;
    if (!forceRefetch) {
      const cached = CacheManager.get<Contract[]>(cacheKey);
      if (cached) return cached;
    }

    const column = role === 'freelancer' ? 'freelancer_id' : 'client_id';
    
    const { data, error } = await supabase
      .from('contracts')
      .select('*, projects(*), freelancer_profile:profiles!contracts_freelancer_id_fkey(name, avatar, deleted_at), client_profile:profiles!contracts_client_id_fkey(name, avatar, deleted_at)')
      .eq(column, userId)
      .order('created_at', { ascending: false });

    if (error) return [];
    // Filter out contracts where either party is deleted
    const result = (data || []).filter((c: any) => {
      const freelancerProf = c.freelancer_profile as { deleted_at?: string | null } | null;
      const clientProf = c.client_profile as { deleted_at?: string | null } | null;
      return (freelancerProf && !freelancerProf.deleted_at) && (clientProf && !clientProf.deleted_at);
    }).map(c => ({
      ...c,
      escrow_funded: c.status !== 'pending'
    })) as unknown as Contract[];
    CacheManager.set(cacheKey, result);
    return result;
  },

  // Get single contract
  async getById(contractId: string): Promise<Contract | null> {
    const { data, error } = await supabase
      .from('contracts')
      .select('*, projects(*), escrow(*), paypal_orders(*), messages(*), contract_files(*)')
      .eq('id', contractId)
      .single();

    if (error || !data) return null;
    // Filter out if either party is deleted — fetch profiles to check
    const checkProfiles = await supabase
      .from('profiles')
      .select('id, deleted_at')
      .in('id', [data.freelancer_id, data.client_id]);
    
    const activeProfiles = checkProfiles.data?.filter(p => !p.deleted_at) || [];
    // Contract requires BOTH freelancer and client to be active
    if (activeProfiles.length < 2) return null;

    return {
      ...data,
      escrow_funded: data.status !== 'pending' && data.escrow && data.escrow.length > 0
    } as unknown as Contract;
  },

  // Update contract status
  async updateStatus(contractId: string, status: string): Promise<boolean> {
    const { error } = await supabase
      .from('contracts')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', contractId);

    return !error;
  },

  // Complete contract
  async complete(contractId: string): Promise<boolean> {
    const { error } = await supabase
      .from('contracts')
      .update({ 
        status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', contractId);

    if (!error) {
      // Release escrow
      await supabase.from('escrow').update({ 
        status: 'released',
        released_at: new Date().toISOString(),
      }).eq('contract_id', contractId);
    }

    return !error;
  },
};

// ==================== ESCROW ====================

export const escrowService = {
  // Fund escrow (called after successful payment)
  async fund(contractId: string, amount: number): Promise<boolean> {
    try {
      // Get contract details to get client_id and freelancer_id
      const { data: contract } = await supabase
        .from('contracts')
        .select('client_id, freelancer_id, project_id')
        .eq('id', contractId)
        .single();

      if (!contract) return false;

      // Create escrow record
      const { error } = await supabase.from('escrow').insert({
        contract_id: contractId,
        client_id: contract.client_id,
        freelancer_id: contract.freelancer_id,
        amount,
        status: 'funded',
        funded_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Update contract status
      await supabase
        .from('contracts')
        .update({ status: 'active' })
        .eq('id', contractId);

      // Update project status
      await supabase.from('projects').update({ status: 'in_progress' }).eq('id', contract.project_id);

      return true;
    } catch (err) {
      captureError('Fund escrow failed', { error: err instanceof Error ? err.message : 'Unknown' });
      return false;
    }
  },

  // Release escrow (when work is approved)
  async release(contractId: string): Promise<boolean> {
    try {
      const { data: escrow } = await supabase
        .from('escrow')
        .select('*')
        .eq('contract_id', contractId)
        .single();

      if (!escrow || escrow.status !== 'funded') {
        return false;
      }

      await supabase
        .from('escrow')
        .update({ status: 'released', released_at: new Date().toISOString() })
        .eq('contract_id', contractId);

      await supabase
        .from('contracts')
        .update({ status: 'completed' })
        .eq('id', contractId);

      return true;
    } catch (err) {
      captureError('Release escrow failed', { error: err instanceof Error ? err.message : 'Unknown' });
      return false;
    }
  },

  // Get escrow by contract
  async getByContract(contractId: string): Promise<Escrow | null> {
    const { data } = await supabase
      .from('escrow')
      .select('*')
      .eq('contract_id', contractId)
      .single();

    return data;
  },
};

// ==================== INVITES ====================

export const invitesService = {
  // Client: Invite freelancer to project
  async create(clientId: string, projectId: string, freelancerId: string, message?: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('invites').insert({
        project_id: projectId,
        freelancer_id: freelancerId,
        client_id: clientId,
        message,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      });

      return !error;
    } catch (err) {
      return false;
    }
  },

  // Get freelancer's invites (Cached)
  async getFreelancerInvites(freelancerId: string, forceRefetch = false): Promise<Invite[]> {
    const cacheKey = `freelancer_invites:${freelancerId}`;
    if (!forceRefetch) {
      const cached = CacheManager.get<Invite[]>(cacheKey);
      if (cached) return cached;
    }

    const { data } = await supabase
      .from('invites')
      .select('*, projects(*), profiles!invites_client_id_fkey(name, avatar, deleted_at)')
      .eq('freelancer_id', freelancerId)
      .order('created_at', { ascending: false });

    // Filter out invites from deleted clients
    const result = (data || []).filter((i: any) => {
      const clientProfile = i.profiles as { deleted_at?: string | null } | null;
      return clientProfile && !clientProfile.deleted_at;
    });
    CacheManager.set(cacheKey, result);
    return result;
  },

  // Accept invite
  async accept(inviteId: string): Promise<boolean> {
    const { error } = await supabase
      .from('invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);

    return !error;
  },

  // Decline invite
  async decline(inviteId: string): Promise<boolean> {
    const { error } = await supabase
      .from('invites')
      .update({ status: 'declined' })
      .eq('id', inviteId);

    return !error;
  },

  async getByClient(clientId: string): Promise<Invite[]> {
    const { data, error } = await supabase
      .from('invites')
      .select('*, project:projects(id, title), freelancer:profiles!invites_freelancer_id_fkey(id, name, avatar, deleted_at)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (error) return [];
    // Filter out invites to deleted freelancers
    return (data || []).filter((i: any) => {
      const freelancerProfile = i.freelancer as { deleted_at?: string | null } | null;
      return freelancerProfile && !freelancerProfile.deleted_at;
    }) as Invite[];
  },

  async cancel(inviteId: string): Promise<boolean> {
    const { error } = await supabase.from('invites').update({ status: 'declined' }).eq('id', inviteId);
    return !error;
  },

  async resend(inviteId: string): Promise<boolean> {
    const { error } = await supabase
      .from('invites')
      .update({
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      })
      .eq('id', inviteId);
    return !error;
  },

  subscribe(clientId: string, onChange: () => void) {
    const channel = realtimeChannels.invites(`client:${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invites', filter: `client_id=eq.${clientId}` },
        () => onChange()
      )
      .subscribe();
    return { unsubscribe: () => void channel.unsubscribe() };
  },

  subscribeFreelancer(freelancerId: string, onChange: () => void) {
    const channel = realtimeChannels.invites(`freelancer:${freelancerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'invites', filter: `freelancer_id=eq.${freelancerId}` },
        () => onChange()
      )
      .subscribe();
    return { unsubscribe: () => void channel.unsubscribe() };
  },
};

// ==================== TRANSACTIONS ====================

export const transactionsService = {
  async getEarningsSummary(freelancerId: string): Promise<{ total: number; monthly: number }> {
    const { data } = await supabase
      .from('transactions')
      .select('amount, type, status, created_at')
      .eq('user_id', freelancerId)
      .in('type', ['escrow_release', 'payment', 'credit'])
      .eq('status', 'completed');

    const rows = data || [];
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let total = 0;
    let monthly = 0;
    for (const row of rows) {
      const amt = Number(row.amount) || 0;
      total += amt;
      if (row.created_at && new Date(row.created_at) >= monthStart) monthly += amt;
    }
    return { total, monthly };
  },

  subscribe(userId: string, onChange: () => void) {
    const channel = realtimeChannels.transactions(`${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions', filter: `user_id=eq.${userId}` },
        () => onChange()
      )
      .subscribe();
    return { unsubscribe: () => void channel.unsubscribe() };
  },
};

