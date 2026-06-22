/**
 * Connects / Bidding Credits System
 *
 * Freelancers spend Connects to submit proposals.
 * - Free plan: 10 Connects/month
 * - Pro plan: 50 Connects/month
 * - Cost per proposal: 2 Connects (standard), 5 Connects (boosted)
 */

import { supabase } from './supabase';

export interface ConnectsBalance {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  monthlyAllowance: number;
  planType: 'free' | 'pro';
  resetsAt: string;
}

export interface ConnectsTransaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'earned' | 'spent' | 'bonus' | 'monthly_grant';
  description: string;
  reference_id: string | null;
  created_at: string;
}

const PROPOSAL_COST = 2;
const BOOSTED_PROPOSAL_COST = 5;
const FREE_MONTHLY_ALLOWANCE = 10;
const PRO_MONTHLY_ALLOWANCE = 50;

export const connectsService = {
  /**
   * Get current Connects balance for a user.
   */
  async getBalance(userId: string): Promise<ConnectsBalance> {
    try {
      // Check if user has Pro subscription
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('plan_id, status, subscription_plans(name)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();

      const planName = (sub?.subscription_plans as any)?.name?.toLowerCase() || '';
      const isPro = planName.includes('pro') || planName.includes('premium');
      const monthlyAllowance = isPro ? PRO_MONTHLY_ALLOWANCE : FREE_MONTHLY_ALLOWANCE;

      // Get total earned and spent from transactions
      const { data: transactions } = await supabase
        .from('connects_transactions')
        .select('amount, type')
        .eq('user_id', userId);

      let totalEarned = 0;
      let totalSpent = 0;

      if (transactions) {
        for (const tx of transactions as unknown as ConnectsTransaction[]) {
          if (tx.amount > 0) totalEarned += tx.amount;
          else totalSpent += Math.abs(tx.amount);
        }
      }

      // Check if this month's allowance was already granted
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: monthlyGrant } = await supabase
        .from('connects_transactions')
        .select('amount')
        .eq('user_id', userId)
        .eq('type', 'monthly_grant')
        .gte('created_at', monthStart)
        .single();

      // If no grant yet this month, add allowance to current balance
      const hasGrantThisMonth = !!monthlyGrant;
      const balance = totalEarned - totalSpent + (hasGrantThisMonth ? 0 : monthlyAllowance);
      const nextReset = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      return {
        balance: Math.max(0, balance),
        totalEarned,
        totalSpent,
        monthlyAllowance,
        planType: isPro ? 'pro' : 'free',
        resetsAt: nextReset,
      };
    } catch {
      return {
        balance: FREE_MONTHLY_ALLOWANCE,
        totalEarned: FREE_MONTHLY_ALLOWANCE,
        totalSpent: 0,
        monthlyAllowance: FREE_MONTHLY_ALLOWANCE,
        planType: 'free',
        resetsAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
      };
    }
  },

  /**
   * Check if user has enough Connects for an action.
   */
  async canAfford(userId: string, type: 'proposal' | 'boosted_proposal'): Promise<{ allowed: boolean; balance: number; cost: number }> {
    const balance = await this.getBalance(userId);
    const cost = type === 'boosted_proposal' ? BOOSTED_PROPOSAL_COST : PROPOSAL_COST;
    return {
      allowed: balance.balance >= cost,
      balance: balance.balance,
      cost,
    };
  },

  /**
   * Deduct Connects for a proposal submission.
   */
  async deductForProposal(userId: string, proposalId: string, isBoosted: boolean = false): Promise<{ success: boolean; error?: string; newBalance?: number }> {
    const cost = isBoosted ? BOOSTED_PROPOSAL_COST : PROPOSAL_COST;
    const check = await this.canAfford(userId, isBoosted ? 'boosted_proposal' : 'proposal');

    if (!check.allowed) {
      return { success: false, error: `Insufficient Connects. You need ${cost} Connects but have ${check.balance}.` };
    }

    try {
      const { error } = await supabase.from('connects_transactions').insert({
        user_id: userId,
        amount: -cost,
        type: 'spent',
        description: isBoosted ? 'Boosted proposal submission' : 'Proposal submission',
        reference_id: proposalId,
      });

      if (error) throw error;

      return { success: true, newBalance: check.balance - cost };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to deduct Connects' };
    }
  },

  /**
   * Grant monthly Connects allowance.
   */
  async grantMonthlyAllowance(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if already granted this month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: existing } = await supabase
        .from('connects_transactions')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'monthly_grant')
        .gte('created_at', monthStart)
        .single();

      if (existing) return { success: true }; // Already granted

      const balance = await this.getBalance(userId);
      const allowance = balance.monthlyAllowance;

      const { error } = await supabase.from('connects_transactions').insert({
        user_id: userId,
        amount: allowance,
        type: 'monthly_grant',
        description: `Monthly ${balance.planType} allowance`,
      });

      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to grant allowance' };
    }
  },

  /**
   * Get transaction history for a user.
   */
  async getTransactions(userId: string, limit: number = 50): Promise<ConnectsTransaction[]> {
    const { data, error } = await supabase.from('connects_transactions')
        .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return (data || []) as unknown as ConnectsTransaction[];
  },

  /** Constants for UI display */
  PROPOSAL_COST,
  BOOSTED_PROPOSAL_COST,
  FREE_MONTHLY_ALLOWANCE,
  PRO_MONTHLY_ALLOWANCE,
};
