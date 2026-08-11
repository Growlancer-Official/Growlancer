// Extra Revision Service
// Typed data-access + RPC wrappers for the paid extra-revision workflow
// (revision_requests table + request/respond/mark-paid RPCs).

import { supabase } from './supabase';
import type { Tables } from '../types/supabase';

export type RevisionRequest = Tables<'revision_requests'>;

export interface RpcResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

function unwrapError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Something went wrong';
}

export const revisionService = {
  /**
   * Client requests N extra revisions beyond the free included ones.
   */
  async requestExtraRevision(
    contractId: string,
    revisionCount: number,
    reason: string
  ): Promise<RpcResult<{
    request_id: string;
    revision_count: number;
    per_revision_price: number;
    total_amount: number;
    status: string;
  }>> {
    try {
      const { data, error } = await (supabase.rpc as any)('request_extra_revision', {
        p_contract_id: contractId,
        p_revision_count: revisionCount,
        p_reason: reason,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } & {
        request_id: string;
        revision_count: number;
        per_revision_price: number;
        total_amount: number;
        status: string;
      };
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /**
   * Freelancer accepts (with optional per-revision price) or rejects.
   */
  async respondToExtraRevision(
    requestId: string,
    accept: boolean,
    perRevisionPrice?: number
  ): Promise<RpcResult<{ action: string; total_amount?: number; status: string }>> {
    try {
      const { data, error } = await (supabase.rpc as any)('respond_extra_revision', {
        p_request_id: requestId,
        p_accept: accept,
        p_per_revision_price: perRevisionPrice ?? null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } & {
        action: string;
        total_amount?: number;
        status: string;
      };
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /**
   * Get revision requests for a contract (participants only — RLS).
   */
  async getForContract(contractId: string): Promise<RevisionRequest[]> {
    try {
      const { data, error } = await (supabase
        .from('revision_requests') as any)
        .select('*')
        .eq('contract_id', contractId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as RevisionRequest[];
    } catch (e) {
      console.error('Error fetching revision requests:', e);
      return [];
    }
  },

  /**
   * Subscribe to revision_requests changes for a contract (realtime).
   */
  subscribeToContract(contractId: string, callback: () => void): { channel: any } {
    const channel = supabase
      .channel(`revision-requests-${contractId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'revision_requests',
          filter: `contract_id=eq.${contractId}`,
        },
        () => {
          callback();
        }
      )
      .subscribe();
    return { channel };
  },
};
