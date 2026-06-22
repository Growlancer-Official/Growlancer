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

    // Upsert certification (upgrade if higher level)
    const levels = ['beginner', 'intermediate', 'advanced', 'expert'];
    const { data: existing } = await supabase
      .from('skill_certifications' as any)
      .select('level')
      .eq('user_id', userId)
      .eq('skill', skill)
      .single();

    const existingLevel = (existing as any)?.level;
    const existingIdx = existingLevel ? levels.indexOf(existingLevel) : -1;
    const newIdx = levels.indexOf(level);

    if (existingIdx >= newIdx) {
      return { success: true, certification: existing as unknown as SkillCertification };
    }

    const { data, error } = await supabase
      .from('skill_certifications' as any)
      .upsert({
        user_id: userId,
        skill,
        level,
        score,
        max_score: maxScore,
        passed_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      }, { onConflict: 'user_id,skill' })
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
