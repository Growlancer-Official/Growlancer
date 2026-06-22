import { useState } from 'react';
import { Crown, CheckCircle, AlertCircle, Loader2, Calendar, CreditCard } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RazorpayCheckout } from './RazorpayCheckout';
import { supabase } from '../lib/supabase';

interface SubscriptionRazorpayPaymentProps {
  planId: string;
  planName: string;
  planPrice: number;
  role: 'freelancer' | 'client';
  trialDays?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function SubscriptionRazorpayPayment({
  planId,
  planName,
  planPrice,
  role,
  trialDays = 0,
  onSuccess,
  onCancel,
}: SubscriptionRazorpayPaymentProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'review' | 'payment' | 'processing' | 'success' | 'error'>('review');
  const [error, setError] = useState<string | null>(null);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  const handleProceedToPayment = async () => {
    setIsCreatingSubscription(true);
    try {
      const { data: subscription, error: subError } = await supabase
        .from('subscriptions')
        .insert({
          user_id: user?.id,
          plan_id: planId,
          status: 'trial',
          trial_start_date: new Date().toISOString(),
          trial_end_date: new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (subError || !subscription) throw new Error('Failed to create subscription');
      setSubscriptionId(subscription.id);
      setIsCreatingSubscription(false);
      setStep('payment');
    } catch (err) {
      setIsCreatingSubscription(false);
      setError(err instanceof Error ? err.message : 'Failed to create subscription');
      setStep('error');
    }
  };

  const handlePayPalSuccess = async () => {
    setStep('success');
    onSuccess?.();
  };

  const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
  const formattedTrialEnd = trialEndDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  if (step === 'success') {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Subscription Activated!</h2>
        <p className="text-slate-600 mb-6">
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
      <div className="bg-white rounded-2xl p-8 shadow-lg">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <AlertCircle className="w-6 h-6" />
          <h2 className="text-xl font-bold">Payment Failed</h2>
        </div>
        <p className="text-slate-600 mb-6">{error || 'Something went wrong with the payment.'}</p>
        <button onClick={() => setStep('review')} className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors">
          Try Again
        </button>
      </div>
    );
  }

  if (step === 'payment') {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Crown className="w-6 h-6 text-amber-600" />
          <h2 className="text-xl font-bold text-slate-900">Upgrade to Pro</h2>
        </div>

        <RazorpayCheckout
          orderData={{
            order_type: 'subscription',
            amount: planPrice,
            currency: 'INR',
            description: `${planName} subscription for ${role}`,
            subscription_id: subscriptionId || undefined,
            metadata: { plan_name: planName, role, trial_days: trialDays, user_id: user?.id },
          }}
          onSuccess={handlePayPalSuccess}
          onError={(err) => { setError(err.message); setStep('error'); }}
          onCancel={() => setStep('review')}
          buttonText={`Subscribe for ₹${planPrice.toFixed(2)}/month`}
          themeColor="#d97706"
        />

        <div className="mt-6 p-4 bg-amber-50 rounded-lg border border-amber-100">
          <div className="flex items-center gap-2 text-amber-700 mb-2">
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
    <div className="bg-white rounded-2xl p-8 shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <Crown className="w-6 h-6 text-amber-600" />
        <h2 className="text-xl font-bold text-slate-900">Upgrade to Pro</h2>
      </div>

      <div className="space-y-4 mb-6">
        <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-100">
          <h3 className="font-semibold text-amber-900 mb-1">{planName} Plan</h3>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-amber-600">₹{planPrice.toFixed(2)}</span>
            <span className="text-amber-700">/month</span>
          </div>
        </div>

        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-700 mb-2">
            <Calendar className="w-4 h-4" />
            <span className="font-semibold">{trialDays}-Day Free Trial</span>
          </div>
          <p className="text-sm text-emerald-600">
            Try Pro features risk-free. Cancel anytime before {formattedTrialEnd} - no charges!
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={handleProceedToPayment}
          disabled={isCreatingSubscription}
          className="flex-1 py-3 px-4 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isCreatingSubscription ? (
            <><Loader2 className="w-5 h-5 animate-spin" />Processing...</>
          ) : (
            <><CreditCard className="w-5 h-5" />Start Free Trial</>
          )}
        </button>
      </div>
    </div>
  );
}
