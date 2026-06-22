import { useState, useEffect } from 'react';
import { Shield, DollarSign, AlertCircle, Loader2, CheckCircle, ListChecks, ChevronRight, Banknote } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { RazorpayCheckout } from './RazorpayCheckout';
import { supabase } from '../lib/supabase';
import { PLATFORM_CONFIG, calculatePlatformFee, calculateTotalWithFee } from '../lib/config';
import { milestoneService, getMilestoneProgress } from '../lib/contractMilestones';
import type { MilestoneItem } from '../lib/contractMilestones';

interface EscrowRazorpayPaymentProps {
  contractId: string;
  amount: number;
  freelancerName: string;
  projectTitle: string;
  milestones?: MilestoneItem[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

type PaymentStep = 'select_milestones' | 'review' | 'payment' | 'processing' | 'success' | 'error';

function EscrowProgressBar({ funded, total }: { funded: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((funded / total) * 100)) : 0;
  const remaining = Math.max(0, total - funded);

  return (
    <div className="p-4 bg-slate-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">Escrow Funding Progress</span>
        <span className="text-sm font-bold text-slate-900">₹{funded.toFixed(0)} / ₹{total.toFixed(0)}</span>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-3 mb-2">
        <div
          className={`h-3 rounded-full transition-all duration-500 ${
            percent >= 100 ? 'bg-emerald-500' : percent >= 50 ? 'bg-blue-500' : 'bg-amber-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-500">
        <span>{percent}% funded</span>
        {remaining > 0 && <span>₹{remaining.toFixed(2)} remaining</span>}
      </div>
    </div>
  );
}

export function EscrowRazorpayPayment({
  contractId,
  amount,
  freelancerName,
  projectTitle,
  milestones: propMilestones,
  onSuccess,
  onCancel,
}: EscrowRazorpayPaymentProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<PaymentStep>(propMilestones && propMilestones.length > 0 ? 'select_milestones' : 'review');
  const [error, setError] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<MilestoneItem[]>(propMilestones || []);
  const [selectedMilestones, setSelectedMilestones] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!propMilestones || propMilestones.length === 0) {
      milestoneService.getMilestones(contractId).then((result) => {
        if (result.success && result.milestones.length > 0) {
          setMilestones(result.milestones);
          setStep('select_milestones');
        }
      });
    }
  }, [contractId, propMilestones]);

  const calculateFundingAmount = (): number => {
    if (milestones.length === 0 || selectedMilestones.size === 0) return amount;
    let total = 0;
    selectedMilestones.forEach((idx) => {
      total += Number(milestones[idx]?.amount || 0);
    });
    return total > 0 ? total : amount;
  };

  const fundingAmount = calculateFundingAmount();
  const platformFee = calculatePlatformFee(fundingAmount);
  const totalAmount = calculateTotalWithFee(fundingAmount);
  const feePercentage = PLATFORM_CONFIG.fees.platform_percentage;

  const fundedAmount = milestones
    .filter((m) => ['completed', 'approved', 'released', 'paid'].includes(String(m.status || '').toLowerCase()))
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  const toggleMilestoneSelection = (index: number) => {
    setSelectedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleRazorpaySuccess = async () => {
    setStep('processing');
    try {
      const { data: contract } = await (supabase.from('contracts') as any)
        .select('id, status, escrow_funded')
        .eq('id', contractId)
        .single();

      if ((contract as any)?.escrow_funded) {
        setStep('success');
        onSuccess?.();
      } else {
        console.warn('Payment captured but contract not fully updated');
        setStep('success');
        onSuccess?.();
      }
    } catch (err) {
      console.error('Payment verification error:', err);
      setStep('success');
      onSuccess?.();
    }
  };

  // Success step
  if (step === 'success') {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h2>
        <p className="text-slate-600 mb-4">
          Your escrow payment of <span className="font-semibold">₹{totalAmount.toFixed(2)}</span> has been received.
        </p>
        <p className="text-sm text-slate-500">
          The funds are now held securely in escrow. They will be released to {freelancerName} upon milestone completion and approval.
        </p>
      </div>
    );
  }

  // Error step
  if (step === 'error') {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <AlertCircle className="w-6 h-6" />
          <h2 className="text-xl font-bold">Payment Failed</h2>
        </div>
        <p className="text-slate-600 mb-6">{error || 'Something went wrong with the payment.'}</p>
        <button
          onClick={() => setStep(milestones.length > 0 ? 'select_milestones' : 'review')}
          className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Payment step - show Razorpay checkout
  if (step === 'payment') {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-emerald-600" />
          <h2 className="text-xl font-bold text-slate-900">Secure Payment</h2>
        </div>

        <RazorpayCheckout
          orderData={{
            order_type: 'contract_escrow',
            amount: totalAmount,
            currency: 'INR',
            description: `Escrow payment for: ${projectTitle}`,
            contract_id: contractId,
            metadata: {
              project_title: projectTitle,
              freelancer_name: freelancerName,
              escrow_amount: fundingAmount,
              platform_fee: platformFee,
              client_id: user?.id,
            },
          }}
          onSuccess={handleRazorpaySuccess}
          onError={(err) => { setError(err.message); setStep('error'); }}
          onCancel={() => setStep(milestones.length > 0 ? 'select_milestones' : 'review')}
          buttonText={`Pay ₹${totalAmount.toFixed(2)} with Razorpay`}
          themeColor="#059669"
        />

        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <h3 className="font-semibold text-slate-900 mb-2">Payment Breakdown</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Amount</span>
              <span>₹{fundingAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Platform Fee ({feePercentage}%)</span>
              <span>₹{platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>₹{totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <EscrowProgressBar funded={fundedAmount + fundingAmount} total={amount} />
      </div>
    );
  }

  // Review step (default)
  return (
    <div className="bg-white rounded-2xl p-8 shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-emerald-600" />
        <h2 className="text-xl font-bold text-slate-900">Escrow Payment</h2>
      </div>

      <div className="space-y-4 mb-6">
        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
          <h3 className="font-semibold text-emerald-900 mb-1">Secure Escrow Protection</h3>
          <p className="text-sm text-emerald-700">
            Your payment is held securely in escrow and will only be released to {freelancerName} when you approve the completed work.
          </p>
        </div>

        {milestones.length > 0 && <EscrowProgressBar funded={fundedAmount} total={amount} />}

        <div className="space-y-3">
          <div className="flex justify-between text-slate-600">
            <span>Project</span>
            <span className="font-medium text-slate-900">{projectTitle}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Freelancer</span>
            <span className="font-medium text-slate-900">{freelancerName}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Project Amount</span>
            <span className="font-medium text-slate-900">₹{amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Platform Fee ({feePercentage}%)</span>
            <span className="font-medium text-slate-900">₹{platformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900 pt-3 border-t border-slate-200 text-lg">
            <span>Total to Pay</span>
            <span>₹{totalAmount.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onCancel} className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors">
          Cancel
        </button>
        <button
          onClick={() => setStep('payment')}
          className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <DollarSign className="w-5 h-5" />
          Proceed to Payment
        </button>
      </div>
    </div>
  );
}
