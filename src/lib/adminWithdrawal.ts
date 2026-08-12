// Admin Commission Withdrawal Service
// Lets Growlancer admins see the 5% commission ledger in real time and
// withdraw it to their own bank account via the admin-withdrawal edge
// function (RazorpayX payout). Bank limits: min ₹100 · max ₹5,00,000.

import { supabase, uniqueChannelName } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface AdminCommissionBalance {
  total_commission: number;
  withdrawn: number;
  available_balance: number;
  this_month: number;
  min_withdrawal: number;
  max_withdrawal: number;
}

export interface AdminWithdrawal {
  id: string;
  amount: number;
  fee: number;
  net_amount: number;
  method: 'bank' | 'upi';
  account_holder_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  bank_name: string | null;
  upi_id: string | null;
  razorpay_fund_account_id: string | null;
  razorpay_payout_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  failure_reason: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAdminWithdrawalRequest {
  amount: number;
  method: 'bank' | 'upi';
  account_holder_name?: string;
  account_number?: string;
  ifsc_code?: string;
  bank_name?: string;
  upi_id?: string;
}

export const adminWithdrawalService = {
  /** Fetch the admin's commission balance (total, withdrawn, available). */
  async getBalance(): Promise<{ success: boolean; balance?: AdminCommissionBalance; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false, error: 'Not authenticated' };
      const { data, error } = await supabase.rpc('get_admin_commission_balance' as any);
      if (error) return { success: false, error: error.message };
      return { success: true, balance: data as unknown as AdminCommissionBalance };
    } catch (error) {
      console.error('Get admin commission balance error:', error);
      return { success: false, error: 'Failed to fetch commission balance' };
    }
  },

  /** Create a commission withdrawal through the edge function. */
  async createWithdrawal(request: CreateAdminWithdrawalRequest): Promise<{
    success: boolean;
    withdrawal?: AdminWithdrawal;
    queued?: boolean;
    error?: string;
  }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-withdrawal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data?.error || 'Failed to process withdrawal' };
      }
      return {
        success: true,
        queued: data?.queued === true,
        withdrawal: data?.withdrawal as AdminWithdrawal,
      };
    } catch (error) {
      console.error('Admin withdrawal error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Network error' };
    }
  },

  /** Get withdrawal history + fresh balance snapshot. */
  async getHistory(): Promise<{
    success: boolean;
    balance?: AdminCommissionBalance;
    withdrawals?: AdminWithdrawal[];
    error?: string;
  }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return { success: false, error: 'Not authenticated' };

      const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-withdrawal`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        return { success: false, error: data?.error || 'Failed to fetch withdrawals' };
      }
      return {
        success: true,
        balance: data?.balance as AdminCommissionBalance,
        withdrawals: (data?.withdrawals || []) as AdminWithdrawal[],
      };
    } catch (error) {
      console.error('Fetch admin withdrawals error:', error);
      return { success: false, error: 'Failed to fetch withdrawal history' };
    }
  },

  /** Subscribe to real-time admin withdrawal + commission updates. */
  subscribe(onUpdate: () => void): () => void {
    const channel = supabase
      .channel(uniqueChannelName('admin-withdrawals-live'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_withdrawals' }, () => onUpdate())
      .subscribe();
    return () => { channel.unsubscribe(); };
  },
};
