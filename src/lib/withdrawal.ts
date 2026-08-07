// Withdrawal Service
// Handles withdrawal requests and wallet/payout method operations
// Withdrawals in INR are paid via Cashfree Payouts; PayPal is Coming Soon.

import { supabase, dbFunctions } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

export interface WithdrawalRequest {
  amount: number;
  method: 'paypal' | 'cashfree_payout';
  paypal_email?: string;
  /** For cashfree_payout: the user's payout_method id — server resolves the Cashfree beneficiary */
  payout_method_id?: string;
  /** For cashfree_payout: 'UPI' | 'bank' (defaults to 'UPI' server-side) */
  payout_mode?: string;
}

export interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  fee: number;
  net_amount: number;
  method: 'paypal' | 'cashfree_payout';
  paypal_email: string | null;
  /** For cashfree_payout: Cashfree payout ID */
  cashfree_payout_id?: string | null;
  /** For cashfree_payout: linked Cashfree beneficiary ID (DB column: cashfree_beneficiary_id) */
  cashfree_beneficiary_id?: string | null;
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
  /** Cashfree beneficiary ID (created server-side via create_beneficiary) */
  cashfree_beneficiary_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface WalletBalance {
  balance: number;
  pending_balance: number;
  /** Funds currently held in escrow on the client side */
  escrow_balance?: number;
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

  /**
   * Create a withdrawal request.
   *
   * ⚠️ FIX: this previously held wallet funds + inserted a `withdrawals` row
   * directly with fee 0 — it NEVER called the payout edge function, so no real
   * Cashfree/PayPal payout ever fired (withdrawals sat 'pending' until the
   * stale-withdrawal cron failed them after 72h and returned the funds). Now we
   * route through the `withdrawal` edge function POST, which validates the balance
   * + amount server-side, computes the fee, holds funds, executes the actual payout
   * API call, and rolls back on failure.
   */
  async createWithdrawal(request: WithdrawalRequest): Promise<{ success: boolean; withdrawal?: Withdrawal; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      // Map frontend field names to the edge function's expected API
      // (frontend `method` → edge `withdrawal_method`).
      const isCashfree = request.method === 'cashfree_payout';
      const body: Record<string, unknown> = {
        amount: request.amount,
        withdrawal_method: request.method,
        payout_mode: isCashfree ? (request.payout_mode || 'UPI') : undefined,
      };
      if (isCashfree) {
        body.payout_method_id = request.payout_method_id;
      } else {
        body.paypal_email = request.paypal_email;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/withdrawal`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Withdrawal edge function error:', data?.error);
        return { success: false, error: data?.error || 'Failed to process withdrawal' };
      }

      return { success: true, withdrawal: (data?.withdrawal ?? data) as Withdrawal };
    } catch (error) {
      console.error('Withdrawal error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
      return { success: false, error: errorMessage };
    }
  },

  /** Get withdrawal history via the edge function */
  async getWithdrawals(): Promise<{ success: boolean; withdrawals?: Withdrawal[]; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
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
        return { success: false, error: data.error || 'Failed to fetch withdrawals' };
      }

      return { success: true, withdrawals: data.withdrawals || [] };
    } catch (error) {
      console.error('Fetch withdrawals error:', error);
      return { success: false, error: 'Network error fetching withdrawals' };
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
    const channel = supabase
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
    type: 'upi' | 'bank' | 'bank_transfer' | 'paypal';
    email?: string | null;
    phone?: string | null;
    account_holder_name?: string | null;
    account_number?: string | null;
    routing_number?: string | null;
    bank_name?: string | null;
    ifsc_code?: string | null;
    upi_id?: string | null;
    is_default?: boolean;
  }): Promise<{ success: boolean; method?: PayoutMethod; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      // Normalize the method type to the production CHECK constraint:
      // ('paypal', 'bank', 'crypto', 'upi')
      const normalizedType =
        data.type === 'bank_transfer' ? 'bank' : data.type;

      // Production `details` JSONB is NOT NULL — mirror the flat fields so
      // inserts never violate the constraint.
      const details: Record<string, unknown> = {
        email: data.email ?? null,
        phone: data.phone ?? null,
        account_holder_name: data.account_holder_name ?? null,
        account_number: data.account_number ?? null,
        routing_number: data.routing_number ?? null,
        bank_name: data.bank_name ?? null,
        ifsc_code: data.ifsc_code ?? null,
        upi_id: data.upi_id ?? null,
      };

      const { data: newMethod, error } = await supabase
        .from('payout_methods' as any)
        .insert({
          user_id: session.user.id,
          type: normalizedType,
          email: data.email ?? null,
          phone: data.phone ?? null,
          account_holder_name: data.account_holder_name ?? null,
          account_number: data.account_number ?? null,
          routing_number: data.routing_number ?? null,
          bank_name: data.bank_name ?? null,
          ifsc_code: data.ifsc_code ?? null,
          upi_id: data.upi_id ?? null,
          details,
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

  /**
   * Link a UPI/bank payout method to a Cashfree beneficiary.
   * Creates the Cashfree Payouts beneficiary server-side and stores the returned
   * beneficiary_id on the payout_methods row so payouts always use a real
   * beneficiary (never a raw account number / UPI handle).
   */
  async linkCashfreeBeneficiary(
    payoutMethodId: string
  ): Promise<{ success: boolean; beneficiary_id?: string; error?: string }> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/cashfree`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create_beneficiary',
          data: {
            payout_method_id: payoutMethodId,
          },
        }),
      });

      const payload = await response.json();
      if (!response.ok || !payload?.success) {
        return { success: false, error: payload?.error || 'Failed to link Cashfree beneficiary' };
      }
      return { success: true, beneficiary_id: payload?.data?.beneficiary_id };
    } catch (error) {
      console.error('Link Cashfree beneficiary error:', error);
      return { success: false, error: 'Network error linking Cashfree beneficiary' };
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
        supabase
          .from('withdrawals')
          .select('*')
          .eq('user_id', session.user.id)
          .order('created_at', { ascending: false })
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