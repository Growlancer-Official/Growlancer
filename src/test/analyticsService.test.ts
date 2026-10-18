import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyticsService } from '../lib/analyticsService';
import { supabase, dbFunctions } from '../lib/supabase';

// Shared stub shape for wallet RPC responses.
const stubWallet = {
  data: { balance: 0, pending_balance: 0 },
  error: null,
};

function stubContracts(records: Array<{ id: string; status: string; amount: number; created_at: string }>) {
  return vi.fn().mockResolvedValue({ data: records, error: null });
}

function stubProposals(records: Array<{ id: string; status: string; created_at: string }>) {
  return vi.fn().mockResolvedValue({ data: records, error: null });
}

function stubReviews(records: Array<{ rating: number; created_at: string }>) {
  return vi.fn().mockResolvedValue({ data: records, error: null });
}

function stubProfile(row: { response_rate: number; on_time_delivery_rate: number; repeat_hire_rate: number } | null) {
  return vi.fn().mockResolvedValue({ data: row ?? null, error: null });
}

function stubUsage(count: number) {
  return vi.fn().mockResolvedValue({ count, error: null });
}

function stubServices(records: Array<{ id: string; status: string; views: number; orders: number }>) {
  return vi.fn().mockResolvedValue({ data: records, error: null });
}

function stubMatches(records: Array<{ id: string; match_score: number }>) {
  return vi.fn().mockResolvedValue({ data: records, error: null });
}

function stubTransactions(records: Array<{ amount: number; created_at: string }>) {
  return vi.fn().mockResolvedValue({ data: records, error: null });
}

describe('analyticsService.getFreelancerAnalytics', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns minimum viable analytics when every backend call succeeds but is empty', async () => {
    const underTest = await import('../lib/analyticsService');
    const supabaseModule = await import('../lib/supabase');

    // The service performs 9 parallel calls; the contract below keeps the stubs
    // local to the test while still exercising the real aggregation logic.
    const contracts = stubContracts([]);
    const proposals = stubProposals([]);
    const reviews = stubReviews([]);
    const profile = stubProfile(null);
    const usage = stubUsage(0);
    const services = stubServices([]);
    const matches = stubMatches([]);
    const transactions = stubTransactions([]);
    const wallet = vi.fn().mockResolvedValue(stubWallet);

    // Swap the module's Supabase helpers for the stubs. The real import shadows
    // the named exports, so we replace the exact bindings the service reads.
    const originalFrom = supabaseModule.supabase.from.bind(supabaseModule.supabase);
    const originalRpc = supabaseModule.dbFunctions.getWalletBalance.bind(supabaseModule.dbFunctions);

    supabaseModule.supabase.from = vi.fn().mockImplementation((table: string) => {
      switch (table) {
        case 'contracts':
          return { select: contracts, eq: contracts, gte: contracts };
        case 'proposals':
          return { select: proposals, eq: proposals, gte: proposals };
        case 'reviews':
          return { select: reviews, eq: reviews, gte: reviews };
        case 'freelancer_profiles':
          return { select: profile, eq: profile, maybeSingle: profile };
        case 'usage_logs':
          return { select: usage, eq: usage };
        case 'services':
          return { select: services, eq: services };
        case 'ai_matches':
          return { select: matches, eq: matches, gte: matches };
        case 'transactions':
          return { select: transactions, eq: transactions, gte: transactions };
        default:
          return { select: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
    });

    supabaseModule.dbFunctions.getWalletBalance = wallet;

    const result = await underTest.analyticsService.getFreelancerAnalytics('user-1', '30d');

    expect(result).toEqual({
      totalEarnings: 0,
      monthlyEarnings: 0,
      pendingPayouts: 0,
      earningsByMonth: [],
      activeContracts: 0,
      completedContracts: 0,
      totalContracts: 0,
      contractSuccessRate: 0,
      totalProposals: 0,
      acceptedProposals: 0,
      pendingProposals: 0,
      proposalConversionRate: 0,
      profileViews: 0,
      profileViewsChange: 0,
      averageRating: 0,
      totalReviews: 0,
      responseRate: 0,
      onTimeDelivery: 0,
      repeatHireRate: 0,
      activeServices: 0,
      totalServiceViews: 0,
      totalServiceOrders: 0,
      newMatches: 0,
      totalMatches: 0,
    });

    // Restore bindings so the next test starts clean.
    supabaseModule.supabase.from = originalFrom;
    supabaseModule.dbFunctions.getWalletBalance = originalRpc;
  });
});
