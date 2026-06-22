// PayPal Service for frontend integration
// Handles creating, capturing, and managing PayPal orders

import { supabase } from './supabase';

const PAYPAL_EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal`;

export interface PayPalOrderRequest {
  order_type: 'contract_escrow' | 'subscription' | 'service_purchase';
  amount: number;
  currency?: string;
  description?: string;
  contract_id?: string;
  subscription_id?: string;
  metadata?: Record<string, any>;
}

export interface PayPalOrder {
  id: string;
  user_id: string;
  paypal_order_id: string;
  order_type: string;
  amount: number;
  currency: string;
  status: 'created' | 'approved' | 'captured' | 'voided' | 'refunded';
  description: string;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  approve_url?: string;
}

export interface PayPalCaptureResult {
  order: PayPalOrder;
  capture?: any;
  already_captured?: boolean;
}

class PayPalService {
  private async callEdgeFunction(action: string, data: any): Promise<any> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch(PAYPAL_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, data }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'PayPal operation failed');
    }

    return result.data;
  }

  /**
   * Create a new PayPal order
   * @param orderData Order details
   * @returns Order with PayPal approve URL
   */
  async createOrder(
    orderData: PayPalOrderRequest
  ): Promise<{ order: PayPalOrder; approve_url: string }> {
    const result = await this.callEdgeFunction('create_order', orderData);
    return {
      order: result.order,
      approve_url: result.approve_url,
    };
  }

  /**
   * Capture an approved PayPal order
   * @param paypalOrderId PayPal order ID
   * @returns Capture result with order details
   */
  async captureOrder(paypalOrderId: string): Promise<PayPalCaptureResult> {
    return await this.callEdgeFunction('capture_order', { paypal_order_id: paypalOrderId });
  }

  /**
   * Get PayPal order details
   * @param paypalOrderId PayPal order ID
   * @returns Order details from PayPal and database
   */
  async getOrder(
    paypalOrderId: string
  ): Promise<{ paypal_order: any; database_order: PayPalOrder }> {
    return await this.callEdgeFunction('get_order', { paypal_order_id: paypalOrderId });
  }

  /**
   * Create and capture PayPal order in one step (for simple payments)
   * @param orderData Order details
   * @returns Capture result
   */
  async createAndCaptureOrder(orderData: PayPalOrderRequest): Promise<PayPalCaptureResult> {
    // Create order
    const { order, approve_url } = await this.createOrder(orderData);

    // For simple payments, we need to redirect to PayPal
    // The capture will happen after user approves
    window.location.href = approve_url;

    // This will not be reached immediately - user will be redirected back
    return { order } as PayPalCaptureResult;
  }

  /**
   * Subscribe to real-time updates for a PayPal order
   * @param orderId Order ID to subscribe to
   * @param callback Function to call when order updates
   * @returns Subscription object
   */
  subscribeToOrderUpdates(orderId: string, callback: (order: PayPalOrder) => void) {
    const channel = supabase
      .channel(`paypal_order_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'paypal_orders',
          filter: `id=eq.${orderId}`,
        },
        payload => {
          callback(payload.new as PayPalOrder);
        }
      )
      .subscribe();

    return {
      unsubscribe: () => channel.unsubscribe(),
    };
  }

  /**
   * Get user's PayPal orders
   * @returns List of orders
   */
  async getUserOrders(): Promise<PayPalOrder[]> {
    const { data, error } = await supabase
      .from('paypal_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch orders: ${error.message}`);
    }

    return (data || []) as PayPalOrder[];
  }

  /**
   * Get PayPal transactions for an order
   * @param orderId Order ID
   * @returns List of transactions
   */
  async getOrderTransactions(orderId: string) {
    const { data, error } = await supabase
      .from('paypal_transactions')
      .select('*')
      .eq('paypal_order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to fetch transactions: ${error.message}`);
    }

    return data || [];
  }
}

// Export singleton instance
export const paypalService = new PayPalService();

// React hook for PayPal integration
export function usePayPal() {
  return {
    createOrder: (orderData: PayPalOrderRequest) => paypalService.createOrder(orderData),
    captureOrder: (paypalOrderId: string) => paypalService.captureOrder(paypalOrderId),
    getOrder: (paypalOrderId: string) => paypalService.getOrder(paypalOrderId),
    subscribeToOrderUpdates: (orderId: string, callback: (order: PayPalOrder) => void) =>
      paypalService.subscribeToOrderUpdates(orderId, callback),
    getUserOrders: () => paypalService.getUserOrders(),
  };
}
