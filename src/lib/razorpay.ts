// Razorpay Service for frontend integration
// Handles creating orders, verifying payments, and managing Razorpay transactions

import { supabase } from './supabase';

const RAZORPAY_EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay`;

// Razorpay checkout SDK types
declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayOrderRequest {
  order_type: 'contract_escrow' | 'subscription' | 'service_purchase';
  amount: number;
  currency?: string;
  description?: string;
  contract_id?: string;
  subscription_id?: string;
  metadata?: Record<string, any>;
}

export interface RazorpayOrder {
  id: string;
  user_id: string;
  razorpay_order_id: string;
  razorpay_payment_id?: string;
  order_type: string;
  amount: number;
  currency: string;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  description?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface RazorpayPaymentData {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface SavedPaymentCard {
  id: string;
  user_id: string;
  card_id: string;
  card_type: string | null;
  card_network: string | null;
  card_last_four: string;
  card_expiry_month: string | null;
  card_expiry_year: string | null;
  card_holder_name: string | null;
  is_default: boolean;
  used_count: number;
  last_used_at: string | null;
  created_at: string;
}

// Razorpay checkout options
export interface RazorpayCheckoutOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  notes?: Record<string, any>;
  theme?: {
    color?: string;
  };
  handler: (response: RazorpayPaymentData) => void;
  modal?: {
    ondismiss?: () => void;
    confirm_close?: boolean;
  };
}

class RazorpayService {
  private async callEdgeFunction(action: string, data: any): Promise<any> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch(RAZORPAY_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, data }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Razorpay operation failed');
    }

    return result.data;
  }

  /**
   * Create a new Razorpay order
   * @param orderData Order details
   * @returns Order with razorpay_order_id and razorpay_key_id
   */
  async createOrder(
    orderData: RazorpayOrderRequest
  ): Promise<{
    order: RazorpayOrder;
    razorpay_order: any;
    razorpay_key_id: string;
    amount: number;
    currency: string;
  }> {
    return await this.callEdgeFunction('create_order', orderData);
  }

  /**
   * Verify payment after Razorpay checkout completes
   * @param paymentData Payment verification data from Razorpay
   * @returns Updated order
   */
  async verifyPayment(paymentData: RazorpayPaymentData): Promise<RazorpayOrder> {
    return await this.callEdgeFunction('verify_payment', paymentData);
  }

  /**
   * Get order details
   * @param razorpayOrderId Razorpay order ID
   * @returns Order details
   */
  async getOrder(razorpayOrderId: string): Promise<{ razorpay_order: any; database_order: RazorpayOrder }> {
    return await this.callEdgeFunction('get_order', { razorpay_order_id: razorpayOrderId });
  }

  /**
   * Refund a payment
   * @param razorpayPaymentId Payment ID to refund
   * @param amount Optional partial refund amount
   * @returns Refund result
   */
  async refundPayment(razorpayPaymentId: string, amount?: number): Promise<any> {
    return await this.callEdgeFunction('refund_payment', { razorpay_payment_id: razorpayPaymentId, amount });
  }

  /**
   * Open Razorpay Checkout modal
   * This dynamically loads the Razorpay checkout SDK if not already loaded
   * @param options Razorpay checkout options
   * @returns Razorpay checkout instance
   */
  async openCheckout(options: RazorpayCheckoutOptions): Promise<any> {
    // Load Razorpay SDK if not already loaded
    if (!window.Razorpay) {
      await this.loadSDK();
    }

    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        ...options,
        handler: (response: RazorpayPaymentData) => {
          options.handler(response);
          resolve(response);
        },
        modal: {
          ...options.modal,
          ondismiss: () => {
            options.modal?.ondismiss?.();
            reject(new Error('Payment cancelled by user'));
          },
        },
      });

      rzp.on('payment.failed', (response: any) => {
        reject(new Error(response.error?.description || 'Payment failed'));
      });

      rzp.open();
    });
  }

  /**
   * Load Razorpay checkout SDK dynamically
   */
  private loadSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Razorpay SDK'));
      document.body.appendChild(script);
    });
  }

  /**
   * Get user's Razorpay orders
   */
  async getUserOrders(): Promise<RazorpayOrder[]> {
    const { data, error } = await supabase
      .from('razorpay_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
    return (data || []) as RazorpayOrder[];
  }

  /**
   * Save a card token after successful payment
   */
  async saveCard(data: {
    razorpay_payment_id: string;
    card_id: string;
    card_last_four: string;
    card_type?: string;
    card_network?: string;
    card_expiry_month?: string;
    card_expiry_year?: string;
    card_holder_name?: string;
  }): Promise<any> {
    return await this.callEdgeFunction('save_card', data);
  }

  /**
   * Get all saved payment cards for the current user
   */
  async getSavedCards(): Promise<SavedPaymentCard[]> {
    const result = await this.callEdgeFunction('get_saved_cards', {});
    return result.cards || [];
  }

  /**
   * Delete a saved payment card
   */
  async deleteSavedCard(cardId: string): Promise<void> {
    await this.callEdgeFunction('delete_saved_card', { card_id: cardId });
  }

  /**
   * Subscribe to real-time updates for a Razorpay order
   */
  subscribeToOrderUpdates(orderId: string, callback: (order: RazorpayOrder) => void) {
    const channel = supabase
      .channel(`razorpay_order_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'razorpay_orders',
          filter: `id=eq.${orderId}`,
        },
        payload => {
          callback(payload.new as RazorpayOrder);
        }
      )
      .subscribe();

    return { unsubscribe: () => channel.unsubscribe() };
  }
}

export const razorpayService = new RazorpayService();

// React hook
export function useRazorpay() {
  return {
    createOrder: (orderData: RazorpayOrderRequest) => razorpayService.createOrder(orderData),
    verifyPayment: (paymentData: RazorpayPaymentData) => razorpayService.verifyPayment(paymentData),
    getOrder: (razorpayOrderId: string) => razorpayService.getOrder(razorpayOrderId),
    openCheckout: (options: RazorpayCheckoutOptions) => razorpayService.openCheckout(options),
    getUserOrders: () => razorpayService.getUserOrders(),
    refundPayment: (paymentId: string, amount?: number) => razorpayService.refundPayment(paymentId, amount),
  };
}
