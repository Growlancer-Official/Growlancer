// Dispute Resolution Service  
// Pure data-access layer for disputes table
import { supabase } from './supabase';
import type { Tables } from '../types/supabase';

export type DisputeCase = Tables<'disputes'>;

export interface DisputeInput {
  contract_id: string;
  raised_by: string;
  reason: string;
  description: string;
  desired_outcome?: string;
  evidence_links?: string[];
  milestone_index?: number;
}

export const disputeService = {
  /**
   * Raise a new dispute against a contract.
   */
  async raiseDispute(input: DisputeInput): Promise<{ success: boolean; dispute?: DisputeCase; error?: string }> {
    try {
      // Get contract details to extract client/freelancer IDs
      const { data: contract } = await supabase
        .from('contracts')
        .select('client_id, freelancer_id')
        .eq('id', input.contract_id)
        .single();

      if (!contract) {
        return { success: false, error: 'Contract not found' };
      }

      const { data, error } = await supabase
        .from('disputes' as any)
        .insert({
          contract_id: input.contract_id,
          client_id: contract.client_id,
          freelancer_id: contract.freelancer_id,
          raised_by: input.raised_by,
          reason: input.reason,
          description: input.description,
          status: 'pending',
          amount: 0,
        })
        .select()
        .single();

      if (error) throw error;
      return { success: true, dispute: data as unknown as DisputeCase };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to raise dispute';
      return { success: false, error: msg };
    }
  },

  /**
   * Get disputes where the user is involved (as client or freelancer).
   */
  async getUserDisputes(userId: string): Promise<DisputeCase[]> {
    try {
      const { data, error } = await supabase
        .from('disputes')
        .select('*')
        .or(`client_id.eq.${userId},freelancer_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as DisputeCase[];
    } catch (error) {
      console.error('Error fetching disputes:', error);
      return [];
    }
  },

  /**
   * Get a single dispute with contract details.
   */
  async getDisputeWithContract(disputeId: string): Promise<{
    dispute: DisputeCase | null;
    contract?: Record<string, unknown>;
  }> {
    try {
      const { data, error } = await supabase
        .from('disputes')
        .select('*, contract:contracts(*, project:projects(*), client:profiles!contracts_client_id_fkey(*), freelancer:profiles!contracts_freelancer_id_fkey(*))')
        .eq('id', disputeId)
        .single();

      if (error) throw error;

      const dispute = data as unknown as DisputeCase;
      const contract = (data as Record<string, unknown>)?.contract as Record<string, unknown>;

      return { dispute, contract };
    } catch (error) {
      console.error('Error fetching dispute:', error);
      return { dispute: null };
    }
  },

  /**
   * Admin: Update dispute status.
   */
  async adminUpdateDispute(
    disputeId: string,
    status: 'pending' | 'under_review' | 'resolved' | 'escalated' | 'dismissed',
    resolution?: string,
    resolvedBy?: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const updates = {
        status,
        resolved_at: (status === 'resolved' || status === 'dismissed') ? new Date().toISOString() : null,
        resolved_by: resolvedBy || null,
      };

      const { error } = await supabase
        .from('disputes')
        .update(updates)
        .eq('id', disputeId);

      if (error) throw error;
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to update dispute';
      return { success: false, error: msg };
    }
  },

  /**
   * Admin: Get all disputes with optional status filter.
   */
  async getAllDisputes(status?: string): Promise<DisputeCase[]> {
    try {
      let query = supabase
        .from('disputes')
        .select('*')
        .order('created_at', { ascending: false });

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as DisputeCase[];
    } catch (error) {
      console.error('Error fetching all disputes:', error);
      return [];
    }
  },

  /**
   * Send a message to a dispute thread via separate messages table.
   */
  async addMessage(
    disputeId: string,
    userId: string,
    message: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Look up the contract_id from the dispute first
      const { data: dispute, error: disputeLookupError } = await supabase
        .from('disputes')
        .select('contract_id')
        .eq('id', disputeId)
        .single();

      if (disputeLookupError || !dispute?.contract_id) {
        throw new Error('Dispute or associated contract not found');
      }

      const { error } = await supabase
        .from('messages' as any)
        .insert({
          sender_id: userId,
          content: message,
          contract_id: dispute.contract_id,
          dispute_id: disputeId,
        });

      if (error) throw error;
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to add message';
      return { success: false, error: msg };
    }
  },

  /**
   * Subscribe to real-time changes for a specific dispute (detail view).
   */
  subscribe(disputeId: string, callback: (dispute: DisputeCase) => void) {
    const channel = supabase
      .channel(`dispute-detail-${disputeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'disputes',
          filter: `id=eq.${disputeId}`,
        },
        (payload) => {
          callback(payload.new as DisputeCase);
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * Subscribe to all disputes involving a user (list view).
   * Re-calls callback whenever any dispute for this user changes.
   */
  subscribeUserDisputes(userId: string, callback: () => void) {
    const channel = supabase
      .channel(`user-disputes-${userId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'disputes',
        filter: `client_id=eq.${userId}`,
      }, callback)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'disputes',
        filter: `freelancer_id=eq.${userId}`,
      }, callback)
      .subscribe();

    return channel;
  },
};
