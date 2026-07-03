// Withdrawal Service
// Handles withdrawal requests and wallet/payout method operations
// PayPal-only withdrawal method

import { supabase, dbFunctions } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://zttwsjehcgaicziqyxpq.supabase.co';

export interface WithdrawalRequest {
  amount: number;
  method: 'paypal' | 'razorpay_payout';
  paypal_email?: string;
  /** For razorpay_payout: the bank account or UPI fund account ID */
  fund_account_id?: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  method: 'paypal' | 'razorpay_payout';
  paypal_email: string | null;
  /** For razorpay_payout: Razorpay payout ID */
  razorpay_payout_id?: string | null;
  /** For razorpay_payout: linked fund account ID (DB column: razorpay_fund_account_id) */
  fund_account_id?: string | null;
  razorpay_fund_account_id?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  paypal_payout_id: string | null;
  failure_reason: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PayoutMethod {
  id: string;
  user_id: string;
  type: string;
  email: string | null;
  phone: string | null;
  account_holder_name: string | null;
  account_number: string | null;
  routing_number: string | null;
  bank_name: string | null;
  /** IFSC code for Indian bank transfers */
  ifsc_code: string | null;
  /** UPI ID for Indian payments */
  upi_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletBalance {
  balance: number;
  pending_balance: number;
  currency: string;
}

export interface TransactionHistoryOptions {
  limit?: number;
  offset?: number;
}

export interface TransactionHistoryResult {
  withdrawals: Withdrawal[];
  walletBalance: WalletBalance | null;
}

export const withdrawalService = {
  // ============================================================
  // Wallet Balance
  // ============================================================

  /** Fetch the current wallet balance for the authenticated user */
  async getWalletBalance(): Promise<{ success: boolean; balance?: WalletBalance; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data, error } = await dbFunctions.getWalletBalance(session.user.id);
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, balance: data as unknown as WalletBalance };
    } catch (error) {
      console.error('Get wallet balance error:', error);
      return { success: false, error: 'Failed to fetch wallet balance' };
    }
  },

  // ============================================================
  // Withdrawals
  // ============================================================

  /** Create a new withdrawal request — holds wallet funds first, then creates the withdrawal record */
  async createWithdrawal(request: WithdrawalRequest): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      // 1. Hold the funds in the wallet (balance → pending_balance)
      const { error: holdError } = await dbFunctions.holdWalletFunds(session.user.id, request.amount);
      if (holdError) {
        return { success: false, error: `Failed to hold funds: ${holdError.message}` };
      }

      // 2. Create the withdrawal record with net_amount (amount minus fee; fee defaults to 0 for new records)
      const { data, error } = await (supabase
        .from('withdrawals') as any)
        .insert({
          user_id: session.user.id,
          amount: request.amount,
          net_amount: request.amount,
          fee: 0,
          method: request.method,
          paypal_email: request.paypal_email,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        // Rollback: release the held funds if withdrawal creation fails
        // Use try/catch since PostgrestBuilder does not expose .catch()
        try {
          await dbFunctions.releaseWalletFunds(session.user.id, request.amount);
        } catch (_rollbackErr) {
          console.error('Failed to rollback held funds after withdrawal creation error:', _rollbackErr);
        }
        return { success: false, error: error.message };
      }

      return { success: true, withdrawal: data as Withdrawal };
    } catch (error) {
      console.error('Withdrawal error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return { success: false, error: errorMessage };
    }
  },

  /** Get withdrawal history via the edge function */
  async getWithdrawals(): Promise<Withdrawal[]> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return [];
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/withdrawal`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error('Failed to fetch withdrawals:', data.error);
        return [];
      }

      return data.withdrawals || [];
    } catch (error) {
      console.error('Fetch withdrawals error:', error);
      return [];
    }
  },

  /** Cancel a pending withdrawal — uses the cancel_withdrawal RPC to move funds back to balance */
  async cancelWithdrawal(withdrawalId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { error } = await dbFunctions.cancelWithdrawal(withdrawalId, session.user.id);
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Cancel withdrawal error:', error);
      return { success: false, error: 'Failed to cancel withdrawal' };
    }
  },

  /** Subscribe to real-time withdrawal updates */
  subscribeToWithdrawals(userId: string, callback: (withdrawal: Withdrawal) => void) {
    const channel = (supabase as any)
      .channel('withdrawals-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'withdrawals',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            callback(payload.new as Withdrawal);
          }
        }
      )
      .subscribe();

    return channel;
  },

  // ============================================================
  // Payout Methods
  // ============================================================

  /** Get all payout methods for the authenticated user */
  async getPayoutMethods(): Promise<{ success: boolean; methods?: PayoutMethod[]; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data, error } = await dbFunctions.getPayoutMethods(session.user.id);
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, methods: (data || []) as unknown as PayoutMethod[] };
    } catch (error) {
      console.error('Get payout methods error:', error);
      return { success: false, error: 'Failed to fetch payout methods' };
    }
  },

  /** Add a new payout method (flat fields matching the payout_methods table schema) */
  async addPayoutMethod(data: {
    type: 'paypal' | 'bank_transfer' | 'stripe';
    email?: string | null;
    phone?: string | null;
    account_holder_name?: string | null;
    account_number?: string | null;
    routing_number?: string | null;
    bank_name?: string | null;
    is_default?: boolean;
  }): Promise<{ success: boolean; method?: PayoutMethod; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { data: newMethod, error } = await (supabase
        .from('payout_methods') as any)
        .insert({
          user_id: session.user.id,
          type: data.type,
          email: data.email ?? null,
          phone: data.phone ?? null,
          account_holder_name: data.account_holder_name ?? null,
          account_number: data.account_number ?? null,
          routing_number: data.routing_number ?? null,
          bank_name: data.bank_name ?? null,
          is_default: data.is_default ?? false,
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, method: newMethod as unknown as PayoutMethod };
    } catch (error) {
      console.error('Add payout method error:', error);
      return { success: false, error: 'Failed to add payout method' };
    }
  },

  /** Set a payout method as the default */
  async setDefaultPayoutMethod(methodId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { error } = await dbFunctions.setDefaultPayoutMethod(methodId, session.user.id);
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Set default payout method error:', error);
      return { success: false, error: 'Failed to set default payout method' };
    }
  },

  /** Delete a payout method */
  async deletePayoutMethod(methodId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const { error } = await dbFunctions.deletePayoutMethod(methodId, session.user.id);
      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (error) {
      console.error('Delete payout method error:', error);
      return { success: false, error: 'Failed to delete payout method' };
    }
  },

  // ============================================================
  // Transaction History (with wallet context)
  // ============================================================

  /** Get withdrawal history with a wallet balance snapshot */
  async getTransactionHistory(options?: TransactionHistoryOptions): Promise<{
    success: boolean;
    result?: TransactionHistoryResult;
    error?: string;
  }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const limit = options?.limit ?? 20;
      const offset = options?.offset ?? 0;

      // Fetch withdrawals and wallet balance in parallel
      const [withdrawalsResult, balanceResult] = await Promise.all([
        (supabase
          .from('withdrawals')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false }) as any)
          .range(offset, offset + limit - 1),
        dbFunctions.getWalletBalance(session.user.id),
      ]);

      if (withdrawalsResult.error) {
        return { success: false, error: withdrawalsResult.error.message };
      }

      return {
        success: true,
        result: {
          withdrawals: (withdrawalsResult.data || []) as Withdrawal[],
          walletBalance: balanceResult.data as unknown as WalletBalance | null,
        },
      };
    } catch (error) {
      console.error('Get transaction history error:', error);
      return { success: false, error: 'Failed to fetch transaction history' };
    }
  },
};