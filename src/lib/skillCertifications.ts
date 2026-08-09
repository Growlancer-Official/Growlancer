/**
 * Skill Certification System
 *
 * Allows freelancers to take skill assessments and earn verified badges.
 * Badges are displayed on profiles and search results to build trust.
 */

import { supabase } from './supabase';

export interface SkillCertification {
  id: string;
  user_id: string;
  skill: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  score: number;
  max_score: number;
  passed_at: string | null;
  expires_at: string | null;
  certificate_url: string | null;
  created_at: string;
}

export interface SkillTest {
  id: string;
  skill: string;
  category: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  question_count: number;
  time_limit_minutes: number;
  passing_score: number;
}

// Predefined skill tests available on the platform
export const AVAILABLE_SKILL_TESTS: SkillTest[] = [
  { id: 'js-basic', skill: 'JavaScript', category: 'Web Development', description: 'Core JavaScript fundamentals, ES6+, async/await', difficulty: 'beginner', question_count: 20, time_limit_minutes: 30, passing_score: 70 },
  { id: 'js-adv', skill: 'JavaScript', category: 'Web Development', description: 'Advanced patterns, closures, prototypes, performance', difficulty: 'advanced', question_count: 25, time_limit_minutes: 45, passing_score: 80 },
  { id: 'react', skill: 'React', category: 'Web Development', description: 'Components, hooks, state management, rendering', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'node', skill: 'Node.js', category: 'Backend Development', description: 'Express, APIs, middleware, database integration', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'python', skill: 'Python', category: 'Data Science', description: 'Python fundamentals, OOP, data structures', difficulty: 'beginner', question_count: 20, time_limit_minutes: 30, passing_score: 70 },
  { id: 'sql', skill: 'SQL', category: 'Database', description: 'Queries, joins, indexing, optimization', difficulty: 'intermediate', question_count: 15, time_limit_minutes: 25, passing_score: 75 },
  { id: 'design-ui', skill: 'UI Design', category: 'UI/UX Design', description: 'Design principles, typography, color theory, layout', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'seo', skill: 'SEO', category: 'Digital Marketing', description: 'On-page, technical SEO, keyword research, analytics', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 70 },
  { id: 'typescript', skill: 'TypeScript', category: 'Web Development', description: 'Types, generics, utility types, declaration files', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'aws', skill: 'AWS', category: 'DevOps', description: 'EC2, S3, Lambda, IAM, networking fundamentals', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 35, passing_score: 75 },
  // ─── NEW: Realtime/Valuable Skills ───────────────────────────────
  { id: 'ai-prompt', skill: 'AI & Prompt Engineering', category: 'Artificial Intelligence', description: 'Prompt engineering, system prompts, chain-of-thought, AI model parameters', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 70 },
  { id: 'tailwind', skill: 'Tailwind CSS', category: 'Frontend Development', description: 'Utility classes, responsive design, layouts, transitions', difficulty: 'beginner', question_count: 15, time_limit_minutes: 20, passing_score: 70 },
  { id: 'nextjs', skill: 'Next.js', category: 'Web Development', description: 'App router, server components, SSR, data fetching, layouts', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'react-native', skill: 'React Native', category: 'Mobile Development', description: 'Components, navigation, styling, bridge, AsyncStorage', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'flutter', skill: 'Flutter', category: 'Mobile Development', description: 'Dart, widgets, stateful/stateless, layouts, build method', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'ml-basics', skill: 'Machine Learning', category: 'Artificial Intelligence', description: 'Supervised/unsupervised learning, neural networks, overfitting, loss functions', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 70 },
  { id: 'docker', skill: 'Docker', category: 'DevOps', description: 'Containers, images, Dockerfile, docker-compose, orchestration', difficulty: 'beginner', question_count: 15, time_limit_minutes: 25, passing_score: 70 },
  { id: 'supabase', skill: 'Supabase', category: 'Backend Development', description: 'RLS, realtime subscriptions, edge functions, database queries', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 75 },
  { id: 'cybersec', skill: 'Cybersecurity', category: 'Security', description: 'Phishing, XSS, MFA, zero-day vulnerabilities, encryption fundamentals', difficulty: 'intermediate', question_count: 20, time_limit_minutes: 30, passing_score: 70 },
];

/** Level colors and display config */
export const CERTIFICATION_LEVELS: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: string }> = {
  beginner: { label: 'Beginner', color: 'text-slate-600', bgColor: 'bg-slate-100', borderColor: 'border-slate-200', icon: '🌱' },
  intermediate: { label: 'Intermediate', color: 'text-blue-700', bgColor: 'bg-blue-100', borderColor: 'border-blue-200', icon: '📈' },
  advanced: { label: 'Advanced', color: 'text-purple-700', bgColor: 'bg-purple-100', borderColor: 'border-purple-200', icon: '🚀' },
  expert: { label: 'Expert', color: 'text-amber-700', bgColor: 'bg-amber-100', borderColor: 'border-amber-200', icon: '👑' },
};

export const skillCertificationService = {
  /**
   * Get all certifications for a user.
   */
  async getUserCertifications(userId: string): Promise<SkillCertification[]> {
    const { data, error } = await supabase
      .from('skill_certifications' as any)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) return [];
    return (data || []) as unknown as SkillCertification[];
  },

  /**
   * Get available tests (excluding ones user already passed at this level or higher).
   */
  async getAvailableTests(userId: string): Promise<(SkillTest & { userLevel?: string })[]> {
    const certs = await this.getUserCertifications(userId);
    const certMap = new Map<string, string>();
    certs.forEach((c) => certMap.set(c.skill, c.level));

    const levels = ['beginner', 'intermediate', 'advanced', 'expert'];

    return AVAILABLE_SKILL_TESTS.map((test) => {
      const userLevel = certMap.get(test.skill);
      const userLevelIdx = userLevel ? levels.indexOf(userLevel) : -1;
      const testLevelIdx = levels.indexOf(test.difficulty);

      return {
        ...test,
        userLevel,
        // Hide tests user already passed at this level or higher
        locked: userLevelIdx >= testLevelIdx,
      };
    }) as (SkillTest & { userLevel?: string; locked?: boolean })[];
  },

  /**
   * Record a certification result.
   */
  async recordResult(
    userId: string,
    skill: string,
    level: SkillCertification['level'],
    score: number,
    maxScore: number
  ): Promise<{ success: boolean; certification?: SkillCertification; error?: string }> {
    const passing = score / maxScore >= 0.7;

    if (!passing) {
      return { success: false, error: `Score ${score}/${maxScore} is below the passing threshold.` };
    }

    // Upsert certification (upgrade if higher level).
    // NOTE: the UNIQUE(user_id, skill) constraint was intentionally dropped
    // (migration 20260821000000) to allow both a Certificate and an LOR for
    // the same skill — so we can't use onConflict: 'user_id,skill' (would throw
    // 42P10). Instead we look up the latest existing row and update it by id,
    // or insert a new one when none exists.
    const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
    const { data: existing } = await supabase
      .from('skill_certifications' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('skill', skill)
      // Include NULL (legacy rows created before certificate_type column existed)
      .or('certificate_type.eq.skill_test,certificate_type.is.null')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingLevel = (existing as any)?.level;
    const existingIdx = existingLevel ? levels.indexOf(existingLevel) : -1;
    const newIdx = levels.indexOf(level);

    if (existingIdx >= newIdx) {
      return { success: true, certification: existing as unknown as SkillCertification };
    }

    const payload = {
      level,
      score,
      max_score: maxScore,
      passed_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };

    const { data, error } = existing
      ? await supabase
          .from('skill_certifications' as any)
          .update(payload)
          .eq('id', (existing as any).id)
          .select()
          .single()
      : await supabase
          .from('skill_certifications' as any)
          .insert({
            user_id: userId,
            skill,
            ...payload,
          })
          .select()
          .single();

    if (error) return { success: false, error: error.message };
    return { success: true, certification: data as unknown as SkillCertification };
  },

  /**
   * Get certification badge display info.
   */
  getBadgeInfo(cert: SkillCertification) {
    const levelInfo = CERTIFICATION_LEVELS[cert.level] || CERTIFICATION_LEVELS.beginner;
    return {
      ...levelInfo,
      displayText: `${levelInfo.icon} ${cert.skill} — ${levelInfo.label}`,
      scorePercent: Math.round((cert.score / cert.max_score) * 100),
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Skill Test Attempts — anti-cheat & cooldown enforcement
// -----------------------------------------------------------------------------
// Rules enforced by the SkillTestPage + this service:
//   • Failed test        → retry allowed after 24 hours
//   • Cheating violation (copy/paste or tab-switch) → 3 strikes = 7-day ban
//   • Repeated cheating  → permanent ban (no further attempts, ever)
// =============================================================================

export interface SkillTestAttempt {
  id: string;
  user_id: string;
  test_id: string;
  status: 'in_progress' | 'passed' | 'failed' | 'cheating';
  violations: number;
  blocked_until: string | null;
  permanently_blocked: boolean;
  cheating_count: number;
  started_at: string;
  finished_at: string | null;
  updated_at: string;
}

export const MAX_VIOLATIONS_BEFORE_BAN = 3;
export const FAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;      // 24 hours
const CHEAT_BAN_MS = 7 * 24 * 60 * 60 * 1000;              // 7 days

export const skillTestAttemptService = {
  /**
   * Whether the user may start (or continue) this test right now.
   * Returns the blocking reason when not allowed.
   */
  async getEligibility(
    userId: string,
    testId: string
  ): Promise<{ allowed: boolean; attempt: SkillTestAttempt | null; message?: string }> {
    const { data, error } = await supabase
      .from('skill_test_attempts' as any)
      .select('*')
      .eq('user_id', userId)
      .eq('test_id', testId)
      .maybeSingle();

    if (error || !data) return { allowed: true, attempt: null };
    const attempt = data as unknown as SkillTestAttempt;

    if (attempt.permanently_blocked) {
      return {
        allowed: false,
        attempt,
        message:
          'This test is permanently locked for your account due to repeated policy violations (copy-paste / tab-switching). Contact support if you believe this is a mistake.',
      };
    }
    if (attempt.status === 'passed') {
      return {
        allowed: false,
        attempt,
        message:
          'You have already passed this assessment — your badge is live on your profile. Retakes of passed tests are not allowed.',
      };
    }
    if (attempt.blocked_until && new Date(attempt.blocked_until).getTime() > Date.now()) {
      const msLeft = new Date(attempt.blocked_until).getTime() - Date.now();
      const hours = Math.ceil(msLeft / 3600000);
      const when =
        hours >= 24 ? `${Math.round(hours / 24)} day${hours >= 48 ? 's' : ''}` : `${hours} hour${hours > 1 ? 's' : ''}`;
      const reason =
        attempt.status === 'cheating'
          ? 'A policy violation (copy-paste or tab-switching) was detected'
          : 'You did not pass the test';
      return { allowed: false, attempt, message: `${reason}. You can try again in ${when}.` };
    }
    return { allowed: true, attempt };
  },

  /** Mark an attempt as in-progress (fresh start after cooldown). */
  async startAttempt(userId: string, testId: string) {
    return supabase
      .from('skill_test_attempts' as any)
      .upsert(
        {
          user_id: userId,
          test_id: testId,
          status: 'in_progress',
          violations: 0,
          blocked_until: null,
          permanently_blocked: false,
          started_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,test_id' }
      );
  },

  /**
   * Register a cheating violation (copy/paste, tab-switch, window blur).
   * After MAX_VIOLATIONS_BEFORE_BAN strikes the attempt is banned for 7 days.
   */
  async recordViolation(
    userId: string,
    testId: string
  ): Promise<{ banned: boolean; permanent: boolean; violations: number }> {
    const { data } = await supabase
      .from('skill_test_attempts' as any)
      .select('violations, permanently_blocked')
      .eq('user_id', userId)
      .eq('test_id', testId)
      .maybeSingle();
    const attempt = data as unknown as {
      violations: number;
      permanently_blocked: boolean;
      cheating_count: number;
    } | null;

    if (attempt?.permanently_blocked) return { banned: true, permanent: true, violations: attempt.violations ?? 0 };

    const current = attempt?.violations ?? 0;
    const violations = current + 1;

    if (violations >= MAX_VIOLATIONS_BEFORE_BAN) {
      // Cumulative cheating bans across attempts: 2nd cheating episode = PERMANENT ban
      const cheatingCount = (attempt?.cheating_count ?? 0) + 1;
      const permanent = cheatingCount >= 2;
      await supabase
        .from('skill_test_attempts' as any)
        .update({
          violations,
          status: 'cheating',
          blocked_until: permanent ? null : new Date(Date.now() + CHEAT_BAN_MS).toISOString(),
          permanently_blocked: permanent,
          cheating_count: cheatingCount,
          finished_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('test_id', testId);
      return { banned: true, permanent, violations };
    }

    await supabase
      .from('skill_test_attempts' as any)
      .update({ violations, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('test_id', testId);
    return { banned: false, permanent: false, violations };
  },

  /** Record the final result — fail → 24h cooldown, pass → cleared. */
  async completeAttempt(userId: string, testId: string, passed: boolean) {
    return supabase
      .from('skill_test_attempts' as any)
      .update({
        status: passed ? 'passed' : 'failed',
        finished_at: new Date().toISOString(),
        blocked_until: passed ? null : new Date(Date.now() + FAIL_COOLDOWN_MS).toISOString(),
      })
      .eq('user_id', userId)
      .eq('test_id', testId);
  },
};
