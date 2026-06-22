/**
 * End-to-end workflow helpers: PROJECT → PROPOSAL → CONTRACT → WORKSPACE → PAYMENT
 * Prefer these over ad-hoc status updates so client + freelancer dashboards stay connected.
 */
import { contractsService, invitesService, proposalsService } from './dataService';
import { dbFunctions, supabase } from './supabase';

export type HireFromProposalResult =
  | { success: true; contractId: string }
  | { success: false; error: string };

/** Accept proposal and create contract (+ escrow shell via RPC when available). */
export async function hireFreelancerFromProposal(
  proposalId: string,
  clientId: string,
  options?: { useEscrowRpc?: boolean }
): Promise<HireFromProposalResult> {
  if (options?.useEscrowRpc) {
    const { data: proposal, error: loadErr } = await supabase
      .from('proposals')
      .select('project_id, freelancer_id, proposed_rate')
      .eq('id', proposalId)
      .single();

    if (loadErr || !proposal) {
      return { success: false, error: loadErr?.message || 'Proposal not found' };
    }

    const amount = Math.round(Number(proposal.proposed_rate ?? 0));
    const { data, error } = await dbFunctions.createContractWithEscrow({
      p_project_id: proposal.project_id,
      p_freelancer_id: proposal.freelancer_id,
      p_proposal_id: proposalId,
      p_amount: amount,
      p_client_id: clientId,
    });

    if (error) {
      const fallback = await contractsService.createFromProposal(proposalId, clientId);
      if (!fallback.success || !fallback.data) {
        return { success: false, error: error.message || fallback.error || 'Failed to create contract' };
      }
      return { success: true, contractId: fallback.data.id };
    }

    const resData = data as any;
    const contractId =
      resData && typeof resData === 'object' && 'contract_id' in resData
        ? String(resData.contract_id)
        : typeof resData === 'string'
          ? resData
          : '';

    if (!contractId) {
      const fallback = await contractsService.createFromProposal(proposalId, clientId);
      if (!fallback.success || !fallback.data) {
        return { success: false, error: 'Contract created but id missing' };
      }
      return { success: true, contractId: fallback.data.id };
    }

    return { success: true, contractId };
  }

  const result = await contractsService.createFromProposal(proposalId, clientId);
  if (!result.success || !result.data) {
    return { success: false, error: result.error || 'Failed to create contract' };
  }
  return { success: true, contractId: result.data.id };
}

export async function inviteFreelancerToProject(
  clientId: string,
  projectId: string,
  freelancerId: string,
  message?: string
): Promise<{ success: boolean; error?: string }> {
  const ok = await invitesService.create(clientId, projectId, freelancerId, message);
  if (!ok) return { success: false, error: 'Could not send invite (duplicate or permission denied)' };
  return { success: true };
}

export async function rejectProposal(proposalId: string): Promise<boolean> {
  return proposalsService.reject(proposalId);
}
