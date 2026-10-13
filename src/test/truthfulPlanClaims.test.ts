import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Truthful plan claims — the plan surfaces advertised benefits the product does
 * not deliver, including on the LIVE paid plan (Rs 299/month):
 *
 *   "Unlimited AI writing"      -> ai-writer caps Pro at PRO_DAILY_LIMIT (100/day)
 *   "Priority AI responses"     -> no priority/queue mechanism exists at all
 *   "Priority support 24/7"     -> there is no 24/7 human support team
 *   "Advanced analytics"        -> the analytics dashboard is FREE for everyone,
 *                                  so it can never be sold as a Premium unlock
 *   "AI profile optimization"   -> no such feature exists anywhere in the code
 *   "Priority AI project matching" / "Featured profile placement"
 *                               -> pay-to-win. Ranking and matching are 100%
 *                                  merit-based and a paid flag may never influence
 *                                  them (non-negotiable business rule).
 *
 * These were copy + seed-data defects, so no behavioural test could see them.
 * This guard reads the real files and fails if any claim comes back.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

/** Every surface that sells a plan, escrow or a trust badge to a user. */
const PLAN_SURFACES = [
  'src/pages/PricingPage.tsx',
  'src/pages/ProSubscriptionPage.tsx',
  'src/components/SubscriptionPayPalPayment.tsx',
  'src/lib/supportTopics.ts',
  'src/lib/config.ts',
  'src/pages/AboutPage.tsx',
  'src/pages/ServiceDetailPage.tsx',
  'src/pages/HelpCenterPage.tsx',
];

/** A claim the product cannot honour, or that would break merit-based ranking. */
const FORBIDDEN: Array<{ label: string; re: RegExp }> = [
  // "unlimited" describing writing. The adjective form is adjacent; the em-dash
  // form ("AI writing (…) — unlimited") reverses the order, so it needs its own
  // pattern. A plain proximity window is wrong both ways: it flags a truthful
  // "AI writing, unlimited AI assistant messages" line and misses the em-dash one.
  { label: 'unlimited AI writing', re: /\bunlimited\s+(?:ai[-\s]?generated\s+|ai\s+)?writing\b/i },
  { label: 'writing declared unlimited', re: /\bwriting\b[^.\n]{0,60}?[—–:-]\s*unlimited\b/i },
  { label: 'priority AI responses', re: /priority\s+ai\s+responses?/i },
  { label: 'priority support', re: /priority\s+(human\s+)?support/i },
  { label: '24/7 priority', re: /24\/7\s*priority/i },
  { label: 'advanced analytics', re: /advanced\s+(earnings\s+|project\s+|talent\s+)?analytics/i },
  { label: 'AI profile optimization', re: /(ai|profile)\s+optimi[sz]ation/i },
  { label: 'priority matching', re: /priority[-\s]+(ai\s+)?(project\s+|freelancer\s+)?matching/i },
  { label: 'featured profile placement', re: /featured\s+(profile\s+)?placement/i },
  { label: 'high-priority visibility', re: /high[-\s]priority\s+visibility/i },
  // Absolute guarantees. Escrow protects the money, but it never guarantees the
  // outcome: a dispute can refund the client and a client can still reject work.
  { label: '100% secure', re: /100%\s*secure/i },
  { label: 'satisfaction guarantee', re: /satisfaction\s+guarantee/i },
  { label: '100% escrow guarantee', re: /100%\s*escrow/i },
  {
    label: 'absolute escrow/delivery guarantee',
    re: /guarantee[ds]?\s+(secure|payment|deliverables?|collaboration)/i,
  },
];

/** Find every forbidden claim in a blob of text (one line at a time). */
function violations(text: string): string[] {
  const hits: string[] = [];
  for (const line of text.split('\n')) {
    for (const { label, re } of FORBIDDEN) {
      if (re.test(line)) hits.push(`${label}: ${line.trim().slice(0, 120)}`);
    }
  }
  return hits;
}

const PRO_DAILY_LIMIT = Number(
  /PRO_DAILY_LIMIT\s*=\s*(\d+)/.exec(read('supabase/functions/ai-writer/index.ts'))?.[1]
);

describe('plan claims are truthful', () => {
  it.each(PLAN_SURFACES)('%s advertises no benefit we cannot deliver', (rel) => {
    expect(violations(read(rel))).toEqual([]);
  });

  it('the advertised writing cap is the cap the edge function actually enforces', () => {
    // The number in the copy must be the number in the code, or the two drift.
    expect(PRO_DAILY_LIMIT).toBe(100);
    for (const rel of [
      'src/pages/ProSubscriptionPage.tsx',
      'src/components/SubscriptionPayPalPayment.tsx',
      'src/pages/PricingPage.tsx',
    ]) {
      expect(read(rel)).toContain(String(PRO_DAILY_LIMIT));
    }
  });

  it('analytics is never sold as a Premium unlock (it is free for everyone)', () => {
    // A Premium-gated analytics claim would be a false differentiator.
    expect(read('src/pages/ProSubscriptionPage.tsx')).not.toMatch(
      /analytics[^.\n]{0,40}(premium|pro\b)/i
    );
    expect(read('src/pages/ProSubscriptionPage.tsx')).toContain('Included — free for everyone');
  });

  it('the seed-data migration scrubs the DB plan rows and fails closed', () => {
    const migration = read('supabase/migrations/20270119000027_truthful_plan_features.sql');
    // fail-closed: a surviving false / pay-to-win claim must abort the deploy
    expect(migration).toContain('false/pay-to-win plan claims still present');
    // and the same claim classes the UI guard forbids must be scrubbed in data
    for (const token of ['unlimited', 'advanced', 'priority', 'featured', 'verified', '24/7']) {
      expect(migration.toLowerCase()).toContain(token);
    }
    // the live plan must state the real cap
    expect(migration).toContain('100 generations per day');
  });
});

describe('the claim detector itself (negative control)', () => {
  it('flags the real historical claims', () => {
    const historical = [
      'Unlimited AI writing',
      'AI writing (titles, descriptions, cover letters) — unlimited',
      'Priority AI responses',
      'Priority support 24/7',
      'Advanced earnings analytics',
      'AI profile optimization',
      'Priority AI project matching',
      'Featured profile placement',
      'Pro subscribers receive high-priority visibility',
      'Satisfaction guaranteed',
      '100% Secure',
      '100% Escrow and Deliverable IP Protection Guaranteed.',
      'Escrow protection guarantees secure collaboration',
      'This ensures freelancers are guaranteed payment upon successful completion',
    ];
    for (const claim of historical) {
      expect(violations(claim), `should flag: ${claim}`).not.toEqual([]);
    }
  });

  it('does not flag the truthful replacements', () => {
    const honest = [
      'Unlimited AI assistant messages',
      'AI writing — 100 generations per day',
      'No monthly cap on AI assistant messages',
      'Pro badge on your public profile',
      'Merit-based — same for all',
      'Analytics Dashboard',
      'Included — free for everyone',
      'Cancel anytime — no lock-in',
      'Email, support tickets & AI assistant',
      'Escrow Protected',
      'Funds held until you approve',
      'You approve the work before funds release',
      'Escrow-protected payments — IP transfers to the client on final release.',
      'AI Matching',
    ];
    for (const line of honest) {
      expect(violations(line), `should NOT flag: ${line}`).toEqual([]);
    }
  });
});
