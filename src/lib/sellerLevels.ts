/**
 * Seller Levels & Progression System
 *
 * Computes a freelancer's seller level based on performance metrics:
 * - Top Rated Plus: 4.8+ rating, 50+ projects, 95%+ completion
 * - Top Rated: 4.5+ rating, 25+ projects, 90%+ completion
 * - Rising Talent: 4.0+ rating, 5+ projects, 80%+ completion
 * - Level 1: 3.5+ rating, 1+ project
 * - Level 0 / New: Below thresholds
 */

export type SellerLevel =
  | 'top_rated_plus'
  | 'top_rated'
  | 'rising_talent'
  | 'level_1'
  | 'new';

export interface SellerLevelInfo {
  level: SellerLevel;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconBg: string;
  description: string;
  requirements: string[];
  nextLevel: SellerLevel | null;
  nextRequirements: string[];
}

const LEVEL_CONFIG: Record<SellerLevel, { label: string; color: string; bgColor: string; borderColor: string; iconBg: string; description: string }> = {
  top_rated_plus: {
    label: 'Top Rated Plus',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconBg: 'bg-amber-100',
    description: 'Elite status. Highest visibility and trust on the platform.',
  },
  top_rated: {
    label: 'Top Rated',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    iconBg: 'bg-amber-100',
    description: 'Proven track record of excellent work and client satisfaction.',
  },
  rising_talent: {
    label: 'Rising Talent',
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    iconBg: 'bg-blue-100',
    description: 'Strong early performance. On track for Top Rated status.',
  },
  level_1: {
    label: 'Level 1',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
    iconBg: 'bg-emerald-100',
    description: 'Active freelancer with completed projects.',
  },
  new: {
    label: 'New Freelancer',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
    iconBg: 'bg-slate-100',
    description: 'Just getting started. Complete your profile to attract clients.',
  },
};

/**
 * Compute seller level from performance metrics.
 */
export function computeSellerLevel(metrics: {
  rating: number;
  totalProjects: number;
  completionRate: number;
}): SellerLevel {
  const { rating, totalProjects, completionRate } = metrics;

  if (rating >= 4.8 && totalProjects >= 50 && completionRate >= 95) {
    return 'top_rated_plus';
  }
  if (rating >= 4.5 && totalProjects >= 25 && completionRate >= 90) {
    return 'top_rated';
  }
  if (rating >= 4.0 && totalProjects >= 5 && completionRate >= 80) {
    return 'rising_talent';
  }
  if (totalProjects >= 1) {
    return 'level_1';
  }
  return 'new';
}

/**
 * Get full info for a seller level, including requirements for the next level.
 */
export function getSellerLevelInfo(level: SellerLevel): SellerLevelInfo {
  const config = LEVEL_CONFIG[level];

  const requirementsMap: Record<SellerLevel, { current: string[]; next: string[] }> = {
    top_rated_plus: {
      current: ['4.8+ rating', '50+ projects', '95%+ completion rate'],
      next: [],
    },
    top_rated: {
      current: ['4.5+ rating', '25+ projects', '90%+ completion rate'],
      next: ['4.8+ rating', '50+ projects', '95%+ completion rate'],
    },
    rising_talent: {
      current: ['4.0+ rating', '5+ projects', '80%+ completion rate'],
      next: ['4.5+ rating', '25+ projects', '90%+ completion rate'],
    },
    level_1: {
      current: ['1+ completed project'],
      next: ['4.0+ rating', '5+ projects', '80%+ completion rate'],
    },
    new: {
      current: [],
      next: ['1+ completed project'],
    },
  };

  const levels: SellerLevel[] = ['new', 'level_1', 'rising_talent', 'top_rated', 'top_rated_plus'];
  const currentIdx = levels.indexOf(level);
  const nextLevel = currentIdx < levels.length - 1 ? levels[currentIdx + 1] : null;

  return {
    level,
    label: config.label,
    color: config.color,
    bgColor: config.bgColor,
    borderColor: config.borderColor,
    iconBg: config.iconBg,
    description: config.description,
    requirements: requirementsMap[level].current,
    nextLevel,
    nextRequirements: requirementsMap[level].next,
  };
}

/**
 * Get a progress percentage toward the next seller level.
 */
export function getSellerLevelProgress(metrics: {
  rating: number;
  totalProjects: number;
  completionRate: number;
}): { percent: number; nextLevel: SellerLevel | null } {
  const level = computeSellerLevel({ rating: metrics.rating, totalProjects: metrics.totalProjects, completionRate: metrics.completionRate });
  const info = getSellerLevelInfo(level);

  if (!info.nextLevel) return { percent: 100, nextLevel: null };

  // Calculate rough progress based on the most constraining factor
  const nextThresholds: Record<SellerLevel, { rating: number; projects: number; completion: number }> = {
    level_1: { rating: 0, projects: 1, completion: 0 },
    rising_talent: { rating: 4.0, projects: 5, completion: 80 },
    top_rated: { rating: 4.5, projects: 25, completion: 90 },
    top_rated_plus: { rating: 4.8, projects: 50, completion: 95 },
    new: { rating: 0, projects: 0, completion: 0 },
  };

  const target = nextThresholds[info.nextLevel!];
  const ratingProgress = Math.min(metrics.rating / target.rating, 1) * 33;
  const projectProgress = Math.min(metrics.totalProjects / target.projects, 1) * 33;
  const completionProgress = Math.min(metrics.completionRate / target.completion, 1) * 34;

  return {
    percent: Math.round(Math.min(ratingProgress + projectProgress + completionProgress, 99)),
    nextLevel: info.nextLevel,
  };
}

/**
 * Seller level badge component props helper.
 */
export function getSellerLevelBadgeProps(level: SellerLevel) {
  const info = getSellerLevelInfo(level);
  return {
    label: info.label,
    className: `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${info.bgColor} ${info.color} ${info.borderColor}`,
  };
}
