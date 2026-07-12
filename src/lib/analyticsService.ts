// Freelancer Analytics Service
// Provides aggregated analytics data for freelancer dashboard
import { supabase, dbFunctions } from './supabase';

export interface AnalyticsData {
  // Earnings
  totalEarnings: number;
  monthlyEarnings: number;
  pendingPayouts: number;
  earningsByMonth: { month: string; amount: number }[];

  // Contracts
  activeContracts: number;
  completedContracts: number;
  totalContracts: number;
  contractSuccessRate: number;

  // Proposals
  totalProposals: number;
  acceptedProposals: number;
  pendingProposals: number;
  proposalConversionRate: number;

  // Profile & Reputation
  profileViews: number;
  profileViewsChange: number;
  averageRating: number;
  totalReviews: number;
  responseRate: number;
  onTimeDelivery: number;
  repeatHireRate: number;

  // Services
  activeServices: number;
  totalServiceViews: number;
  totalServiceOrders: number;

  // Project matches
  newMatches: number;
  totalMatches: number;
}

export const analyticsService = {
  /**
   * Get comprehensive analytics for a freelancer.
   */
  async getFreelancerAnalytics(freelancerId: string, timeframe: '7d' | '30d' | '90d' | '1y' = '30d'): Promise<AnalyticsData> {
    const defaultData: AnalyticsData = {
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
    };

    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Compute date range from timeframe
      const timeframeDays = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : timeframe === '90d' ? 90 : 365;
      const timeframeStart = new Date(now.getTime() - timeframeDays * 24 * 60 * 60 * 1000).toISOString();

      // Run all queries in parallel
      const [
        contractsResult,
        proposalsResult,
        reviewsResult,
        profileResult,
        servicesResult,
        matchesResult,
        walletResult,
        transactionsResult,
      ] = await Promise.all([
        // Contracts
        supabase
          .from('contracts')
          .select('id, status, amount')
          .eq('freelancer_id', freelancerId)
          .gte('created_at', timeframeStart),
        // Proposals
        supabase
          .from('proposals')
          .select('id, status')
          .eq('freelancer_id', freelancerId)
          .gte('created_at', timeframeStart),
        // Reviews (using the reviews table)
        supabase
          .from('reviews')
          .select('rating, created_at')
          .eq('reviewee_id', freelancerId)
          .gte('created_at', timeframeStart),
        // Profile
        supabase
          .from('freelancer_profiles')
          .select('profile_views, response_rate, on_time_delivery_rate, repeat_hire_rate')
          .eq('user_id', freelancerId)
          .maybeSingle(),
        // Services
        supabase
          .from('services')
          .select('id, status, views, orders')
          .eq('freelancer_id', freelancerId),
        // AI Matches
        supabase
          .from('ai_matches')
          .select('id, match_score')
          .eq('freelancer_id', freelancerId)
          .gte('match_score', 70),
        // Wallet — use RPC for reliability (auto-creates wallet if missing)
        dbFunctions.getWalletBalance(freelancerId),
        // Transactions for monthly earnings
        supabase
          .from('transactions')
          .select('amount, created_at')
          .eq('user_id', freelancerId)
          .eq('type', 'credit')
          .gte('created_at', timeframeStart),
      ]);

      // Process contracts
      const contracts = contractsResult.data || [];
      const activeContracts = contracts.filter((c: any) => c.status === 'active' || c.status === 'pending').length;
      const completedContracts = contracts.filter((c: any) => c.status === 'completed').length;

      // Process proposals
      const proposals = proposalsResult.data || [];
      const acceptedProposals = proposals.filter((p: any) => p.status === 'accepted').length;

      // Process reviews
      const reviews = reviewsResult.data || [];
      const averageRating = reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + (r.rating || 0), 0) / reviews.length
        : 0;

      // Process profile
      const profileData = profileResult.data as any;
      const profileViews = (profileData?.profile_views as number) || 0;

      // Process services
      const services = servicesResult.data || [];
      const activeServices = services.filter((s: any) => s.status === 'active').length;
      const totalServiceViews = services.reduce((sum: number, s: any) => sum + (s.views || 0), 0);
      const totalServiceOrders = services.reduce((sum: number, s: any) => sum + (s.orders || 0), 0);

      // Process matches
      const newMatches = (matchesResult.data || []).length;

      // Process wallet
      const wallet = walletResult.data;
      const totalEarnings = wallet?.balance || 0;
      const pendingPayouts = wallet?.pending_balance || 0;

      // Process transactions for monthly earnings
      const txData = transactionsResult.data || [];
      const monthlyEarnings = txData
        .filter((t: any) => t.created_at >= startOfMonth)
        .reduce((sum: number, t: any) => sum + (t.amount || 0), 0);

      // Build monthly earnings chart
      const earningsByMonth = buildMonthlyEarnings(txData as Array<{ amount: number; created_at: string }>);

      return {
        ...defaultData,
        totalEarnings,
        monthlyEarnings,
        pendingPayouts,
        earningsByMonth,
        activeContracts,
        completedContracts,
        totalContracts: contracts.length,
        contractSuccessRate: contracts.length > 0
          ? Math.round((completedContracts / contracts.length) * 100) : 0,
        totalProposals: proposals.length,
        acceptedProposals,
        pendingProposals: proposals.filter((p: any) => p.status === 'pending').length,
        proposalConversionRate: proposals.length > 0
          ? Math.round((acceptedProposals / proposals.length) * 100) : 0,
        profileViews,
        profileViewsChange: 0,
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: reviews.length,
        responseRate: (profileData?.response_rate as number) || 0,
        onTimeDelivery: (profileData?.on_time_delivery_rate as number) || 0,
        repeatHireRate: (profileData?.repeat_hire_rate as number) || 0,
        activeServices,
        totalServiceViews,
        totalServiceOrders,
        newMatches,
        totalMatches: (matchesResult.data || []).length,
      };
    } catch (error) {
      console.error('Error fetching analytics:', error);
      return defaultData;
    }
  },
};

/**
 * Helper to aggregate transactions into monthly buckets.
 */
function buildMonthlyEarnings(transactions: Array<{ amount: number; created_at: string }>): { month: string; amount: number }[] {
  const months: Record<string, number> = {};
  const now = new Date();

  // Initialize last 6 months
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months[key] = 0;
  }

  // Aggregate
  transactions.forEach((t) => {
    if (!t.created_at) return;
    const d = new Date(t.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (months[key] !== undefined) {
      months[key] += t.amount || 0;
    }
  });

  return Object.entries(months).map(([month, amount]) => ({
    month,
    amount: Math.round(amount * 100) / 100,
  }));
}