/**
 * Internship Service — Pure data-access for internship applications.
 * Handles form submissions from the Internships page to Supabase.
 */

import { supabase } from './supabase';
import type { Database } from '../types/supabase';

type InternshipRow = Database['public']['Tables']['internship_applications']['Row'];
type InternshipInsert = Database['public']['Tables']['internship_applications']['Insert'];

export interface InternshipApplicationInput {
  full_name: string;
  email: string;
  phone?: string;
  role_id: string;
  role_name: string;
  education?: string;
  graduation_date?: string;
  discord_handle?: string;
  github_url?: string;
  portfolio_url?: string;
  resume_url?: string;
  cover_letter: string;
  why_growlancer?: string;
  weekly_availability?: number;
  available_from?: string;
  available_to?: string;
}

export interface InternshipApplicationResult {
  success: boolean;
  error?: string;
}

/**
 * Internship role definitions — single source of truth for all 4 intern roles.
 * Used both by the InternshipsPage and for validation.
 */
export interface InternshipRole {
  id: string;
  name: string;
  shortTitle: string;
  icon: string;
  color: string;
  department: string;
  commitment: string;
  duration: string;
  summary: string;
  responsibilities: string[];
  requiredSkills: string[];
  preferredSkills: string[];
  tools: string[];
  outcomes: string[];
  learningOpportunities: string[];
  assessmentTask: string;
}

export const INTERNSHIP_ROLES: InternshipRole[] = [
  {
    id: 'frontend-dev',
    name: 'Frontend Development Intern',
    shortTitle: 'Frontend Intern',
    icon: 'Code',
    color: 'emerald',
    department: 'Engineering',
    commitment: '15–30 hrs/week',
    duration: '8–12 weeks',
    summary: 'Help build and polish the Growlancer React/TypeScript frontend — a modern, AI-powered freelancing marketplace. You\'ll work on real UI components used by freelancers and clients, from dashboard pages to interactive workspace features.',
    responsibilities: [
      'Build and maintain React/TypeScript components using TailwindCSS',
      'Implement responsive, accessible UI for dashboard pages',
      'Integrate with Supabase realtime subscriptions for live updates',
      'Write unit tests for components using Vitest + Testing Library',
      'Fix UI bugs and polish existing components across 50+ pages',
      'Participate in code reviews and contribute to component documentation',
    ],
    requiredSkills: [
      'React 18 (hooks, context, effects)',
      'TypeScript (types, interfaces, generics)',
      'CSS/TailwindCSS (utility-first styling, responsive design)',
      'Git & GitHub (branches, PRs, code review)',
      'REST APIs and async/await patterns',
    ],
    preferredSkills: [
      'Supabase or similar backend-as-a-service',
      'WebSocket/realtime subscriptions',
      'Zustand or Context API state management',
      'Vite build tooling',
      'Open-source contributions',
    ],
    tools: [
      'Chrome/Firefox DevTools',
      'VS Code or preferred editor',
      'Node.js 18+ and npm',
      'Git + GitHub',
      'Discord/Slack for communication',
    ],
    outcomes: [
      'Ship 15–25 polished, tested components',
      'Write 20+ unit tests for components',
      'Fix 30+ UI bugs from the issue tracker',
      'Document 10+ reusable component patterns',
    ],
    learningOpportunities: [
      'Real-world React/TypeScript at scale (50+ pages)',
      'Supabase realtime and database integration',
      'Startup product development cycle',
      'Code review and collaborative development workflows',
    ],
    assessmentTask: 'Build a reusable FreelancerCard component (name, avatar, hourly rate, skills, rating stars, availability) with loading/empty states, TypeScript types, accessibility, responsive design, and 2 unit tests.',
  },
  {
    id: 'backend-supabase',
    name: 'Backend/Supabase Intern',
    shortTitle: 'Backend Intern',
    icon: 'Database',
    color: 'blue',
    department: 'Engineering',
    commitment: '15–30 hrs/week',
    duration: '8–12 weeks',
    summary: 'Work on Growlancer\'s Supabase-backed backend infrastructure — edge functions, database queries, RLS policies, and API integrations. You\'ll be responsible for backend services that power the entire platform.',
    responsibilities: [
      'Develop and deploy Supabase Edge Functions (Deno/TypeScript)',
      'Write and review PostgreSQL queries, RLS policies, and database functions',
      'Implement and test realtime subscription endpoints',
      'Build data validation and sanitization middleware',
      'Create database migration scripts',
      'Optimize query performance and caching strategies',
      'Document API endpoints and database schemas',
    ],
    requiredSkills: [
      'TypeScript/JavaScript proficiency',
      'SQL fundamentals (PostgreSQL preferred)',
      'REST API design principles',
      'Authentication and authorization concepts',
      'Git & GitHub workflows',
      'Basic testing patterns',
    ],
    preferredSkills: [
      'Supabase (edge functions, RLS, realtime)',
      'PostgreSQL (views, functions, triggers)',
      'Deno runtime',
      'PayPal API or payment processing',
      'Rate limiting and security patterns',
    ],
    tools: [
      'VS Code or preferred editor',
      'Supabase CLI and account',
      'PostgreSQL client (psql, DBeaver, or similar)',
      'Postman/Insomnia for API testing',
      'Git + GitHub',
    ],
    outcomes: [
      'Deploy 3–5 edge functions to production',
      'Write 10+ database migration scripts',
      'Implement RLS policies for 5+ tables',
      'Create 15+ unit tests for backend services',
      'Document all edge function endpoints',
    ],
    learningOpportunities: [
      'Production PostgreSQL + Supabase at scale',
      'Edge function development with Deno',
      'Serverless architecture patterns',
      'Payment system integration (PayPal)',
      'Real-time data synchronization',
    ],
    assessmentTask: 'Create a Supabase Edge Function handling the "invite freelancer to project" flow with validation, duplicate checking, error handling, RLS policy recommendations, and 2 test cases.',
  },
  {
    id: 'qa-testing',
    name: 'QA/Testing Intern',
    shortTitle: 'QA Intern',
    icon: 'CheckCircle2',
    color: 'purple',
    department: 'Quality Assurance',
    commitment: '15–30 hrs/week',
    duration: '8–12 weeks',
    summary: 'Establish Growlancer\'s testing infrastructure from the ground up. You\'ll write automated tests, perform manual QA, create test plans, and help ensure the platform is launch-ready.',
    responsibilities: [
      'Write unit tests for frontend components and backend services',
      'Create integration tests for critical user flows',
      'Perform manual QA testing across all platform workflows',
      'Write and maintain test plans and test cases',
      'Document bugs with reproduction steps',
      'Set up CI/CD testing pipelines (GitHub Actions)',
      'Conduct regression testing before releases',
    ],
    requiredSkills: [
      'Basic TypeScript/JavaScript understanding',
      'Testing concepts (unit, integration, e2e)',
      'Experience with at least one testing framework',
      'Attention to detail and analytical mindset',
      'Clear written communication for bug reports',
      'Git & GitHub basics',
    ],
    preferredSkills: [
      'Vitest, Jest, or Playwright experience',
      'React Testing Library knowledge',
      'Supabase or similar BaaS familiarity',
      'Previous QA experience (internship or personal projects)',
      'Understanding of edge cases and boundary testing',
    ],
    tools: [
      'Modern browser with DevTools',
      'VS Code or preferred editor',
      'Node.js 18+ and npm',
      'Git + GitHub',
      'Test management (spreadsheet or Notion)',
    ],
    outcomes: [
      'Write 50+ unit tests across frontend and backend',
      'Create 5 comprehensive test plans for core workflows',
      'Execute 3 full regression testing cycles',
      'Document 50+ test cases',
      'Set up CI pipeline for automated test runs',
    ],
    learningOpportunities: [
      'Building a test suite from scratch',
      'Frontend and backend testing methodologies',
      'CI/CD pipeline configuration',
      'Bug tracking and QA best practices',
      'Startup launch preparation processes',
    ],
    assessmentTask: 'Given a sample React payment form component — write a comprehensive test plan, 4 unit tests using Vitest, bug report for 3 identified issues, and a regression test strategy.',
  },
  {
    id: 'ui-ux-design',
    name: 'UI/UX Design Intern',
    shortTitle: 'Design Intern',
    icon: 'Palette',
    color: 'orange',
    department: 'Design',
    commitment: '15–30 hrs/week',
    duration: '8–12 weeks',
    summary: 'Shape the visual identity and user experience of Growlancer. You\'ll work on design consistency, user flows, component design, and interaction patterns across the entire platform.',
    responsibilities: [
      'Audit and document current UI inconsistencies across all 50+ pages',
      'Create and maintain a design system (colors, typography, spacing, components)',
      'Design improved user flows for onboarding, workspace, and payments',
      'Create high-fidelity mockups for new features using Figma',
      'Collaborate with developers on TailwindCSS implementation',
      'Conduct basic usability testing and gather feedback',
      'Create style guides and design documentation',
    ],
    requiredSkills: [
      'Figma proficiency (or similar design tool)',
      'Design principles (hierarchy, contrast, balance, movement)',
      'Basic HTML/CSS knowledge (TailwindCSS understanding is a plus)',
      'Portfolio showcasing UI/UX work',
      'Clear visual communication',
      'Ability to give and receive design feedback',
    ],
    preferredSkills: [
      'Design systems or component libraries',
      'Accessibility standards (WCAG)',
      'Responsive design principles',
      'React component patterns familiarity',
      'Motion design or micro-interactions',
    ],
    tools: [
      'Figma (free tier is sufficient)',
      'Modern browser with design tools',
      'Design handoff tools (Figma Dev Mode)',
      'Discord/Slack for communication',
    ],
    outcomes: [
      'Complete UI audit covering all 50+ pages',
      'Create a 20+ component design system in Figma',
      'Redesign 5 critical user flows',
      'Create 10+ high-fidelity mockups for new features',
      'Resolve 30+ UI consistency issues',
    ],
    learningOpportunities: [
      'Designing for a complex multi-role platform',
      'Building a production design system',
      'Developer collaboration and design handoff',
      'Pre-launch product design processes',
      'AI-powered product UX patterns',
    ],
    assessmentTask: 'Design a "Project Invitation" flow — wireframes, high-fidelity mockup of invite card, design tokens, responsive considerations, and interaction notes.',
  },
];

export const internshipService = {
  /**
   * Submit an internship application to Supabase.
   */
  async submitApplication(
    input: InternshipApplicationInput
  ): Promise<InternshipApplicationResult> {
    try {
      const insertData: InternshipInsert = {
        full_name: input.full_name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        role_id: input.role_id,
        role_name: input.role_name,
        education: input.education || null,
        graduation_date: input.graduation_date || null,
        discord_handle: input.discord_handle?.trim() || null,
        github_url: input.github_url?.trim() || null,
        portfolio_url: input.portfolio_url?.trim() || null,
        resume_url: input.resume_url?.trim() || null,
        cover_letter: input.cover_letter.trim(),
        why_growlancer: input.why_growlancer?.trim() || null,
        weekly_availability: input.weekly_availability || null,
        available_from: input.available_from || null,
        available_to: input.available_to || null,
        status: 'pending',
      };

      const { error } = await supabase
        .from('internship_applications')
        .insert(insertData);

      if (error) {
        console.error('Error submitting internship application:', error);
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit application';
      console.error('Exception submitting internship application:', err);
      return { success: false, error: message };
    }
  },

  /**
   * Get all applications (admin use only, will be filtered by RLS).
   */
  async getApplications(): Promise<{ success: boolean; applications?: InternshipRow[]; error?: string }> {
    try {
      const { data, error } = await supabase
        .from('internship_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return { success: true, applications: data || [] };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch applications';
      return { success: false, error: message };
    }
  },

  /**
   * Update application status (admin use only).
   */
  async updateApplicationStatus(
    id: string,
    status: string,
    notes?: string
  ): Promise<InternshipApplicationResult> {
    try {
      const updateData: Record<string, unknown> = { status };
      if (notes !== undefined) updateData.notes = notes;

      const { error } = await (supabase
        .from('internship_applications') as any)
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update application';
      return { success: false, error: message };
    }
  },
};

export default internshipService;
