// Cashfree Service for frontend integration
// Handles creating orders, verifying payments, and managing Cashfree transactions
// Cashfree is the PRIMARY payment gateway for India (UPI, Cards, Net Banking, Wallets).

import { supabase } from './supabase';

const CASHFREE_EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cashfree`;

// Cashfree drop-in checkout SDK types
declare global {
  interface Window {
    Cashfree: any;
  }
}

/** 'sandbox' | 'production' — mirrors the CASHFREE_ENVIRONMENT backend var */
export const CASHFREE_MODE = import.meta.env.VITE_CASHFREE_ENVIRONMENT === 'PROD' ? 'production' : 'sandbox';

export interface CashfreeOrderRequest {
  order_type: 'contract_escrow' | 'subscription' | 'service_purchase';
  amount: number;
  currency?: string;
  description?: string;
  contract_id?: string;
  subscription_id?: string;
  metadata?: Record<string, any>;
}

export interface CashfreeOrder {
  id: string;
  user_id: string;
  cashfree_order_id: string;
  payment_session_id?: string | null;
  order_type: string;
  amount: number;
  currency: string;
  status: 'created' | 'captured' | 'failed' | 'refunded';
  description?: string;
  metadata?: Record<string, any>;
  payment_id?: string | null;
  created_at: string;
}

/** Payment object as returned by the Cashfree order-status fetch / webhook. */
export interface CashfreePaymentData {
  order: CashfreeOrder;
  payment?: Record<string, any>;
}

class CashfreeService {
  private async callEdgeFunction(action: string, data: any): Promise<any> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    if (!accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch(CASHFREE_EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, data }),
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || 'Cashfree operation failed');
    }

    return result.data;
  }

  /**
   * Create a new Cashfree order (amount is recomputed server-side).
   * @returns Order with payment_session_id (for the drop-in checkout)
   */
  async createOrder(
    orderData: CashfreeOrderRequest
  ): Promise<{
    order: CashfreeOrder;
    payment_session_id: string;
    amount: number;
    currency: string;
  }> {
    return await this.callEdgeFunction('create_order', orderData);
  }

  /**
   * Verify payment after the Cashfree checkout returns.
   * The order status is fetched SERVER-SIDE from Cashfree (amount + status
   * are validated there) — the client never verifies a signature itself.
   * @param cashfreeOrderId The merchant order id returned by createOrder
   */
  async verifyPayment(cashfreeOrderId: string): Promise<CashfreePaymentData> {
    return await this.callEdgeFunction('verify_payment', { cashfree_order_id: cashfreeOrderId });
  }

  /**
   * Get order details
   */
  async getOrder(cashfreeOrderId: string): Promise<{ cashfree_order: any; database_order: CashfreeOrder }> {
    return await this.callEdgeFunction('get_order', { cashfree_order_id: cashfreeOrderId });
  }

  /**
   * Refund a captured order (server-side, never trust a client amount).
   */
  async refundPayment(cashfreeOrderId: string, amount?: number): Promise<any> {
    return await this.callEdgeFunction('refund_payment', { cashfree_order_id: cashfreeOrderId, amount });
  }

  /**
   * Link a payout method to a Cashfree beneficiary (used for withdrawals).
   */
  async createBeneficiary(payoutMethodId: string): Promise<{ beneficiary_id: string }> {
    return await this.callEdgeFunction('create_beneficiary', { payout_method_id: payoutMethodId });
  }

  /**
   * Open the Cashfree hosted drop-in checkout.
   * Redirects to Cashfree's hosted page and back to the `return_url` set on the
   * order. On return, call verifyPendingOrder() to confirm the payment.
   */
  async openCheckout(paymentSessionId: string): Promise<void> {
    // Load Cashfree SDK if not already loaded
    if (!window.Cashfree) {
      await this.loadSDK();
    }

    const cashfree = new window.Cashfree({ mode: CASHFREE_MODE });
    await cashfree.checkout({
      paymentSessionId,
      redirectTarget: '_self',
    });
  }

  /**
   * Load the Cashfree checkout SDK dynamically.
   */
  private loadSDK(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.Cashfree) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://sdk.cashfree.com/js/v3/cashfree.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
      document.body.appendChild(script);
    });
  }

  // ─── Pending-order recovery (drop-in redirect flow) ──────────────────────
  // The Cashfree checkout redirects the browser away; when it returns to the
  // same SPA route, we need to know which order to verify. We store the order
  // id in sessionStorage right before redirecting and consume it on return.

  private PENDING_KEY = 'growlancer_pending_cashfree_order';

  setPendingOrder(orderId: string): void {
    try {
      sessionStorage.setItem(this.PENDING_KEY, orderId);
    } catch { /* ignore */ }
  }

  getPendingOrder(): string | null {
    try {
      return sessionStorage.getItem(this.PENDING_KEY);
    } catch {
      return null;
    }
  }

  clearPendingOrder(): void {
    try {
      sessionStorage.removeItem(this.PENDING_KEY);
    } catch { /* ignore */ }
  }

  /**
   * Verify the pending order left by the redirect flow (if any).
   * Returns true when a pending order was found and verified.
   */
  async verifyPendingOrder(): Promise<{ verified: boolean; data?: CashfreePaymentData; error?: string }> {
    const orderId = this.getPendingOrder();
    if (!orderId) {
      return { verified: false };
    }
    try {
      const data = await this.verifyPayment(orderId);
      this.clearPendingOrder();
      return { verified: true, data };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Payment verification failed';
      return { verified: false, error: msg };
    }
  }

  /**
   * Get user's Cashfree orders
   */
  async getUserOrders(): Promise<CashfreeOrder[]> {
    const { data, error } = await supabase
      .from('cashfree_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch orders: ${error.message}`);
    return (data || []) as CashfreeOrder[];
  }

  /**
   * Subscribe to real-time updates for a Cashfree order
   */
  subscribeToOrderUpdates(orderId: string, callback: (order: CashfreeOrder) => void) {
    const channel = supabase
      .channel(`cashfree_order_${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'cashfree_orders',
          filter: `id=eq.${orderId}`,
        },
        payload => {
          callback(payload.new as CashfreeOrder);
        }
      )
      .subscribe();

    return { unsubscribe: () => channel.unsubscribe() };
  }
}

export const cashfreeService = new CashfreeService();

// React hook
export function useCashfree() {
  return {
    createOrder: (orderData: CashfreeOrderRequest) => cashfreeService.createOrder(orderData),
    verifyPayment: (cashfreeOrderId: string) => cashfreeService.verifyPayment(cashfreeOrderId),
    getOrder: (cashfreeOrderId: string) => cashfreeService.getOrder(cashfreeOrderId),
    openCheckout: (paymentSessionId: string) => cashfreeService.openCheckout(paymentSessionId),
    getUserOrders: () => cashfreeService.getUserOrders(),
    refundPayment: (orderId: string, amount?: number) => cashfreeService.refundPayment(orderId, amount),
  };
}
