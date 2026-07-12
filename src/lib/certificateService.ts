/**
 * Certificate Service — Admin certificate issuance + public verification
 * 
 * Admin: issue, revoke, list certificates
 * Public: verify certificate by code
 */

import { supabase } from './supabase';
import { adminQuery, adminUpdate } from './adminDataProxy';

export type CertificateType = 'skill_test' | 'platform' | 'internship' | 'achievement' | 'lor';
export type CertStatus = 'active' | 'revoked' | 'expired';

export interface Certificate {
  id: string;
  user_id: string;
  skill: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  score: number;
  max_score: number;
  verification_code: string;
  issued_by: string | null;
  issued_at: string;
  certificate_type: CertificateType;
  status: CertStatus;
  revoked_at: string | null;
  revoked_reason: string | null;
  metadata: Record<string, unknown>;
  recipient_name: string;
  recipient_email: string;
  passed_at: string | null;
  expires_at: string | null;
  certificate_url: string | null;
  created_at: string;
  // Joined fields
  issuer?: { name: string; email: string } | null;
}

const EDGE_FN = 'admin-data';

/**
 * Issue a certificate to a user (admin only).
 * Calls the edge function which uses service_role key.
 */
export async function issueCertificate(params: {
  userId: string;
  skill: string;
  level: Certificate['level'];
  recipientName: string;
  recipientEmail: string;
  type?: CertificateType;
  metadata?: Record<string, unknown>;
  certificateUrl?: string;
}): Promise<{ success: boolean; certificate?: Certificate; error?: string }> {
  try {
    const { data: result, error } = await supabase.functions.invoke(EDGE_FN, {
      method: 'POST',
      body: {
        action: 'issue_certificate',
        user_id: params.userId,
        skill: params.skill,
        level: params.level,
        recipient_name: params.recipientName,
        recipient_email: params.recipientEmail,
        certificate_type: params.type || 'platform',
        metadata: params.metadata || {},
        certificate_url: params.certificateUrl || null,
      },
    });

    if (error) throw new Error(error.message);
    const res = result as { success: boolean; certificate?: Certificate; error?: string };
    return res;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to issue certificate',
    };
  }
}

/**
 * Revoke a certificate by ID (admin only).
 */
export async function revokeCertificate(
  certificateId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await adminUpdate('skill_certifications', certificateId, {
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_reason: reason,
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to revoke certificate',
    };
  }
}

/** Intern's application profile returned with certificate verification */
export interface InternProfile {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  country: string | null;
  university: string | null;
  degree: string | null;
  role_name: string;
  role_id: string;
  linkedin_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
  cover_letter: string;
  why_growlancer: string | null;
  resume_url: string | null;
  created_at: string;
  status: string;
  /** Additional internship fields */
  weekly_availability: number | null;
  available_from: string | null;
  available_to: string | null;
  notes: string | null;
  google_meet_link: string | null;
  interview_time: string | null;
}

/**
 * Verify a certificate by its verification code (public).
 */
export async function verifyCertificateByCode(
  code: string
): Promise<{ valid: boolean; certificate?: Certificate; internProfile?: InternProfile | null; error?: string }> {
  try {
    // Normalize code
    const normalizedCode = code.trim().toUpperCase();
    
    // Query via edge function (no auth needed)
    const { data } = await supabase.functions.invoke(EDGE_FN, {
      method: 'POST',
      body: {
        action: 'verify_certificate',
        verification_code: normalizedCode,
      },
    });

    const res = data as { valid: boolean; certificate?: Certificate; error?: string };
    return res || { valid: false, error: 'Certificate not found' };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Verification failed',
    };
  }
}

/**
 * Get all certificates (admin) with optional filters.
 */
export async function getAllCertificates(options?: {
  status?: CertStatus;
  type?: CertificateType;
  limit?: number;
}): Promise<Certificate[]> {
  try {
    const opts: any = {
      table: 'skill_certifications',
      select: '*',
      order: 'created_at',
      orderDir: 'desc',
      limit: options?.limit || 100,
    };

    if (options?.status) opts.filters = { ...opts.filters, status: options.status };
    if (options?.type) opts.filters = { ...opts.filters, certificate_type: options.type };

    const { data } = await adminQuery<Certificate>(opts);
    const certs = data || [];

    // Fetch issuer names
    const issuerIds = [...new Set(certs.map(c => c.issued_by).filter(Boolean))] as string[];
    if (issuerIds.length > 0) {
      const { data: profiles } = await adminQuery({ table: 'profiles', select: 'id, name, email', in: { id: issuerIds } });
      const profileMap = new Map((profiles || []).map(p => [p.id, { name: p.name, email: p.email }]));
      certs.forEach(c => {
        c.issuer = c.issued_by ? profileMap.get(c.issued_by) || null : null;
      });
    }

    return certs;
  } catch (err) {
    console.error('Failed to fetch certificates:', err);
    return [];
  }
}

/**
 * Send a certificate/LOR email to the recipient via edge function.
 */
export async function sendCertificateEmail(params: {
  certificateId: string;
  recipientEmail: string;
  recipientName: string;
  certificateType: CertificateType;
  roleName: string;
  level: string;
  verificationCode: string;
  performanceSummary?: string;
  skillsDemonstrated?: string[];
  certificateUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke(EDGE_FN, {
      method: 'POST',
      body: {
        action: 'send_certificate_email',
        certificate_id: params.certificateId,
        recipient_email: params.recipientEmail,
        recipient_name: params.recipientName,
        certificate_type: params.certificateType,
        role_name: params.roleName,
        level: params.level,
        verification_code: params.verificationCode,
        certificate_url: params.certificateUrl || null,
        performance_summary: params.performanceSummary || '',
        skills_demonstrated: params.skillsDemonstrated?.join(', ') || '',
      },
    });

    if (error) throw new Error(error.message);
    const res = data as { success: boolean; error?: string };
    return res || { success: false, error: 'No response' };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to send email',
    };
  }
}

export async function getUserCertificates(userId: string): Promise<Certificate[]> {
  try {
    const { data } = await adminQuery<Certificate>({
      table: 'skill_certifications',
      select: '*',
      filters: { user_id: userId },
      order: 'created_at',
      orderDir: 'desc',
    });
    return data || [];
  } catch (err) {
    console.error('Failed to fetch user certificates:', err);
    return [];
  }
}

/**
 * Certificate level display info.
 */
export const CERT_LEVEL_STYLES: Record<string, { label: string; color: string; bg: string; border: string; icon: string }> = {
  beginner: { label: '🏅 Beginner', color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-200', icon: '🌱' },
  intermediate: { label: '🥈 Intermediate', color: 'text-blue-700', bg: 'bg-blue-100', border: 'border-blue-200', icon: '📈' },
  advanced: { label: '🥇 Advanced', color: 'text-purple-700', bg: 'bg-purple-100', border: 'border-purple-200', icon: '🚀' },
  expert: { label: '👑 Expert', color: 'text-amber-700', bg: 'bg-amber-100', border: 'border-amber-200', icon: '👑' },
};

/**
 * Generate a display-appropriate certificate title.
 */
export function getCertificateTitle(cert: Certificate): string {
  const prefixMap: Record<string, string> = {
    platform: 'Growlancer Platform Certificate',
    skill_test: 'Skill Certification',
    internship: 'Internship Completion Certificate',
    achievement: 'Achievement Badge',
    lor: 'Letter of Recommendation',
  };
  return `${prefixMap[cert.certificate_type] || 'Certificate'} — ${cert.skill}`;
}
