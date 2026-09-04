// Subscription Payment with PayPal Integration
// This component allows users to upgrade to Pro subscription using PayPal

import { useEffect, useState } from 'react';
import { Crown, CheckCircle, AlertCircle, Loader2, Calendar, CreditCard, IndianRupee, Wallet } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PayPalCheckout } from './PayPalCheckout';
import { RazorpayCheckout } from './RazorpayCheckout';
import { PAYMENTS_CONFIG } from '../lib/payments';
import { formatCurrency } from '../lib/currency';
import { subscriptionService } from '../lib/subscriptionHelpers';
import { withdrawalService } from '../lib/withdrawal';

interface SubscriptionPayPalPaymentProps {
  planId: string;
  planName: string;
  planPrice: number;
  role: 'freelancer' | 'client';
  trialDays?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SubscriptionPayPalPayment({
  planId,
  planName,
  planPrice,
  role,
  trialDays,
  onSuccess,
  onCancel,
}: SubscriptionPayPalPaymentProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'review' | 'payment' | 'processing' | 'success' | 'error'>('review');
  const [error, setError] = useState<string | null>(null);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletPaying, setWalletPaying] = useState(false);

  // Load wallet balance so the user can pay for Pro from their wallet
  useEffect(() => {
    let mounted = true;
    void withdrawalService
      .getWalletBalance()
      .then((res) => {
        if (mounted && res.success && res.balance) {
          setWalletBalance(Number(res.balance.balance) || 0);
        }
      })
      .catch(() => { /* wallet fetch failed silently — external payment still works */ });
    return () => { mounted = false; };
  }, []);

  const handleWalletPay = async () => {
    if (!user || !planId) return;
    setWalletPaying(true);
    try {
      // Fresh balance check BEFORE mutating the subscription, so an insufficient
      // wallet never cancels an existing active/trial row (subscribeToPlan
      // cancels first — only proceed once we know the wallet covers the price).
      const freshBal = await withdrawalService.getWalletBalance();
      const balance = freshBal.success && freshBal.balance ? Number(freshBal.balance.balance) || 0 : 0;
      if (balance < planPrice) {
        setWalletBalance(balance);
        throw new Error(`Insufficient wallet balance. Required: ${formatCurrency(planPrice)}, Available: ${formatCurrency(balance)}`);
      }
      setWalletBalance(balance);

      // Create (or restore) the subscription row, then pay from the wallet
      const result = await subscriptionService.subscribeToPlan(user.id, planId);
      if (!result.success || !result.subscription) {
        throw new Error(result.error || 'Failed to create subscription');
      }
      const pay = await subscriptionService.payWithWallet(result.subscription.id);
      if (!pay.success) {
        throw new Error(pay.error || 'Wallet payment failed');
      }
      setStep('success');
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Wallet payment failed');
      setStep('error');
    } finally {
      setWalletPaying(false);
    }
  };

  const handleProceedToPayment = async () => {
    setIsCreatingSubscription(true);
    
    try {
      // Create the subscription row SERVER-SIDE (create_user_subscription RPC):
      // fresh users get a 'trial' row, post-trial users get a 'pending' row that
      // becomes 'active' only after this payment is captured. The browser never
      // writes subscription state directly (free-Pro bypass fix).
      const result = await subscriptionService.subscribeToPlan(user?.id || '', planId);
      if (!result.success || !result.subscription) {
        throw new Error(result.error || 'Failed to create subscription');
      }

      setSubscriptionId(result.subscription.id);
      setIsCreatingSubscription(false);
      setStep('payment');
    } catch (err) {
      setIsCreatingSubscription(false);
      setError(err instanceof Error ? err.message : 'Failed to create subscription');
      setStep('error');
    }
  };

  const handlePayPalSuccess = async (_orderId: string, _details: unknown) => {
    setStep('success');
    onSuccess?.();
  };

  const handlePayPalError = (error: Error) => {
    setError(error.message);
    setStep('error');
  };

  const handlePayPalCancel = () => {
    setStep('review');
    onCancel?.();
  };

  const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  const formattedTrialEnd = trialEndDate.toLocaleDateString('en-US', { 
    month: 'long', 
    day: 'numeric', 
    year: 'numeric' 
  });

  if (step === 'success') {
    return (
      <div className="bg-white rounded-xl p-3 sm:p-3 shadow-lg text-center max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-2">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Subscription Activated!</h2>
        <p className="text-slate-600 mb-3">
          Your {planName} subscription is now active. You have full access to all Pro features.
        </p>
        <div className="bg-emerald-50 rounded-lg p-4 text-left">
          <h3 className="font-semibold text-emerald-900 mb-2">What's Next?</h3>
          <ul className="text-sm text-emerald-700 space-y-1">
            <li>• Enjoy {trialDays}-day free trial (ends {formattedTrialEnd})</li>
            <li>• Cancel anytime before trial ends</li>
            <li>• No charges until trial period ends</li>
          </ul>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="bg-white rounded-xl p-3 sm:p-3 shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center gap-3 text-red-600 mb-2">
          <AlertCircle className="w-6 h-6" />
          <h2 className="text-xl font-bold">Payment Failed</h2>
        </div>
        <p className="text-slate-600 mb-3">{error || 'Something went wrong with the payment.'}</p>
        <button
          onClick={() => setStep('review')}
          className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  if (step === 'payment') {
    return (
      <div className="bg-white rounded-xl p-3 sm:p-3 shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
        <div className="flex items-center gap-3 mb-3">
          <Crown className="w-6 h-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">Upgrade to Pro</h2>
        </div>

        {/* Primary: Razorpay — amount is recomputed from the plan on the server */}
        <RazorpayCheckout
          orderData={{
            order_type: 'subscription',
            amount: planPrice,
            currency: 'INR',
            description: `${planName} subscription for ${role}`,
            subscription_id: subscriptionId || undefined,
            metadata: {
              plan_name: planName,
              role: role,
              trial_days: trialDays,
              user_id: user?.id,
            },
          }}
          onSuccess={handlePayPalSuccess}
          onError={handlePayPalError}
          onCancel={handlePayPalCancel}
          buttonText={`Subscribe for ${formatCurrency(planPrice)}/month`}
          userInfo={{
            name: (user as any)?.user_metadata?.name,
            email: user?.email,
          }}
        />

        {/* Secondary: PayPal — feature-flagged, Coming Soon until live credentials */}
        {PAYMENTS_CONFIG.paypalEnabled ? (
          <>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 uppercase tracking-wider">or pay with</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <PayPalCheckout
              orderData={{
                order_type: 'subscription',
                amount: planPrice,
                currency: 'INR',
                description: `${planName} subscription for ${role}`,
                subscription_id: subscriptionId || undefined,
                metadata: {
                  plan_name: planName,
                  role: role,
                  trial_days: trialDays,
                  user_id: user?.id,
                },
              }}
              onSuccess={handlePayPalSuccess}
              onError={handlePayPalError}
              onCancel={handlePayPalCancel}
              buttonText={`Subscribe for ${formatCurrency(planPrice)}/month`}
            />
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 p-4 bg-slate-50 border border-dashed border-slate-300 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-200 rounded-lg flex items-center justify-center">
                <IndianRupee className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-600">PayPal</p>
                <p className="text-xs text-slate-400">Available soon — Razorpay is the current payment method</p>
              </div>
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 bg-slate-200 px-2.5 py-1 rounded-full">
              Coming Soon
            </span>
          </div>
        )}

        <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-100">
          <div className="flex items-center gap-3 text-amber-700 mb-2">
            <Calendar className="w-4 h-4" />
            <span className="font-semibold">{trialDays}-Day Free Trial</span>
          </div>
          <p className="text-sm text-amber-600">
            Start your free trial today. Your subscription will automatically begin on {formattedTrialEnd}. Cancel anytime before then.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-3 sm:p-3 shadow-lg max-h-[calc(100vh-2rem)] overflow-y-auto">
      <div className="flex items-center gap-3 mb-3">
        <Crown className="w-6 h-6 text-amber-600" />
        <h2 className="text-xl font-bold text-slate-900">Upgrade to Pro</h2>
      </div>

      <div className="space-y-4 mb-3">
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-100">
          <h3 className="font-semibold text-amber-900 mb-1">{planName} Plan</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-amber-600">{formatCurrency(planPrice)}</span>
            <span className="text-amber-700">/month</span>
          </div>
        </div>

        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
          <div className="flex items-center gap-3 text-emerald-700 mb-2">
            <Calendar className="w-4 h-4" />
            <span className="font-semibold">{trialDays}-Day Free Trial</span>
          </div>
          <p className="text-sm text-emerald-600">
            Try Pro features risk-free. Cancel anytime before {formattedTrialEnd} - no charges!
          </p>
        </div>

        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Pro Features:</h3>
          <ul className="space-y-4 text-sm text-slate-600">
            {role === 'freelancer' ? (
              <>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>10x more proposals per month</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Priority matching algorithm</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Access to high-budget projects</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Advanced earnings analytics</span>
                </li>
              </>
            ) : (
              <>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Unlimited AI-powered matching</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Priority access to top freelancers</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Dedicated account manager</span>
                </li>
                <li className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>Advanced project analytics</span>
                </li>
              </>
            )}
          </ul>
        </div>
      </div>

      {/* Pay from Growlancer Wallet */}
      <div className="p-4 bg-blue-50 rounded-lg border border-blue-100 mb-2">
        <div className="flex items-center gap-3 text-blue-700 mb-1">
          <Wallet className="w-4 h-4" />
          <span className="font-semibold">Pay from Growlancer Wallet</span>
        </div>
        <p className="text-sm text-blue-600 mb-3">
          {walletBalance !== null
            ? `Available balance: ${formatCurrency(walletBalance)}`
            : 'Loading wallet balance...'}
        </p>
        <button
          onClick={handleWalletPay}
          disabled={walletPaying || (walletBalance !== null && walletBalance < planPrice)}
          className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-3"
        >
          {walletPaying ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Wallet className="w-5 h-5" />
              Pay {formatCurrency(planPrice)} from Wallet
            </>
          )}
        </button>
        {walletBalance !== null && walletBalance < planPrice && (
          <p className="text-xs text-amber-600 mt-2">
            Insufficient balance — add funds to your wallet or pay with Razorpay below.
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleProceedToPayment}
          disabled={isCreatingSubscription}
          className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-3"
        >
          {isCreatingSubscription ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              Start Free Trial
            </>
          )}
        </button>
      </div>
    </div>
  );
}
