import { supabase } from './supabase';

// ─── Payment method type ────────────────────────────────────────
// ID is always a string from Supabase UUID. Optional fields match
// the payment_methods table columns.
export interface ClientPaymentMethod {
  id: string;
  user_id: string;
  type: string;
  is_default?: boolean;
  created_at?: string;
  updated_at?: string;
  paypal_email?: string | null;
  card_last_four?: string | null;
  card_brand?: string | null;
  card_expiry?: string | null;
  account_holder_name?: string | null;
  account_number_last_four?: string | null;
  bank_name?: string | null;
}

export interface AddPaymentMethodData {
  type: 'card' | 'paypal' | 'bank_transfer';
  card_last_four?: string | null;
  card_brand?: string | null;
  card_expiry?: string | null;
  paypal_email?: string | null;
  account_holder_name?: string | null;
  account_number_last_four?: string | null;
  bank_name?: string | null;
  is_default?: boolean;
}

/** Reference to the payment_methods table (typed via TableName union) */
const pm = () => supabase.from('payment_methods' as any);

export const clientPaymentMethodsService = {
  /**
   * Fetch all saved payment methods for the current client.
   */
  async getPaymentMethods(): Promise<{
    success: boolean;
    methods?: ClientPaymentMethod[];
    error?: string;
  }> {
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session?.user) {
        return { success: false, error: 'Authentication required' };
      }

      const { data, error } = await pm()
        .select('*')
        .eq('user_id', session.session.user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return { success: true, methods: (data || []) as unknown as ClientPaymentMethod[] };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load payment methods';
      console.error('Error fetching payment methods:', message);
      return { success: false, error: message };
    }
  },

  /**
   * Add a new payment method for the current client.
   */
  async addPaymentMethod(data: AddPaymentMethodData): Promise<{
    success: boolean;
    method?: ClientPaymentMethod;
    error?: string;
  }> {
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session?.user) {
        return { success: false, error: 'Authentication required' };
      }

      const userId = session.session.user.id;

      // If this is the first method or marked default, unset any existing default
      if (data.is_default) {
        await pm()
          .update({ is_default: false })
          .eq('user_id', userId)
          .eq('is_default', true);
      }

      const insertData: Record<string, unknown> = {
        user_id: userId,
        type: data.type,
        is_default: data.is_default || false,
      };

      if (data.type === 'card') {
        insertData.card_last_four = data.card_last_four;
        insertData.card_brand = data.card_brand;
        insertData.card_expiry = data.card_expiry;
      } else if (data.type === 'paypal') {
        insertData.paypal_email = data.paypal_email;
      } else if (data.type === 'bank_transfer') {
        insertData.account_holder_name = data.account_holder_name;
        insertData.account_number_last_four = data.account_number_last_four;
        insertData.bank_name = data.bank_name;
      }

      const { data: newMethod, error } = await pm()
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      return { success: true, method: newMethod as unknown as ClientPaymentMethod };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add payment method';
      console.error('Error adding payment method:', message);
      return { success: false, error: message };
    }
  },

  /**
   * Set a payment method as the default.
   */
  async setDefaultPaymentMethod(methodId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session?.user) {
        return { success: false, error: 'Authentication required' };
      }

      const userId = session.session.user.id;

      // Unset all defaults for this user
      await pm()
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_default', true);

      // Set the new default
      const { error } = await pm()
        .update({ is_default: true })
        .eq('id', methodId)
        .eq('user_id', userId);

      if (error) throw error;

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to set default payment method';
      console.error('Error setting default payment method:', message);
      return { success: false, error: message };
    }
  },

  /**
   * Delete a saved payment method.
   */
  async deletePaymentMethod(methodId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session?.user) {
        return { success: false, error: 'Authentication required' };
      }

      const { error } = await pm()
        .delete()
        .eq('id', methodId)
        .eq('user_id', session.session.user.id);

      if (error) throw error;

      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete payment method';
      console.error('Error deleting payment method:', message);
      return { success: false, error: message };
    }
  },
};