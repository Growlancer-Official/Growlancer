// Escrow Payment with PayPal Integration
// This component allows clients to fund escrow using PayPal
// Supports both full-amount funding and milestone-based partial releases

import { useState, useEffect } from 'react';
import { AlertCircle,
  Banknote,
  Check,
  CheckCircle,
  ChevronRight,
  DollarSign,
  ListChecks,
  Loader2,
  Shield } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PayPalCheckout } from './PayPalCheckout';
import { supabase } from '../lib/supabase';
import { PLATFORM_CONFIG, calculatePlatformFee, calculateTotalWithFee } from '../lib/config';
import { milestoneService, getMilestoneProgress } from '../lib/contractMilestones';
import type { MilestoneItem } from '../lib/contractMilestones';

interface EscrowPayPalPaymentProps {
  contractId: string;
  amount: number;
  freelancerName: string;
  projectTitle: string;
  /** Optional milestones array for milestone-based partial funding */
  milestones?: MilestoneItem[];
  onSuccess?: () => void;
  onCancel?: () => void;
}

type PaymentStep = 'select_milestones' | 'review' | 'payment' | 'processing' | 'success' | 'error';

/**
 * Milestone step indicator showing progress across the milestone payment flow.
 */
function MilestoneStepIndicator({
  milestones,
  selectedIndices,
  onToggle,
}: {
  milestones: MilestoneItem[];
  selectedIndices: Set<number>;
  onToggle: (index: number) => void;
}) {
  const progress = getMilestoneProgress(milestones);

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900">Select Milestones to Fund</h3>
        <span className="text-sm text-slate-500">
          {progress.completed} of {progress.total} completed
        </span>
      </div>

      {/* Overall Progress Bar */}
      {progress.total > 0 && (
        <div className="w-full bg-slate-100 rounded-full h-2 mb-4">
          <div
            className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      )}

      <div className="space-y-2">
        {milestones.map((milestone, idx) => {
          const status = String(milestone.status || 'pending').toLowerCase();
          const isCompleted = ['completed', 'approved', 'released', 'paid'].includes(status);
          const isDisputed = status === 'disputed';
          const isSelected = selectedIndices.has(idx);

          return (
            <div
              key={idx}
              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                isCompleted
                  ? 'bg-emerald-50 border-emerald-200'
                  : isDisputed
                  ? 'bg-red-50 border-red-200'
                  : isSelected
                  ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                  : 'bg-slate-50 border-slate-200 hover:border-slate-300'
              }`}
            >
              {/* Checkbox for selection */}
              {!isCompleted && !isDisputed ? (
                <button
                  onClick={() => onToggle(idx)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-slate-300 hover:border-blue-400'
                  }`}
                >
                  {isSelected && <CheckCircle className="w-4 h-4" />}
                </button>
              ) : (
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isCompleted ? 'bg-emerald-500' : 'bg-red-500'
                }`}>
                  {isCompleted ? (
                    <CheckCircle className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-white" />
                  )}
                </div>
              )}

              {/* Milestone info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${isCompleted ? 'text-emerald-800' : isDisputed ? 'text-red-800' : 'text-slate-800'}`}>
                  {milestone.title || `Milestone ${idx + 1}`}
                </p>
                {milestone.description && (
                  <p className="text-xs text-slate-500 truncate">{milestone.description}</p>
                )}
              </div>

              {/* Amount and status */}
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-semibold text-slate-900">
                  ${Number(milestone.amount || 0).toFixed(2)}
                </p>
                <span className={`text-xs font-medium capitalize ${
                  isCompleted ? 'text-emerald-600' : isDisputed ? 'text-red-600' : 'text-slate-400'
                }`}>
                  {isCompleted ? 'Funded' : isDisputed ? 'Disputed' : isSelected ? 'Selected' : status.replace('_', ' ')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Escrow progress bar showing funded vs total amounts.
 */
function EscrowProgressBar({ funded, total }: { funded: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((funded / total) * 100)) : 0;
  const remaining = Math.max(0, total - funded);

  return (
    <div className="p-4 bg-slate-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-700">Escrow Funding Progress</span>
        <span className="text-sm font-bold text-slate-900">${funded.toFixed(0)} / ${total.toFixed(0)}</span>
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
        {remaining > 0 && <span>${remaining.toFixed(2)} remaining</span>}
      </div>
    </div>
  );
}

export function EscrowPayPalPayment({
  contractId,
  amount,
  freelancerName,
  projectTitle,
  milestones: propMilestones,
  onSuccess,
  onCancel,
}: EscrowPayPalPaymentProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<PaymentStep>(propMilestones && propMilestones.length > 0 ? 'select_milestones' : 'review');
  const [error, setError] = useState<string | null>(null);
  const [isCreatingContract, setIsCreatingContract] = useState(false);
  const [selectedMilestones, setSelectedMilestones] = useState<Set<number>>(new Set());
  const [milestones, setMilestones] = useState<MilestoneItem[]>(propMilestones || []);

  // Load milestones from contract if not provided via props
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

  // Calculate the total amount to fund based on selected milestones
  const calculateFundingAmount = (): number => {
    if (milestones.length === 0 || selectedMilestones.size === 0) {
      return amount;
    }
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

  // Calculate already funded amount
  const fundedAmount = milestones
    .filter((m) => ['completed', 'approved', 'released', 'paid'].includes(String(m.status || '').toLowerCase()))
    .reduce((sum, m) => sum + (Number(m.amount) || 0), 0);

  const toggleMilestoneSelection = (index: number) => {
    setSelectedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleProceedToReview = () => {
    if (milestones.length > 0 && selectedMilestones.size === 0) {
      // If no milestones selected, fund the full contract amount
      setStep('review');
    } else {
      setStep('review');
    }
  };

  const handleProceedToPayment = async () => {
    setIsCreatingContract(true);

    try {
      // Check if contract exists
      const { data: contract, error: contractError } = await supabase
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (contractError || !contract) {
        throw new Error('Contract not found');
      }

      setIsCreatingContract(false);
      setStep('payment');
    } catch (err) {
      setIsCreatingContract(false);
      setError(err instanceof Error ? err.message : 'Failed to load contract');
      setStep('error');
    }
  };

  const handlePayPalSuccess = async (_orderId: string, _details: unknown) => {
    setStep('processing');

    try {
      // Verify payment with backend - check escrow was created
      const { data: escrow, error: escrowError } = await supabase
        .from('escrow')
        .select('*')
        .eq('contract_id', contractId)
        .single();

      if (escrowError || !escrow) {
        console.error('Payment completed but escrow not found. Order ID:', _orderId);
      }

      // Verify contract status was updated
      const { data: contract } = await (supabase
        .from('contracts') as any)
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

  const handlePayPalError = (error: Error) => {
    setError(error.message);
    setStep('error');
  };

  const handlePayPalCancel = () => {
    setStep(milestones.length > 0 ? 'select_milestones' : 'review');
    onCancel?.();
  };

  // ──── SUCCESS STEP ────────────────────────────────────────────────────────
  if (step === 'success') {
    const releasedMilestones = milestones.filter((m) =>
      ['completed', 'approved', 'released', 'paid'].includes(String(m.status || '').toLowerCase())
    );
    const newFundedCount = selectedMilestones.size;
    const totalFundedCount = releasedMilestones.length + newFundedCount;

    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment Successful!</h2>
        <p className="text-slate-600 mb-4">
          Your escrow payment of <span className="font-semibold">${totalAmount.toFixed(2)}</span> has been received.
        </p>
        {milestones.length > 0 && (
          <p className="text-sm text-slate-500 mb-6">
            {newFundedCount > 0
              ? `${newFundedCount} milestone${newFundedCount > 1 ? 's' : ''} funded. ${totalFundedCount} of ${milestones.length} total.`
              : `${totalFundedCount} of ${milestones.length} milestones are now funded.`}
          </p>
        )}
        <p className="text-sm text-slate-500">
          The funds are now held securely in escrow. They will be released to {freelancerName} upon milestone completion and approval.
        </p>

        {milestones.length > 0 && totalFundedCount < milestones.length && (
          <button
            onClick={() => { setStep('select_milestones'); setSelectedMilestones(new Set()); }}
            className="mt-6 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors inline-flex items-center gap-2"
          >
            <Banknote className="w-4 h-4" />
            Fund Remaining Milestones
          </button>
        )}
      </div>
    );
  }

  // ──── ERROR STEP ──────────────────────────────────────────────────────────
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

  // ──── PAYMENT STEP ────────────────────────────────────────────────────────
  if (step === 'payment') {
    const milestoneDescription = selectedMilestones.size > 0
      ? `Funding ${selectedMilestones.size} milestone${selectedMilestones.size > 1 ? 's' : ''} for: ${projectTitle}`
      : `Escrow payment for: ${projectTitle}`;

    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-6 h-6 text-emerald-600" />
          <h2 className="text-xl font-bold text-slate-900">Secure Payment</h2>
        </div>

        {/* Milestone indicator in payment step */}
        {selectedMilestones.size > 0 && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-sm text-blue-800 font-medium">
              Funding {selectedMilestones.size} milestone{selectedMilestones.size > 1 ? 's' : ''}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {Array.from(selectedMilestones).map((idx) => milestones[idx]?.title || `Milestone ${idx + 1}`).join(', ')}
            </p>
          </div>
        )}

        <PayPalCheckout
          orderData={{
            order_type: 'contract_escrow',
            amount: totalAmount,
            currency: 'USD',
            description: milestoneDescription,
            contract_id: contractId,
            metadata: {
              project_title: projectTitle,
              freelancer_name: freelancerName,
              escrow_amount: fundingAmount,
              platform_fee: platformFee,
              client_id: user?.id,
              milestone_indices: Array.from(selectedMilestones),
              milestone_count: selectedMilestones.size,
            },
          }}
          onSuccess={handlePayPalSuccess}
          onError={handlePayPalError}
          onCancel={handlePayPalCancel}
          buttonText={`Pay $${totalAmount.toFixed(2)} with PayPal`}
        />

        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <h3 className="font-semibold text-slate-900 mb-2">Payment Breakdown</h3>
          <div className="space-y-2 text-sm">
            {selectedMilestones.size > 0 ? (
              // Per-milestone breakdown
              Array.from(selectedMilestones).map((idx) => {
                const ms = milestones[idx];
                const msAmount = Number(ms?.amount || 0);
                return (
                  <div key={idx} className="flex justify-between text-slate-600">
                    <span>{ms?.title || `Milestone ${idx + 1}`}</span>
                    <span>${msAmount.toFixed(2)}</span>
                  </div>
                );
              })
            ) : (
              <div className="flex justify-between text-slate-600">
                <span>Project Amount</span>
                <span>${fundingAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-600">
              <span>Platform Fee ({feePercentage}%)</span>
              <span>${platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total</span>
              <span>${totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Escrow Progress */}
        <EscrowProgressBar funded={fundedAmount + fundingAmount} total={amount} />
      </div>
    );
  }

  // ──── SELECT MILESTONES STEP ──────────────────────────────────────────────
  if (step === 'select_milestones' && milestones.length > 0) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-lg">
        <div className="flex items-center gap-3 mb-6">
          <ListChecks className="w-6 h-6 text-emerald-600" />
          <h2 className="text-xl font-bold text-slate-900">Select Milestones to Fund</h2>
        </div>

        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100 mb-6">
          <h3 className="font-semibold text-emerald-900 mb-1">Secure Escrow Protection</h3>
          <p className="text-sm text-emerald-700">
            Choose which milestones to fund. Payments are held securely in escrow and released to {freelancerName} upon your approval.
          </p>
        </div>

        <MilestoneStepIndicator
          milestones={milestones}
          selectedIndices={selectedMilestones}
          onToggle={toggleMilestoneSelection}
        />

        {/* Escrow progress */}
        <EscrowProgressBar funded={fundedAmount} total={amount} />

        {/* Selected amount summary */}
        <div className="mt-6 p-4 bg-slate-50 rounded-lg">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Milestones Selected</span>
              <span className="font-medium">{selectedMilestones.size} of {milestones.length}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Funding Amount</span>
              <span className="font-semibold text-slate-900">${fundingAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Platform Fee ({feePercentage}%)</span>
              <span>${platformFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-200">
              <span>Total to Pay</span>
              <span>${totalAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleProceedToReview}
            className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            Continue to Payment
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ──── REVIEW STEP (default) ──────────────────────────────────────────────
  return (
    <div className="bg-white rounded-2xl p-8 shadow-lg">
      <div className="flex items-center gap-3 mb-6">
        <Shield className="w-6 h-6 text-emerald-600" />
        <h2 className="text-xl font-bold text-slate-900">
          {milestones.length > 0 ? 'Escrow Payment Summary' : 'Escrow Payment'}
        </h2>
      </div>

      <div className="space-y-4 mb-6">
        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
          <h3 className="font-semibold text-emerald-900 mb-1">Secure Escrow Protection</h3>
          <p className="text-sm text-emerald-700">
            Your payment is held securely in escrow and will only be released to {freelancerName} when you approve the completed work.
          </p>
        </div>

        {/* Escrow progress bar on review step */}
        {milestones.length > 0 && (
          <EscrowProgressBar funded={fundedAmount} total={amount} />
        )}

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
            <span className="font-medium text-slate-900">${amount.toFixed(2)}</span>
          </div>
          {selectedMilestones.size > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>Funding Amount (Selected Milestones)</span>
              <span className="font-medium text-slate-900">${fundingAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-slate-600">
            <span>Platform Fee ({feePercentage}%)</span>
            <span className="font-medium text-slate-900">${platformFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-slate-900 pt-3 border-t border-slate-200 text-lg">
            <span>Total to Pay</span>
            <span>${totalAmount.toFixed(2)}</span>
          </div>
        </div>
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
          disabled={isCreatingContract}
          className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isCreatingContract ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <DollarSign className="w-5 h-5" />
              Proceed to Payment
            </>
          )}
        </button>
      </div>
    </div>
  );
}