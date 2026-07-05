import { supabase } from './supabase';

export type ClientPaymentMethod = Record<string, any> & {
  id: string;
  type: string;
  is_default?: boolean;
  user_id?: string;
  created_at?: string;
};

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

export const clientPaymentMethodsService = {
  /**
   * Fetch all saved payment methods for the current client.
   */
  async getPaymentMethods(): Promise<{
    success: boolean;
    methods?: any[];
    error?: string;
  }> {
    try {
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.session?.user) {
        return { success: false, error: 'Authentication required' };
      }

      const { data, error } = await supabase
        .from('payment_methods' as any)
        .select('*')
        .eq('user_id', session.session.user.id)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return { success: true, methods: data || [] };
    } catch (err: any) {
      console.error('Error fetching payment methods:', err);
      return { success: false, error: err.message || 'Failed to load payment methods' };
    }
  },

  /**
   * Add a new payment method for the current client.
   */
  async addPaymentMethod(data: AddPaymentMethodData): Promise<{
    success: boolean;
    method?: any;
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
        await supabase
          .from('payment_methods' as any)
          .update({ is_default: false })
          .eq('user_id', userId)
          .eq('is_default', true);
      }

      const insertData: Record<string, any> = {
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

      const { data: newMethod, error } = await supabase
        .from('payment_methods' as any)
        .insert(insertData as any)
        .select()
        .single();

      if (error) throw error;

      return { success: true, method: newMethod };
    } catch (err: any) {
      console.error('Error adding payment method:', err);
      return { success: false, error: err.message || 'Failed to add payment method' };
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
      await supabase
        .from('payment_methods' as any)
        .update({ is_default: false })
        .eq('user_id', userId)
        .eq('is_default', true);

      // Set the new default
      const { error } = await supabase
        .from('payment_methods' as any)
        .update({ is_default: true })
        .eq('id', methodId)
        .eq('user_id', userId);

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      console.error('Error setting default payment method:', err);
      return { success: false, error: err.message || 'Failed to set default payment method' };
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

      const { error } = await supabase
        .from('payment_methods' as any)
        .delete()
        .eq('id', methodId)
        .eq('user_id', session.session.user.id);

      if (error) throw error;

      return { success: true };
    } catch (err: any) {
      console.error('Error deleting payment method:', err);
      return { success: false, error: err.message || 'Failed to delete payment method' };
    }
  },
};