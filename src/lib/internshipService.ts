/**
 * Internship Service — Pure data-access for internship applications.
 * Handles form submissions from the Internships/Careers page to Supabase.
 * Includes PDF resume upload to Supabase Storage.
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
  country?: string;
  university?: string;
  degree?: string;
  graduation_year?: string;
  linkedin_url?: string;
  google_meet_link?: string;
  github_url?: string;
  portfolio_url?: string;
  resume_file_path?: string;
  resume_file_name?: string;
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
      'Google Meet for video calls',
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
      'Google Meet for video calls',
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
  },
];

export const internshipService = {
  /**
   * Upload a resume PDF to Supabase Storage.
   * Returns the file path if successful.
   */
  async uploadResume(file: File): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (fileExt !== 'pdf') {
        return { success: false, error: 'Only PDF files are accepted' };
      }
      if (file.size > 10 * 1024 * 1024) {
        return { success: false, error: 'File size must be less than 10MB' };
      }

      const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = `resumes/${uniqueName}`;

      const { error: uploadError } = await supabase.storage
        .from('internship_resumes')
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: 'application/pdf',
          upsert: false,
        });

      if (uploadError) {
        console.error('Resume upload error:', uploadError);
        return { success: false, error: uploadError.message };
      }

      return { success: true, filePath };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to upload resume';
      console.error('Resume upload exception:', err);
      return { success: false, error: message };
    }
  },

  /**
   * Get a public URL for a resume file.
   */
  getResumeUrl(filePath: string): string {
    const { data } = supabase.storage
      .from('internship_resumes')
      .getPublicUrl(filePath);
    return data.publicUrl;
  },

  /**
   * Submit an internship application via the edge function.
   * Edge function handles: DB insert + Resend emails (admin + applicant).
   */
  async submitApplication(
    input: InternshipApplicationInput
  ): Promise<InternshipApplicationResult> {
    try {
      const payload = {
        full_name: input.full_name.trim(),
        email: input.email.trim().toLowerCase(),
        phone: input.phone?.trim() || null,
        role_id: input.role_id,
        role_name: input.role_name,
        country: input.country?.trim() || null,
        university: input.university?.trim() || null,
        degree: input.degree?.trim() || null,
        graduation_year: input.graduation_year?.trim() || null,
        linkedin_url: input.linkedin_url?.trim() || null,
        google_meet_link: input.google_meet_link?.trim() || null,
        github_url: input.github_url?.trim() || null,
        portfolio_url: input.portfolio_url?.trim() || null,
        resume_url: input.resume_url?.trim() || null,
        resume_file_path: input.resume_file_path || null,
        resume_file_name: input.resume_file_name || null,
        cover_letter: input.cover_letter.trim(),
        why_growlancer: input.why_growlancer?.trim() || null,
        weekly_availability: input.weekly_availability || null,
        available_from: input.available_from || null,
        available_to: input.available_to || null,
      };

      const { data, error } = await supabase.functions.invoke(
        'internship-applications',
        {
          method: 'POST',
          body: payload,
        }
      );

      if (error) {
        console.error('Error invoking internship-applications edge function:', error);
        // Try to parse error message from the response
        const errMsg = typeof error === 'object' && error !== null
          ? (error as any).message || error.toString()
          : String(error);
        return { success: false, error: errMsg };
      }

      const result = data as { success?: boolean; application_id?: string; emails_sent?: { admin: boolean; applicant: boolean } };

      if (result?.success) {
        console.log('Application submitted successfully via edge function. Emails:', result.emails_sent);
        return { success: true };
      }

      return { success: false, error: 'Application failed to process. Please try again.' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit application';
      console.error('Exception submitting internship application:', err);
      return { success: false, error: message };
    }
  },

  /**
   * Get all applications (admin use only).
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
