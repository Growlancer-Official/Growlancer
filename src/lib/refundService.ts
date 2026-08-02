// Refund, Cancellation & Dispute Service
// Typed data-access + RPC wrappers for the refund/dispute resolution system.
// Backed by migration 20260921000000_refund_dispute_system.sql
import { supabase } from './supabase';

// ────────────────────────────────────────────────────────────────
// Types (mirror the DB schema)
// ────────────────────────────────────────────────────────────────
export type RefundRequestStatus =
  | 'pending_freelancer'
  | 'pending_admin'
  | 'auto_approved'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'completed'
  | 'failed';

export type RefundRequestType =
  | 'client_cancel_before_work'
  | 'freelancer_decline'
  | 'client_cancel_after_start'
  | 'milestone_cancel'
  | 'payment_failure'
  | 'duplicate_payment'
  | 'quality_dispute'
  | 'fraud'
  | 'abuse'
  | 'contract_violation'
  | 'admin_decision';

export interface RefundRequest {
  id: string;
  contract_id: string;
  milestone_index: number | null;
  requested_by: string;
  requested_to: string | null;
  request_type: RefundRequestType;
  reason: string;
  description: string | null;
  refund_amount: number;
  status: RefundRequestStatus;
  decision_by: string | null;
  decision_at: string | null;
  decided_amount: number | null;
  provider_refund_id: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefundHistoryEvent {
  id: string;
  refund_request_id: string;
  event: string;
  actor_id: string | null;
  actor_role: string | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface RefundRecord {
  id: string;
  refund_request_id: string | null;
  contract_id: string | null;
  provider: string;
  provider_refund_id: string | null;
  provider_payment_id: string | null;
  amount: number;
  currency: string;
  status: 'initiated' | 'processing' | 'completed' | 'failed' | 'retry_pending';
  retry_count: number;
  last_error: string | null;
  timeline: Array<{ event: string; at: string; [k: string]: unknown }> | null;
  created_at: string;
  updated_at: string;
}

export interface DisputeMessage {
  id: string;
  dispute_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender?: { id: string; full_name: string; name?: string; avatar_url?: string | null } | null;
}

export interface DisputeEvidence {
  id: string;
  dispute_id: string;
  uploader_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  file_size: number | null;
  created_at: string;
}

export interface DisputeInternalNote {
  id: string;
  dispute_id: string;
  admin_id: string;
  note: string;
  created_at: string;
  admin?: { id: string; full_name: string; name?: string } | null;
}

// ────────────────────────────────────────────────────────────────
// RPC result helpers
// ────────────────────────────────────────────────────────────────
type RpcResult<T> = { success: boolean; error?: string; data?: T };

function unwrapError(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong';
}

// ────────────────────────────────────────────────────────────────
// Refund request state machine (client)
// ────────────────────────────────────────────────────────────────
export const refundService = {
  /**
   * Client requests a refund / cancellation on a contract.
   * - Before work starts → auto_approved (100% refund, no fee)
   * - After work started → pending_freelancer (freelancer must accept/reject)
   */
  async requestRefund(
    contractId: string,
    reason: string,
    description?: string
  ): Promise<RpcResult<{ request_id: string; request_type: string; refund_amount: number; status: string }>> {
    try {
      const { data, error } = await supabase.rpc('request_contract_refund' as any, {
        p_contract_id: contractId,
        p_reason: reason,
        p_description: description || null,
        p_milestone_index: null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } & { request_id: string; request_type: string; refund_amount: number; status: string };
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /**
   * Freelancer responds to a client's cancellation request.
   * accept=true → remaining escrow refunded to client.
   * accept=false → automatic dispute.
   */
  async respondToCancellation(
    refundRequestId: string,
    accept: boolean
  ): Promise<RpcResult<{ action: string; refund_amount?: number; dispute_id?: string; status: string }>> {
    try {
      const { data, error } = await supabase.rpc('respond_cancellation_request' as any, {
        p_refund_request_id: refundRequestId,
        p_accept: accept,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } & { action: string; refund_amount?: number; dispute_id?: string; status: string };
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /** Freelancer declines the project before starting work → automatic refund. */
  async freelancerDecline(contractId: string): Promise<RpcResult<{ request_id: string; refund_amount: number; status: string }>> {
    try {
      const { data, error } = await supabase.rpc('freelancer_decline_contract' as any, {
        p_contract_id: contractId,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } & { request_id: string; refund_amount: number; status: string };
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /** Freelancer marks that they have started working (flips Case 1 → Case 3). */
  async markStarted(contractId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('mark_freelancer_started' as any, { p_contract_id: contractId });
      if (error) throw error;
      return { success: true };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  // ── Reads ────────────────────────────────────────────────────
  /** All refund requests for a contract (newest first). */
  async getRefundRequests(contractId: string): Promise<RefundRequest[]> {
    const { data, error } = await supabase
      .from('refund_requests' as any)
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data || []) as unknown as RefundRequest[];
  },

  /** Immutable timeline events for a refund request (oldest first). */
  async getRefundHistory(refundRequestId: string): Promise<RefundHistoryEvent[]> {
    const { data, error } = await supabase
      .from('refund_history' as any)
      .select('*')
      .eq('refund_request_id', refundRequestId)
      .order('created_at', { ascending: true });
    if (error) return [];
    return (data || []) as unknown as RefundHistoryEvent[];
  },

  /** Provider refund records for a contract. */
  async getRefunds(contractId: string): Promise<RefundRecord[]> {
    const { data, error } = await supabase
      .from('refunds' as any)
      .select('*')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data || []) as unknown as RefundRecord[];
  },

  // ── Dispute conversation ─────────────────────────────────────
  async getDisputeMessages(disputeId: string): Promise<DisputeMessage[]> {
    const { data, error } = await supabase
      .from('dispute_messages' as any)
      .select('*, sender:sender_id(id, full_name, name)')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: true });
    if (error) return [];
    return (data || []) as unknown as DisputeMessage[];
  },

  async sendDisputeMessage(disputeId: string, message: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('send_dispute_message' as any, {
        p_dispute_id: disputeId,
        p_message: message,
      });
      if (error) throw error;
      return { success: true };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  async getDisputeEvidence(disputeId: string): Promise<DisputeEvidence[]> {
    const { data, error } = await supabase
      .from('dispute_evidence' as any)
      .select('*')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: false });
    if (error) return [];
    return (data || []) as unknown as DisputeEvidence[];
  },

  /** Register an uploaded evidence file against a dispute. */
  async attachEvidence(params: {
    disputeId: string;
    fileName: string;
    fileUrl: string;
    mimeType?: string;
    fileSize?: number;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('attach_dispute_evidence' as any, {
        p_dispute_id: params.disputeId,
        p_file_name: params.fileName,
        p_file_url: params.fileUrl,
        p_mime_type: params.mimeType || null,
        p_file_size: params.fileSize || null,
      });
      if (error) throw error;
      return { success: true };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /** Party may appeal a decided dispute. */
  async appealDispute(disputeId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await supabase.rpc('appeal_dispute' as any, {
        p_dispute_id: disputeId,
        p_reason: reason,
      });
      if (error) throw error;
      return { success: true };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  // ── Admin actions ────────────────────────────────────────────
  /**
   * Admin decides a dispute.
   * decision: 'client_refund' | 'freelancer_release' | 'split' | 'dismiss'
   * clientAmount: for split — amount to refund the client.
   */
  async adminDecide(
    disputeId: string,
    decision: 'client_refund' | 'freelancer_release' | 'split' | 'dismiss',
    clientAmount?: number,
    note?: string
  ): Promise<RpcResult<{ dispute_id: string; decision: string; status: string }>> {
    try {
      const { data, error } = await supabase.rpc('admin_decide_dispute' as any, {
        p_dispute_id: disputeId,
        p_decision: decision,
        p_client_amount: clientAmount ?? null,
        p_note: note || null,
      });
      if (error) throw error;
      const result = data as { success: boolean; error?: string } & { dispute_id: string; decision: string; status: string };
      if (!result.success) return { success: false, error: result.error };
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /** Admin freezes a contract + wallets (fraud / abuse). */
  async freezeContract(contractId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('freeze_contract' as any, {
        p_contract_id: contractId,
        p_reason: reason,
      });
      if (error) throw error;
      return { success: data as boolean };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  async unfreezeContract(contractId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('unfreeze_contract' as any, {
        p_contract_id: contractId,
      });
      if (error) throw error;
      return { success: data as boolean };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  /** Admin assigns a dispute to an admin (marks investigating). */
  async adminAssign(disputeId: string, adminId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('admin_assign_dispute' as any, {
        p_dispute_id: disputeId,
        p_admin_id: adminId,
      });
      if (error) throw error;
      return { success: data as boolean };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  async adminAddInternalNote(disputeId: string, note: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data, error } = await supabase.rpc('admin_add_internal_note' as any, {
        p_dispute_id: disputeId,
        p_note: note,
      });
      if (error) throw error;
      return { success: data as boolean };
    } catch (e) {
      return { success: false, error: unwrapError(e) };
    }
  },

  async getInternalNotes(disputeId: string): Promise<DisputeInternalNote[]> {
    const { data, error } = await supabase
      .from('dispute_internal_notes' as any)
      .select('*, admin:admin_id(id, full_name, name)')
      .eq('dispute_id', disputeId)
      .order('created_at', { ascending: true });
    if (error) return [];
    return (data || []) as unknown as DisputeInternalNote[];
  },
};
