/**
 * Unit tests for src/lib/sellerLevels.ts
 * Pure functions — no mocking needed.
 */
import { describe, it, expect } from 'vitest';
import {
  computeSellerLevel,
  getSellerLevelInfo,
  getSellerLevelProgress,
  getSellerLevelBadgeProps,
  type SellerLevel,
} from '../lib/sellerLevels';

// ─── computeSellerLevel ─────────────────────────────────────────────────────

describe('computeSellerLevel', () => {
  describe('top_rated_plus', () => {
    it('returns top_rated_plus at exact thresholds', () => {
      expect(computeSellerLevel({ rating: 4.8, totalProjects: 50, completionRate: 95 }))
        .toBe('top_rated_plus');
    });
    it('returns top_rated_plus above all thresholds', () => {
      expect(computeSellerLevel({ rating: 5.0, totalProjects: 100, completionRate: 100 }))
        .toBe('top_rated_plus');
    });
    it('does NOT return top_rated_plus if rating is just below threshold', () => {
      expect(computeSellerLevel({ rating: 4.79, totalProjects: 50, completionRate: 95 }))
        .not.toBe('top_rated_plus');
    });
    it('does NOT return top_rated_plus if projects are just below threshold', () => {
      expect(computeSellerLevel({ rating: 4.8, totalProjects: 49, completionRate: 95 }))
        .not.toBe('top_rated_plus');
    });
    it('does NOT return top_rated_plus if completion is just below threshold', () => {
      expect(computeSellerLevel({ rating: 4.8, totalProjects: 50, completionRate: 94 }))
        .not.toBe('top_rated_plus');
    });
  });

  describe('top_rated', () => {
    it('returns top_rated at exact thresholds', () => {
      expect(computeSellerLevel({ rating: 4.5, totalProjects: 25, completionRate: 90 }))
        .toBe('top_rated');
    });
    it('returns top_rated when below top_rated_plus but above top_rated thresholds', () => {
      expect(computeSellerLevel({ rating: 4.7, totalProjects: 30, completionRate: 92 }))
        .toBe('top_rated');
    });
    it('does NOT return top_rated if projects are just below threshold', () => {
      const level = computeSellerLevel({ rating: 4.5, totalProjects: 24, completionRate: 90 });
      expect(level).not.toBe('top_rated');
      expect(level).not.toBe('top_rated_plus');
    });
  });

  describe('rising_talent', () => {
    it('returns rising_talent at exact thresholds', () => {
      expect(computeSellerLevel({ rating: 4.0, totalProjects: 5, completionRate: 80 }))
        .toBe('rising_talent');
    });
    it('returns rising_talent in the middle range', () => {
      expect(computeSellerLevel({ rating: 4.3, totalProjects: 10, completionRate: 85 }))
        .toBe('rising_talent');
    });
  });

  describe('level_1', () => {
    it('returns level_1 with exactly 1 project regardless of rating', () => {
      expect(computeSellerLevel({ rating: 0, totalProjects: 1, completionRate: 0 }))
        .toBe('level_1');
    });
    it('returns level_1 even with good rating but below rising_talent project threshold', () => {
      expect(computeSellerLevel({ rating: 4.5, totalProjects: 4, completionRate: 85 }))
        .toBe('level_1');
    });
    it('returns level_1 with high projects but low rating (below rising_talent)', () => {
      expect(computeSellerLevel({ rating: 3.5, totalProjects: 10, completionRate: 85 }))
        .toBe('level_1');
    });
  });

  describe('new', () => {
    it('returns new with 0 projects', () => {
      expect(computeSellerLevel({ rating: 0, totalProjects: 0, completionRate: 0 }))
        .toBe('new');
    });
    it('returns new with high rating but no projects', () => {
      expect(computeSellerLevel({ rating: 5.0, totalProjects: 0, completionRate: 100 }))
        .toBe('new');
    });
  });

  describe('priority order (all thresholds simultaneously satisfied)', () => {
    it('prefers top_rated_plus over top_rated when both thresholds met', () => {
      expect(computeSellerLevel({ rating: 4.8, totalProjects: 50, completionRate: 95 }))
        .toBe('top_rated_plus');
    });
  });
});

// ─── getSellerLevelInfo ──────────────────────────────────────────────────────

describe('getSellerLevelInfo', () => {
  const levels: SellerLevel[] = ['new', 'level_1', 'rising_talent', 'top_rated', 'top_rated_plus'];

  it('returns info for every level without throwing', () => {
    for (const level of levels) {
      expect(() => getSellerLevelInfo(level)).not.toThrow();
    }
  });

  it('top_rated_plus has no next level', () => {
    expect(getSellerLevelInfo('top_rated_plus').nextLevel).toBeNull();
  });

  it('new has next level level_1', () => {
    expect(getSellerLevelInfo('new').nextLevel).toBe('level_1');
  });

  it('level_1 has next level rising_talent', () => {
    expect(getSellerLevelInfo('level_1').nextLevel).toBe('rising_talent');
  });

  it('each level info has required display fields', () => {
    for (const level of levels) {
      const info = getSellerLevelInfo(level);
      expect(info.label).toBeTruthy();
      expect(info.color).toBeTruthy();
      expect(info.bgColor).toBeTruthy();
      expect(info.description).toBeTruthy();
      expect(Array.isArray(info.requirements)).toBe(true);
      expect(Array.isArray(info.nextRequirements)).toBe(true);
    }
  });
});

// ─── getSellerLevelProgress ──────────────────────────────────────────────────

describe('getSellerLevelProgress', () => {
  it('returns percent 100 and null nextLevel at top_rated_plus', () => {
    const result = getSellerLevelProgress({ rating: 5.0, totalProjects: 100, completionRate: 100 });
    expect(result.percent).toBe(100);
    expect(result.nextLevel).toBeNull();
  });

  it('progress percent is between 0 and 99 for non-max levels', () => {
    const metrics = { rating: 0, totalProjects: 0, completionRate: 0 };
    const { percent } = getSellerLevelProgress(metrics);
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(99);
  });

  it('returns nextLevel for non-max levels', () => {
    const { nextLevel } = getSellerLevelProgress({ rating: 2.0, totalProjects: 3, completionRate: 70 });
    expect(nextLevel).toBeTruthy();
  });

  it('handles NaN inputs gracefully (returns 0, not NaN)', () => {
    const { percent } = getSellerLevelProgress({ rating: NaN, totalProjects: NaN, completionRate: NaN });
    expect(Number.isFinite(percent)).toBe(true);
    expect(percent).toBe(0);
  });

  it('handles Infinity inputs gracefully', () => {
    const { percent } = getSellerLevelProgress({ rating: Infinity, totalProjects: Infinity, completionRate: Infinity });
    expect(Number.isFinite(percent)).toBe(true);
  });

  it('level_1 progress only depends on project count (not rating/completion)', () => {
    // level_1 threshold = 1 project only
    const half = getSellerLevelProgress({ rating: 0, totalProjects: 0, completionRate: 0 });
    const full = getSellerLevelProgress({ rating: 5.0, totalProjects: 1, completionRate: 100 });
    // With 0 projects toward level_1 (needs 1 project), percent should be 0
    expect(half.percent).toBe(0);
    // With 1 project (already at level_1, now targeting rising_talent), nextLevel is rising_talent
    expect(full.nextLevel).toBe('rising_talent');
  });

  it('progress never exceeds 99 for incomplete levels', () => {
    // Just under top_rated thresholds
    const result = getSellerLevelProgress({ rating: 4.49, totalProjects: 24, completionRate: 89 });
    expect(result.percent).toBeLessThanOrEqual(99);
  });
});

// ─── getSellerLevelBadgeProps ────────────────────────────────────────────────

describe('getSellerLevelBadgeProps', () => {
  it('returns non-empty label and className', () => {
    const props = getSellerLevelBadgeProps('top_rated');
    expect(props.label).toBeTruthy();
    expect(props.className).toContain('rounded-full');
  });

  it('className contains Tailwind classes for each level', () => {
    const levels: SellerLevel[] = ['new', 'level_1', 'rising_talent', 'top_rated', 'top_rated_plus'];
    for (const level of levels) {
      const { className } = getSellerLevelBadgeProps(level);
      expect(className).toContain('inline-flex');
    }
  });
});
