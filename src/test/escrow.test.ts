/**
 * Unit tests for escrow and contract flows.
 * Tests the critical money-movement logic in src/lib/dataService.ts
 * and src/lib/workflowService.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────
// We mock at the module level so all imports of ../lib/supabase get the same mock.

const mockFunctions = { invoke: vi.fn() };
const mockRpc = vi.fn();

// Chain builder: creates a fluent Supabase query mock
function makeChain(resolvedValue: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'neq', 'in', 'order', 'limit', 'single', 'maybeSingle', 'update', 'insert', 'upsert', 'not'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal methods return the resolved value
  (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedValue);
  (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue(resolvedValue);
  (chain.update as ReturnType<typeof vi.fn>).mockReturnValue({ ...chain, then: undefined });
  // Make the chain itself awaitable for insert/update patterns
  Object.defineProperty(chain, Symbol.iterator, { value: undefined });
  return chain;
}

const mockFrom = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
    functions: mockFunctions,
  },
  dbFunctions: {
    createContractWithEscrow: vi.fn(),
    fundEscrow: vi.fn(),
    releaseEscrow: vi.fn(),
  },
  realtimeChannels: {
    contracts: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
  },
  uniqueChannelName: vi.fn(() => 'test-channel'),
  callRpc: vi.fn(),
}));

vi.mock('../lib/telemetry', () => ({
  captureError: vi.fn(),
}));

vi.mock('../lib/services/cacheManager', () => ({
  CacheManager: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    invalidate: vi.fn(),
  },
}));

vi.mock('../lib/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/config')>();
  return actual; // Use real config so fee math is tested correctly
});

// ─── calculatePlatformFee (integration with dataService) ─────────────────────

describe('platform fee calculation in contract creation', () => {
  it('fee is 5% of bid amount', async () => {
    const { calculatePlatformFee, calculateTotalWithFee } = await import('../lib/config');
    const bid = 10000;
    expect(calculatePlatformFee(bid)).toBe(500);
    expect(calculateTotalWithFee(bid)).toBe(10500);
  });
});

// ─── escrowService.release ────────────────────────────────────────────────────

describe('escrowService.release', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns false if escrow row does not exist', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { escrowService } = await import('../lib/dataService');
    const result = await escrowService.release('contract_123');
    expect(result).toBe(false);
  });

  it('returns false if escrow is not in funded state', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'escrow_1', contract_id: 'contract_123', status: 'pending', amount: 10000 },
        error: null,
      }),
    });

    const { escrowService } = await import('../lib/dataService');
    const result = await escrowService.release('contract_123');
    expect(result).toBe(false);
  });

  it('releases a funded escrow successfully', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: select escrow
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'escrow_1', contract_id: 'contract_123', status: 'funded', amount: 10000 },
            error: null,
          }),
        };
      }
      // Subsequent calls: update escrow / contract — return success
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
      };
    });

    const { escrowService } = await import('../lib/dataService');
    const result = await escrowService.release('contract_123');
    expect(result).toBe(true);
  });

  it('returns false if release update throws', async () => {
    let callCount = 0;
    mockFrom.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'escrow_1', contract_id: 'contract_123', status: 'funded', amount: 10000 },
            error: null,
          }),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockRejectedValue(new Error('DB write failed')),
      };
    });

    const { escrowService } = await import('../lib/dataService');
    const result = await escrowService.release('contract_123');
    expect(result).toBe(false);
  });
});

// ─── escrowService.getByContract ─────────────────────────────────────────────

describe('escrowService.getByContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns escrow data when found', async () => {
    const escrowData = {
      id: 'escrow_1',
      contract_id: 'contract_123',
      client_id: 'client_1',
      freelancer_id: 'freelancer_1',
      amount: 15000,
      status: 'funded',
    };

    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: escrowData, error: null }),
    });

    const { escrowService } = await import('../lib/dataService');
    const result = await escrowService.getByContract('contract_123');
    expect(result).toEqual(escrowData);
  });

  it('returns null when escrow row is not found', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const { escrowService } = await import('../lib/dataService');
    const result = await escrowService.getByContract('contract_not_found');
    expect(result).toBeNull();
  });
});

// ─── workflowService.hireFreelancerFromProposal ───────────────────────────────

describe('hireFreelancerFromProposal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns success: false when proposal is not found (RPC path)', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Proposal not found' } }),
    });

    const { hireFreelancerFromProposal } = await import('../lib/workflowService');
    const result = await hireFreelancerFromProposal('missing_proposal', 'client_1', { useEscrowRpc: true });
    expect(result.success).toBe(false);
    expect((result as { success: false; error: string }).error).toBeTruthy();
  });

  it('returns success: false when contractsService fails (non-RPC path)', async () => {
    // Mock all chained DB calls to return errors
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Proposal not found' },
      }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
    });

    const { hireFreelancerFromProposal } = await import('../lib/workflowService');
    const result = await hireFreelancerFromProposal('proposal_123', 'client_1');
    expect(result.success).toBe(false);
  });
});

// ─── contractsService fee invariants ─────────────────────────────────────────

describe('contract fee math invariants', () => {
  it('platform fee is always 5% of bid, freelancer gets full bid', async () => {
    const { calculatePlatformFee, calculateFreelancerAmount } = await import('../lib/config');

    // Simulate multiple bid amounts
    const bids = [5000, 10000, 25000, 100000];
    for (const bid of bids) {
      const fee = calculatePlatformFee(bid);
      const freelancerGets = calculateFreelancerAmount(bid);

      expect(fee).toBeCloseTo(bid * 0.05, 5);
      expect(freelancerGets).toBe(bid); // Freelancer always gets full bid
    }
  });

  it('client always pays more than freelancer receives (platform takes its cut)', async () => {
    const { calculatePlatformFee, calculateFreelancerAmount, calculateTotalWithFee } = await import('../lib/config');
    const bid = 20000;
    const clientPays = calculateTotalWithFee(bid);
    const freelancerGets = calculateFreelancerAmount(bid);
    const platformEarns = calculatePlatformFee(bid);

    expect(clientPays).toBeGreaterThan(freelancerGets);
    expect(clientPays).toBe(freelancerGets + platformEarns);
  });
});
