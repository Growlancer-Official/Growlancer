// Internship Applications Edge Function
// Handles new internship application submissions & status updates
// Sends real email notifications via Brevo (Sendinblue):
//   1) Admin notification to growlancer.own@gmail.com
//   2) Confirmation email to applicant
//   3) Status change emails (shortlisted, interview, selected, rejected)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const BREVO_FROM_EMAIL = Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com'
const BREVO_FROM_NAME = 'Growlancer Team'
const ADMIN_EMAIL = 'growlancer.own@gmail.com'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app'

const GITHUB_URL = 'https://github.com/Mrkhan154212/Growlancer'

// ─── HTML Escape Helper ─────────────────────────────────────────────────
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const ALLOWED_ORIGINS = [
  'https://growlancer.vercel.app',
  'https://growlancer.com',
  'https://www.growlancer.com',
  'http://localhost:5173',
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  };
}

interface Attachment {
  name: string;
  content: string;  // base64-encoded
}

interface ApplicationData {
  full_name: string
  email: string
  phone?: string
  country?: string
  university?: string
  degree?: string
  graduation_year?: string
  role_id: string
  role_name: string
  linkedin_url?: string
  google_meet_link?: string
  github_url?: string
  portfolio_url?: string
  resume_url?: string
  resume_file_path?: string
  resume_file_name?: string
  cover_letter: string
  why_growlancer?: string
  weekly_availability?: number
}

// ─── PDF Attachment Helper ──────────────────────────────────────────────
/** Fetch a PDF from storage URL, base64-encode it, and return as Brevo attachment */
async function fetchPdfAsAttachment(url: string, filename: string): Promise<Attachment | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch PDF from ${url}: ${response.status}`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    // Convert to base64 manually (Deno doesn't have btoa for binary)
    let binary = '';
    for (let i = 0; i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    const base64 = btoa(binary);
    return { name: filename, content: base64 };
  } catch (err) {
    console.error(`Error fetching PDF attachment ${filename}:`, err);
    return null;
  }
}

/** Extract filename from a storage URL or fall back to a default */
function getFileNameFromUrl(url: string | null | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    const segments = url.split('/');
    const last = segments[segments.length - 1];
    if (last && last.includes('.')) return decodeURIComponent(last);
    return fallback;
  } catch {
    return fallback;
  }
}

// ─── Brevo Email Sender ─────────────────────────────────────────────────────
async function sendBrevoEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string,
  attachments?: Attachment[]
): Promise<boolean> {
  try {
    const key = Deno.env.get('BREVO_API_KEY') ?? ''
    console.log('BREVO_API_KEY length:', key.length, 'prefix:', key.substring(0, 15))
    
    const bodyObj: Record<string, unknown> = {
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: to, name: toName }],
      subject,
      htmlContent,
    }

    // Only add attachments if we have some (Brevo supports up to 10MB total)
    if (attachments && attachments.length > 0) {
      bodyObj.attachment = attachments;
      console.log(`Attaching ${attachments.length} file(s): ${attachments.map(a => a.name).join(', ')}`)
    }

    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(bodyObj),
    })

    const text = await res.text()
    console.error('Brevo API response:', res.status, text)
    
    if (!res.ok) {
      return false
    }
    return true
  } catch (err) {
    console.error('Brevo send error:', err)
    return false
  }
}

// ─── Email Templates ────────────────────────────────────────────────────────

function baseEmailHtml(title: string, bodyHtml: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 30px 10px; margin: 0;">
  <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="padding: 30px 10px;" align="center"><![endif]-->
  <div style="max-width: 600px; width: 100%; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 28px 24px; text-align: center;">
      <h1 style="color: white; font-size: 20px; font-weight: 700; margin: 0; word-break: break-word;">${title}</h1>
    </div>
    <!-- Body -->
    <div style="padding: 28px 24px; word-wrap: break-word; overflow-wrap: break-word;">
      ${bodyHtml}
    </div>
    <!-- Footer -->
    <div style="padding: 20px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 11px; margin: 0 0 4px; word-break: break-word;">Growlancer — AI-Powered Freelancing Marketplace</p>
      <p style="color: #94a3b8; font-size: 11px; margin: 0; word-break: break-word;">
        <a href="${APP_URL}" style="color: #059669; text-decoration: none;">${APP_URL}</a>
      </p>
    </div>
  </div>
  <!--[if mso]></td></tr></table><![endif]-->
</body>
</html>`
}

/** Application Received — sent immediately after submission */
function buildReceivedEmailHtml(data: ApplicationData): string {
  const escapedName = escapeHtml(data.full_name);
  const escapedRole = escapeHtml(data.role_name);
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Dear ${escapedName},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Thank you for your interest in joining <strong>Growlancer</strong> and for taking the time to apply for the
      <strong>${escapedRole}</strong> position. We are truly excited to learn more about you.
    </p>

    <p style="font-size: 14px; color: #475569; line-height: 1.7; margin-bottom: 20px;">
      At Growlancer, we are building the future of AI-powered freelancing — a global marketplace where talent meets opportunity.
      We carefully review every application to find individuals who share our vision and passion.
    </p>

    <div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border: 1px solid #86efac; border-radius: 16px;">
      <h3 style="font-size: 15px; color: #166534; margin: 0 0 16px; font-weight: 700;">📋 Our Recruitment Process</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #166534;">
        <tr>
          <td style="padding: 8px 12px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 24px; height: 24px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">1</span>
          </td>
          <td style="padding: 8px 0;">
            <strong style="color: #065f46;">Application Review</strong>
            <p style="margin: 2px 0 0; font-size: 13px; color: #047857;">Our team reviews your profile and credentials (within 24–48 hours)</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 24px; height: 24px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">2</span>
          </td>
          <td style="padding: 8px 0;">
            <strong style="color: #065f46;">Interview Round</strong>
            <p style="margin: 2px 0 0; font-size: 13px; color: #047857;">A single video call with our founding team to discuss your experience and aspirations</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 24px; height: 24px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: 700;">3</span>
          </td>
          <td style="padding: 8px 0;">
            <strong style="color: #065f46;">Selection &amp; Onboarding</strong>
            <p style="margin: 2px 0 0; font-size: 13px; color: #047857;">Welcome aboard! You will receive your offer letter, NDA, and onboarding details</p>
          </td>
        </tr>
      </table>
    </div>

    <div style="margin: 24px 0; padding: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;">
      <p style="font-size: 13px; color: #92400e; margin: 0; line-height: 1.6;">
        <strong>💡 Pro Tip:</strong> While you wait, explore our platform at
        <a href="${APP_URL}" style="color: #059669; font-weight: 600;">${APP_URL}</a> to learn more about what we do.
        You can also follow us on <a href="${GITHUB_URL}" style="color: #059669; font-weight: 600;">GitHub</a> to stay updated!
      </p>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If you have any questions in the meantime, feel free to reply to this email or write to us at
      <a href="mailto:${ADMIN_EMAIL}" style="color: #059669;">${ADMIN_EMAIL}</a>.
      We are happy to help!
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Best regards,<br/>
      <strong style="font-size: 15px; color: #059669;">Mohammad Miran Khan</strong><br/>
      <span style="color: #94a3b8;">Founder & CEO, Growlancer</span>
    </p>`
  return baseEmailHtml('Application Received Successfully', body)
}

/** Admin Notification — sent to growlancer.own@gmail.com */
function buildAdminEmailHtml(data: ApplicationData): string {
  const escapedName = escapeHtml(data.full_name);
  const escapedEmail = escapeHtml(data.email);
  const escapedRole = escapeHtml(data.role_name);
  const escapedPhone = escapeHtml(data.phone || 'Not provided');
  const escapedCountry = escapeHtml(data.country || 'Not provided');
  const escapedUni = escapeHtml(data.university || 'Not provided');
  const escapedDegree = escapeHtml(data.degree || 'Not provided');
  const escapedGrad = escapeHtml(data.graduation_year || 'Not provided');
  const escapedGithub = escapeHtml(data.github_url || 'Not provided');
  const escapedLinkedin = escapeHtml(data.linkedin_url || 'Not provided');
  const escapedPortfolio = escapeHtml(data.portfolio_url || 'Not provided');
  const escapedAvailability = escapeHtml(String(data.weekly_availability || 'Not specified'));
  const escapedCover = escapeHtml(data.cover_letter);
  const escapedWhy = escapeHtml(data.why_growlancer || '');
  const PROJECT_REF = Deno.env.get('SUPABASE_URL')?.replace('https://', '')?.replace('.supabase.co', '') || 'zttwsjehcgaicziqyxpq'
  const resumeLink = data.resume_file_path
    ? `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/internship_resumes/${data.resume_file_path}`
    : data.resume_url || 'Not provided'

  const body = `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 140px; border-bottom: 1px solid #f1f5f9;">Name</td>
          <td style="padding: 8px 0; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${escapedName}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Email</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><a href="mailto:${escapedEmail}" style="color: #059669;">${escapedEmail}</a></td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Role</td>
          <td style="padding: 8px 0; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${escapedRole}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Phone</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${escapedPhone}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Country</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${escapedCountry}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">University</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${escapedUni}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Degree</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${escapedDegree}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Grad Year</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${escapedGrad}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">GitHub</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.github_url ? `<a href="${escapeHtml(data.github_url)}" style="color: #059669;">${escapedGithub}</a>` : 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">LinkedIn</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.linkedin_url ? `<a href="${escapeHtml(data.linkedin_url)}" style="color: #059669;">${escapedLinkedin}</a>` : 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Portfolio</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.portfolio_url ? `<a href="${escapeHtml(data.portfolio_url)}" style="color: #059669;">${escapedPortfolio}</a>` : 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Resume</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><a href="${resumeLink}" style="color: #059669;">View Resume</a></td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Availability</td>
          <td style="padding: 8px 0;">${escapedAvailability} hrs/week</td></tr>
    </table>
    <div style="margin-top: 24px; padding: 16px; background: #f1f5f9; border-radius: 12px;">
      <h3 style="font-size: 13px; color: #64748b; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Cover Letter</h3>
      <p style="font-size: 14px; color: #0f172a; line-height: 1.6; margin: 0;">${escapedCover}</p>
    </div>
    ${data.why_growlancer ? `
    <div style="margin-top: 16px; padding: 16px; background: #f1f5f9; border-radius: 12px;">
      <h3 style="font-size: 13px; color: #64748b; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Why Growlancer?</h3>
      <p style="font-size: 14px; color: #0f172a; line-height: 1.6; margin: 0;">${escapedWhy}</p>
    </div>` : ''}
    <div style="margin-top: 30px; text-align: center;">
      <a href="${APP_URL}/admin/internships" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View in Admin Dashboard →
      </a>
    </div>`
  return baseEmailHtml('New Internship Application', body)
}

/** Under Review — status update after initial screening */
function buildUnderReviewEmailHtml(name: string, roleName: string): string {
  const escapedName = escapeHtml(name);
  const escapedRole = escapeHtml(roleName);
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Dear ${escapedName},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Thank you for your patience. We wanted to provide you with a quick update regarding your application for the
      <strong>${escapedRole}</strong> position at <strong>Growlancer</strong>.
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Your application has moved forward in our review process and is now being carefully evaluated by our hiring team.
      We typically complete our review within <strong>2–3 business days</strong>.
    </p>

    <div style="margin: 28px 0; padding: 24px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 40px; height: 40px; background: #059669; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">⏳</div>
        <div>
          <h3 style="font-size: 15px; color: #065f46; margin: 0; font-weight: 700;">Application Status: Under Review</h3>
          <p style="font-size: 13px; color: #047857; margin: 2px 0 0;">Estimated response time: 2–3 business days</p>
        </div>
      </div>
    </div>

    <div style="margin: 24px 0; padding: 20px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #1e40af; margin: 0 0 12px;">🎯 While You Wait</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #1e3a5f;">
        <tr>
          <td style="padding: 4px 8px; width: 24px;">📖</td>
          <td style="padding: 4px 0;">Learn more about Growlancer at <a href="${APP_URL}" style="color: #2563eb;">our platform</a></td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; width: 24px;">💻</td>
          <td style="padding: 4px 0;">Check out our code and contribute on <a href="${GITHUB_URL}" style="color: #2563eb;">GitHub</a></td>
        </tr>
        <tr>
          <td style="padding: 4px 8px; width: 24px;">📝</td>
          <td style="padding: 4px 0;">Prepare some talking points about your past projects and experiences</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      We genuinely appreciate your interest in joining our team and will get back to you as soon as possible.
      If you have any urgent questions, please reach out to
      <a href="mailto:${ADMIN_EMAIL}" style="color: #059669;">${ADMIN_EMAIL}</a>.
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Warm regards,<br/>
      <strong style="font-size: 15px; color: #059669;">Mohammad Miran Khan</strong><br/>
      <span style="color: #94a3b8;">Founder & CEO, Growlancer</span>
    </p>`
  return baseEmailHtml('Application Under Review', body)
}

/** Shortlisted — candidate moves to interview stage */
function buildShortlistedEmailHtml(name: string, roleName: string): string {
  const escapedName = escapeHtml(name);
  const escapedRole = escapeHtml(roleName);
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Dear ${escapedName},</p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Congratulations! We are pleased to inform you that you have been <strong>shortlisted</strong> for the
      <strong>${escapedRole}</strong> position at <strong>Growlancer</strong>.
    </p>

    <p style="font-size: 14px; color: #475569; line-height: 1.7; margin-bottom: 20px;">
      Your application stood out to us, and we would love to learn more about you.
      We believe you have the potential to make a meaningful contribution to our team.
    </p>

    <div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); border: 1px solid #fcd34d; border-radius: 16px;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
        <div style="width: 44px; height: 44px; background: #f59e0b; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 22px;">⭐</div>
        <div>
          <h3 style="font-size: 16px; color: #92400e; margin: 0; font-weight: 700;">What's Next?</h3>
          <p style="font-size: 13px; color: #b45309; margin: 2px 0 0;">Your journey to joining Growlancer continues!</p>
        </div>
      </div>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #92400e;">
        <tr>
          <td style="padding: 6px 12px; width: 30px; font-weight: 700; vertical-align: top;">1.</td>
          <td style="padding: 6px 0;"><strong>Interview Invitation</strong> — You will receive a Google Meet link with a scheduled time within <strong>48 hours</strong></td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; width: 30px; font-weight: 700; vertical-align: top;">2.</td>
          <td style="padding: 6px 0;"><strong>Video Interview</strong> — A 30–45 minute conversation with our founding team to discuss your skills, experience, and aspirations</td>
        </tr>
        <tr>
          <td style="padding: 6px 12px; width: 30px; font-weight: 700; vertical-align: top;">3.</td>
          <td style="padding: 6px 0;"><strong>Decision</strong> — We will notify you of our final decision shortly after the interview</td>
        </tr>
      </table>
    </div>

    <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #0f172a; margin: 0 0 12px;">🔔 Please Note</h3>
      <p style="font-size: 13px; color: #64748b; margin: 0; line-height: 1.6;">
        Keep an eye on your inbox (and spam folder) for the interview invitation.
        If you don't hear from us within 48 hours, please reach out to
        <a href="mailto:${ADMIN_EMAIL}" style="color: #059669;">${ADMIN_EMAIL}</a>.
      </p>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      Once again, congratulations on being shortlisted! We look forward to speaking with you.
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Warm regards,<br/>
      <strong style="font-size: 15px; color: #059669;">Mohammad Miran Khan</strong><br/>
      <span style="color: #94a3b8;">Founder & CEO, Growlancer</span>
    </p>`
  return baseEmailHtml('Congratulations — You\'re Shortlisted!', body)
}

/** Professional Interview Invitation — ALWAYS shows Google Meet link & time with prominent sign & return */
function buildInterviewEmailHtml(
  name: string,
  roleName: string,
  googleMeetLink?: string | null,
  interviewTime?: string | null
): string {
  const escapedName = escapeHtml(name);
  const escapedRole = escapeHtml(roleName);
  const rawName = name;  // for URL/calendar encoding (NOT HTML-escaped)
  const rawRole = roleName;

  const formattedTime = interviewTime
    ? new Date(interviewTime).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      })
    : null

  const isoTime = interviewTime
    ? new Date(interviewTime).toISOString().replace(/\.\d{3}Z$/, 'Z')
    : ''

  const icsDtStart = isoTime ? isoTime.replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z') : ''

  const meetSection = googleMeetLink ? `
    <!-- GOOGLE MEET SECTION - PROMINENT -->
    <div style="margin: 28px 0; padding: 0; background: #ffffff; border: 2px solid #7c3aed; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 24px 28px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 8px;">🎥</div>
        <h2 style="font-size: 22px; color: white; margin: 0; font-weight: 700;">Interview Invitation</h2>
        <p style="font-size: 14px; color: #d8b4fe; margin: 6px 0 0;">You have been invited for a video interview with the Growlancer team</p>
      </div>
      <div style="padding: 28px;">
        ${formattedTime ? `
        <div style="margin-bottom: 24px; padding: 18px 20px; background: #f3e8ff; border: 1px solid #c4b5fd; border-radius: 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 12px; width: 100px; color: #6b21a8; font-size: 13px; font-weight: 600; white-space: nowrap;">📅 Date</td>
              <td style="padding: 6px 0; color: #4c1d95; font-size: 15px; font-weight: 600;">${new Date(interviewTime!).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
            </tr>
            <tr>
              <td style="padding: 6px 12px; width: 100px; color: #6b21a8; font-size: 13px; font-weight: 600; white-space: nowrap;">⏰ Time</td>
              <td style="padding: 6px 0; color: #4c1d95; font-size: 15px; font-weight: 600;">${new Date(interviewTime!).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })}</td>
            </tr>
            <tr>
              <td style="padding: 6px 12px; width: 100px; color: #6b21a8; font-size: 13px; font-weight: 600; white-space: nowrap;">📍 Duration</td>
              <td style="padding: 6px 0; color: #4c1d95; font-size: 15px; font-weight: 600;">30–45 minutes</td>
            </tr>
          </table>
          <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #c4b5fd;">
            <p style="font-size: 12px; color: #7c3aed; margin: 0;">
              💡 <strong>Tip:</strong> Click "Add to Calendar" below to save this event to your calendar.
            </p>
          </div>
        </div>` : ''}

        <div style="text-align: center; margin: 24px 0;">
          <a href="${googleMeetLink}"
             target="_blank"
             rel="noopener noreferrer"
             style="display: inline-block; padding: 18px 48px; background: #059669; color: white; text-decoration: none; border-radius: 14px; font-weight: 700; font-size: 18px; box-shadow: 0 6px 20px rgba(5, 150, 105, 0.3);">
            🔗 Join Google Meet Now
          </a>
        </div>

        <div style="text-align: center; margin: 16px 0;">
          <a href="${googleMeetLink}"
             target="_blank"
             rel="noopener noreferrer"
             style="color: #7c3aed; font-size: 13px; text-decoration: underline;">
            ${googleMeetLink}
          </a>
        </div>          ${formattedTime ? `
        <div style="margin-top: 20px; text-align: center;">
          <a href="data:text/calendar;charset=utf-8,BEGIN:VCALENDAR%0D%0AVERSION:2.0%0D%0ABEGIN:VEVENT%0D%0ASUMMARY:Interview%20-%20${encodeURIComponent(rawRole)}%20%40%20Growlancer%0D%0ADESCRIPTION:Video%20interview%20for%20${encodeURIComponent(rawRole)}%20position%20at%20Growlancer%0D%0ADTSTART:${icsDtStart}%0D%0ADURATION:PT1H%0D%0ALOCATION:${encodeURIComponent(googleMeetLink!)}%0D%0AEND:VEVENT%0D%0AEND:VCALENDAR"
             style="display: inline-block; padding: 12px 28px; background: #7c3aed; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
            📅 Add to Calendar
          </a>
        </div>` : ''}

        <p style="font-size: 13px; color: #94a3b8; margin: 20px 0 0; text-align: center;">
          Please ensure you have a stable internet connection, working camera & microphone, and a quiet environment.
        </p>
      </div>
    </div>`
    : `
    <!-- Interview Scheduled (no link yet - show professional placeholder) -->
    <div style="margin: 28px 0; padding: 0; background: #ffffff; border: 2px solid #7c3aed; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%); padding: 24px 28px; text-align: center;">
        <div style="font-size: 40px; margin-bottom: 8px;">🎤</div>
        <h2 style="font-size: 22px; color: white; margin: 0; font-weight: 700;">Interview Stage</h2>
        <p style="font-size: 14px; color: #d8b4fe; margin: 6px 0 0;">You have advanced to the interview stage!</p>
      </div>
      <div style="padding: 28px; text-align: center;">
        ${formattedTime ? `
        <div style="margin-bottom: 20px; padding: 18px; background: #f3e8ff; border: 1px solid #c4b5fd; border-radius: 12px; display: inline-block;">
          <p style="font-size: 12px; color: #7c3aed; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin: 0 0 6px;">📅 Scheduled For</p>
          <p style="font-size: 20px; color: #4c1d95; font-weight: 700; margin: 0;">${formattedTime}</p>
        </div>
        <div style="margin-top: 16px; padding: 16px; background: #fff7ed; border: 1px solid #fbbf24; border-radius: 12px;">
          <p style="font-size: 14px; color: #92400e; margin: 0;">
            <strong>⏳ Google Meet link coming soon!</strong><br/>
            The meeting link will be emailed to you at <strong>${escapeHtml(name)}</strong> shortly before the interview.
          </p>
        </div>`
        : `
        <div style="padding: 24px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 12px;">
          <p style="font-size: 15px; color: #92400e; margin: 0 0 8px;"><strong>🎯 Interview Details Pending</strong></p>
          <p style="font-size: 14px; color: #92400e; margin: 0; line-height: 1.5;">
            You have been shortlisted for an interview! The specific date, time, and Google Meet link will be shared with you soon.
          </p>
        </div>`}
        <p style="font-size: 13px; color: #8b5cf6; margin: 20px 0 0; font-style: italic;">
          Questions? Email us at <a href="mailto:${ADMIN_EMAIL}" style="color: #7c3aed; font-weight: 600;">${ADMIN_EMAIL}</a>
        </p>
      </div>
    </div>`

  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7;">Dear ${escapedName},</p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      <strong>Congratulations!</strong> You have been invited for an interview for the <strong>${escapedRole}</strong> position at <strong>Growlancer</strong>.
    </p>

    <p style="font-size: 14px; color: #475569; line-height: 1.7; margin-bottom: 24px;">
      We were truly impressed by your application and would love the opportunity to get to know you better. This will be a conversational video call where we can discuss your experience, skills, and what you're passionate about.
    </p>

    ${meetSection}

    <!-- Preparation Tips -->
    <div style="margin: 28px 0; padding: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <h3 style="font-size: 16px; color: #0f172a; margin: 0 0 16px; font-weight: 700;">⭐ How to Prepare for Your Interview</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
        <tr>
          <td style="padding: 8px 12px; width: 32px; vertical-align: top; font-size: 16px;">🔍</td>
          <td style="padding: 8px 0 8px 4px;">Research Growlancer — explore <a href="${APP_URL}" style="color: #059669;">our platform</a> and understand what we're building</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; width: 32px; vertical-align: top; font-size: 16px;">🎯</td>
          <td style="padding: 8px 0 8px 4px;">Review the job description and prepare specific examples from your past work</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; width: 32px; vertical-align: top; font-size: 16px;">💻</td>
          <td style="padding: 8px 0 8px 4px;">Test your camera, microphone, and internet connection at least 15 minutes before</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; width: 32px; vertical-align: top; font-size: 16px;">🤫</td>
          <td style="padding: 8px 0 8px 4px;">Find a quiet, well-lit space with minimal distractions</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; width: 32px; vertical-align: top; font-size: 16px;">❓</td>
          <td style="padding: 8px 0 8px 4px;">Prepare 2-3 thoughtful questions to ask us about the role, team, and company</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If you have any questions before the interview or need to reschedule, simply reply to this email or reach out to
      <a href="mailto:${ADMIN_EMAIL}" style="color: #059669; font-weight: 600;">${ADMIN_EMAIL}</a>.
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      We look forward to speaking with you! 🚀
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Warm regards,<br/>
      <strong style="font-size: 16px; color: #059669;">Mohammad Miran Khan</strong><br/>
      <span style="color: #94a3b8; font-size: 13px;">Founder & CEO, Growlancer</span>
    </p>`

  return baseEmailHtml('Interview Invitation — ' + roleName, body)
}

/** PREMIUM Selected Email — Document download + SIGN & RETURN with professional Gmail-friendly design */
function buildSelectedEmailHtml(
  name: string,
  roleName: string,
  offerLetterUrl?: string | null,
  ndaUrl?: string | null,
  internshipLetterUrl?: string | null
): string {
  const escapedName = escapeHtml(name);
  const escapedRole = escapeHtml(roleName);
  const rawName = name;  // for URL/calendar encoding
  const rawRole = roleName;
  const hasAnyDoc = offerLetterUrl || ndaUrl || internshipLetterUrl;
  const allDocsReady = offerLetterUrl && ndaUrl && internshipLetterUrl;

  const docSection = hasAnyDoc ? `
    <!-- ═══════════════════════════════════════════════════════════════ -->
    <!--  DOCUMENTS SECTION — Download Cards with Sign & Return CTA   -->
    <!-- ═══════════════════════════════════════════════════════════════ -->
    <div style="margin: 28px 0; padding: 0; background: #ffffff; border: 2px solid #059669; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 24px 28px; text-align: center;">
        <div style="font-size: 36px; margin-bottom: 6px;">📄</div>
        <h2 style="font-size: 20px; color: white; margin: 0; font-weight: 700;">Your Internship Documents</h2>
        <p style="font-size: 13px; color: #a7f3d0; margin: 6px 0 0;">Please download, sign, and return all documents below</p>
      </div>
      <div style="padding: 24px 28px;">
        <!-- ⚠️ SIGN & RETURN BANNER - HIGHLY VISIBLE -->
        <div style="margin-bottom: 24px; padding: 18px 20px; background: #fffbeb; border: 2px solid #f59e0b; border-radius: 12px; text-align: center;">
          <div style="font-size: 28px; margin-bottom: 8px;">✍️</div>
          <h3 style="font-size: 17px; color: #92400e; margin: 0 0 6px; font-weight: 700;">⚠️ ACTION REQUIRED — SIGN & RETURN</h3>
          <p style="font-size: 14px; color: #92400e; margin: 0 0 12px; line-height: 1.5;">
            Please download each document, <strong>electronically sign or print & sign</strong> all pages, then email the signed copies back to us.
          </p>
          <table style="margin: 0 auto; border-collapse: collapse;" cellpadding="0" cellspacing="0">
            <tr>
              <td style="background: #059669; border-radius: 10px;">
                <a href="mailto:${ADMIN_EMAIL}?subject=Signed%20Documents%20-%20${encodeURIComponent(rawName)}&body=Dear%20Growlancer%20Team%2C%0D%0A%0D%0APlease%20find%20attached%20my%20signed%20documents%20for%20the%20${encodeURIComponent(rawRole)}%20position.%0D%0A%0D%0AThanks%2C%0D%0A${encodeURIComponent(rawName)}"
                   style="display: inline-block; padding: 14px 36px; color: white; text-decoration: none; font-size: 15px; font-weight: 700;">
                  📧 EMAIL SIGNED COPIES →
                </a>
              </td>
            </tr>
          </table>
          <p style="font-size: 12px; color: #b45309; margin: 12px 0 0;">
            Send to: <strong><a href="mailto:${ADMIN_EMAIL}" style="color: #059669; text-decoration: none;">${ADMIN_EMAIL}</a></strong>
          </p>
        </div>

        <!-- Document Cards -->
        ${[
          { label: 'Offer Letter', icon: '📜', url: offerLetterUrl, desc: 'Formal offer of internship position' },
          { label: 'Non-Disclosure Agreement (NDA)', icon: '🔒', url: ndaUrl, desc: 'Confidentiality agreement for proprietary information' },
          { label: 'Internship Letter', icon: '🎓', url: internshipLetterUrl, desc: 'Official confirmation of internship terms' },
        ].map((doc, i) => `
        <div style="margin-bottom: ${i < 2 ? '16px' : '0'}; padding: 18px 20px; background: ${doc.url ? '#f0fdf4' : '#f8fafc'}; border: ${doc.url ? '1px solid #86efac' : '1px solid #e2e8f0'}; border-radius: 12px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 48px; vertical-align: middle; text-align: center; font-size: 28px;">${doc.icon}</td>
              <td style="padding: 0 16px; vertical-align: middle;">
                <p style="font-size: 15px; color: #0f172a; font-weight: 700; margin: 0 0 2px;">${doc.label}</p>
                <p style="font-size: 12px; color: #64748b; margin: 0;">${doc.desc}</p>
              </td>
              <td style="vertical-align: middle; text-align: right; width: 140px;">
                ${doc.url ? `
                <a href="${doc.url}"
                   style="display: inline-block; padding: 12px 24px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; white-space: nowrap;">
                  📥 Download PDF
                </a>` : `
                <span style="display: inline-block; padding: 12px 20px; background: #e2e8f0; color: #94a3b8; border-radius: 10px; font-size: 13px; font-weight: 600;">
                  ⏳ Awaiting
                </span>`}
              </td>
            </tr>
          </table>
        </div>`).join('')}

        ${allDocsReady ? `
        <div style="margin-top: 20px; padding: 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 12px; text-align: center;">
          <p style="font-size: 14px; color: #166534; margin: 0; font-weight: 600;">
            ✅ All 3 documents ready! Download each, sign, and email back to complete your onboarding.
          </p>
        </div>` : `
        <div style="margin-top: 20px; padding: 14px; background: #fffbeb; border: 1px solid #fbbf24; border-radius: 10px; text-align: center;">
          <p style="font-size: 13px; color: #92400e; margin: 0;">
            ⏳ Some documents are still pending. You will receive a separate notification when they are ready.
          </p>
        </div>`}
      </div>
    </div>`
    : ''

  const docFallback = !hasAnyDoc ? `
    <!-- DOCUMENTS PENDING BANNER -->
    <div style="margin: 28px 0; padding: 24px; background: #fffbeb; border: 2px solid #fbbf24; border-radius: 16px; text-align: center;">
      <div style="font-size: 36px; margin-bottom: 8px;">⏳</div>
      <h3 style="font-size: 18px; color: #92400e; margin: 0 0 8px; font-weight: 700;">Documents Coming Soon</h3>
      <p style="font-size: 14px; color: #92400e; margin: 0; line-height: 1.5;">
        Your offer letter, NDA, and internship letter are being prepared. You will receive them via email shortly.
      </p>
    </div>` : ''

  const body = `
    <p style="font-size: 16px; color: #0f172a; line-height: 1.7;">Dear ${escapedName},</p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      On behalf of the entire team at <strong>Growlancer</strong>, I am absolutely delighted to inform you that
      you have been <strong style="color: #059669;">selected</strong> for the
      <strong>${escapedRole}</strong> internship position.
    </p>

    <!-- CONGRATULATIONS BANNER -->
    <div style="margin: 28px 0; padding: 0; background: #ffffff; border: 2px solid #059669; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
        <h2 style="font-size: 26px; color: white; margin: 0 0 10px; font-weight: 800;">Congratulations!</h2>
        <p style="font-size: 15px; color: #a7f3d0; margin: 0; line-height: 1.6; max-width: 400px; margin-left: auto; margin-right: auto;">
          We were truly impressed by your skills, enthusiasm, and potential. We believe you will be a valuable addition to our team!
        </p>
      </div>
      <div style="padding: 24px 28px;">
        <table style="width: 100%; border-collapse: collapse;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 10px 12px; width: 110px; font-size: 13px; color: #64748b; font-weight: 600;">Position</td>
            <td style="padding: 10px 0; font-size: 15px; color: #0f172a; font-weight: 700;">${escapedRole}</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; width: 110px; font-size: 13px; color: #64748b; font-weight: 600; border-top: 1px solid #e2e8f0;">Start Date</td>
            <td style="padding: 10px 0; font-size: 15px; color: #0f172a; font-weight: 600; border-top: 1px solid #e2e8f0;">To be confirmed during onboarding</td>
          </tr>
          <tr>
            <td style="padding: 10px 12px; width: 110px; font-size: 13px; color: #64748b; font-weight: 600; border-top: 1px solid #e2e8f0;">Type</td>
            <td style="padding: 10px 0; font-size: 15px; color: #0f172a; font-weight: 600; border-top: 1px solid #e2e8f0;">Remote Internship</td>
          </tr>
        </table>
      </div>
    </div>

    ${docSection || docFallback}

    <!-- 📋 NEXT STEPS -->
    <div style="margin: 28px 0; padding: 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px;">
      <h3 style="font-size: 16px; color: #0f172a; margin: 0 0 18px; font-weight: 700;">📋 Your Onboarding Checklist</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
        <tr>
          <td style="padding: 8px 14px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: 700;">1</span>
          </td>
          <td style="padding: 8px 0;"><strong style="color: #0f172a;">Download & Review</strong> — Read all documents carefully to understand the terms</td>
        </tr>
        <tr>
          <td style="padding: 8px 14px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: 700;">2</span>
          </td>
          <td style="padding: 8px 0;"><strong style="color: #0f172a;">Sign All Documents</strong> — Electronically sign or print, sign & scan each document</td>
        </tr>
        <tr>
          <td style="padding: 8px 14px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: 700;">3</span>
          </td>
          <td style="padding: 8px 0;"><strong style="color: #0f172a;">Email Signed Copies</strong> — Attach all signed PDFs and reply to this email or send to <a href="mailto:${ADMIN_EMAIL}" style="color: #059669; font-weight: 600;">${ADMIN_EMAIL}</a></td>
        </tr>
        <tr>
          <td style="padding: 8px 14px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: 700;">4</span>
          </td>
          <td style="padding: 8px 0;"><strong style="color: #0f172a;">Onboarding Call</strong> — Our team will reach out within 3 business days to schedule your kickoff</td>
        </tr>
        <tr>
          <td style="padding: 8px 14px; width: 36px; vertical-align: top;">
            <span style="display: inline-block; width: 28px; height: 28px; background: #059669; color: white; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: 700;">5</span>
          </td>
          <td style="padding: 8px 0;"><strong style="color: #0f172a;">Welcome to Growlancer!</strong> 🚀 Begin your internship journey and contribute to our mission</td>
        </tr>
      </table>
    </div>

    <!-- QUICK LINKS -->
    <div style="margin: 24px 0; padding: 20px; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #0f172a; margin: 0 0 14px; font-weight: 700;">🔗 Useful Links</h3>
      <table style="font-size: 13px; width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; width: 50%;">🌐 <a href="${APP_URL}" style="color: #059669; text-decoration: none;">Growlancer Platform</a></td>
          <td style="padding: 6px 0; width: 50%;">💻 <a href="${GITHUB_URL}" style="color: #059669; text-decoration: none;">GitHub Organization</a></td>
        </tr>
        <tr>
          <td style="padding: 6px 0;">📧 <a href="mailto:${ADMIN_EMAIL}" style="color: #059669; text-decoration: none;">Contact HR</a></td>
          <td style="padding: 6px 0;">📖 <a href="${APP_URL}/internships" style="color: #059669; text-decoration: none;">Internship Program</a></td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If you have any questions about the documents, the signing process, or what to expect next, please don't hesitate to reach out to us at <a href="mailto:${ADMIN_EMAIL}" style="color: #059669; font-weight: 600;">${ADMIN_EMAIL}</a>. We're here to help!
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Welcome to the team! We are thrilled to have you on board and can't wait to achieve great things together. 🚀
    </p>

    <!-- SIGNATURE BLOCK -->
    <div style="margin-top: 32px; padding-top: 24px; border-top: 2px solid #e2e8f0;">
      <p style="font-size: 15px; color: #0f172a; line-height: 1.7; margin: 0 0 4px;">
        With warm regards,
      </p>
      <p style="font-size: 16px; color: #059669; margin: 0 0 2px; font-weight: 700;">
        Mohammad Miran Khan
      </p>
      <p style="font-size: 13px; color: #64748b; margin: 0 0 12px;">
        Founder & CEO, Growlancer
      </p>
      <table style="border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 16px; background: #f0fdf4; border-radius: 8px;">
            <p style="font-size: 11px; color: #166534; margin: 0;">
              🌐 ${APP_URL} &nbsp;|&nbsp; 📧 ${ADMIN_EMAIL}
            </p>
          </td>
        </tr>
      </table>
    </div>`
  return baseEmailHtml('Congratulations — You\'re Selected! 🎉', body)
}

// TODO(review): The document URL links (offerLetterUrl, ndaUrl, internshipLetterUrl) in the selected email
// are currently embedded as raw href. If these are user-uploaded URLs, they should be validated.
// For now they are storage URLs from admin uploads, which are trusted.

/** Rejected — respectful rejection with encouragement */
function buildRejectedEmailHtml(name: string, roleName: string): string {
  const escapedName = escapeHtml(name);
  const escapedRole = escapeHtml(roleName);
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Dear ${escapedName},</p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Thank you for taking the time and effort to apply for the <strong>${escapedRole}</strong> position at
      <strong>Growlancer</strong>. We truly appreciate your interest in being part of our journey.
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      After careful consideration, we regret to inform you that we have decided to move forward with
      other candidates for this position. Please know that this was a difficult decision, and we were
      genuinely impressed by your application and enthusiasm.
    </p>

    <div style="margin: 28px 0; padding: 24px; background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fca5a5; border-radius: 16px; text-align: center;">
      <div style="font-size: 36px; margin-bottom: 12px;">💪</div>
      <h3 style="font-size: 16px; color: #991b1b; margin: 0 0 8px;">Keep Growing — Better Opportunities Await</h3>
      <p style="font-size: 14px; color: #7f1d1d; margin: 0; line-height: 1.6;">
        A rejection is not a reflection of your worth or potential. Every successful professional has faced
        setbacks along the way — what matters is how you use them to grow stronger.
      </p>
    </div>

    <div style="margin: 24px 0; padding: 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #0f172a; margin: 0 0 12px;">🚀 We Encourage You To</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #475569;">
        <tr>
          <td style="padding: 5px 10px; width: 24px; vertical-align: top;">📌</td>
          <td style="padding: 5px 0;">Apply again for future internship cohorts — we would love to reconsider you</td>
        </tr>
        <tr>
          <td style="padding: 5px 10px; width: 24px; vertical-align: top;">📌</td>
          <td style="padding: 5px 0;">Keep building your portfolio and skills — growth is a continuous journey</td>
        </tr>
        <tr>
          <td style="padding: 5px 10px; width: 24px; vertical-align: top;">📌</td>
          <td style="padding: 5px 0;">Follow us on <a href="${APP_URL}" style="color: #059669;">Growlancer</a> for future opportunities and updates</td>
        </tr>
        <tr>
          <td style="padding: 5px 10px; width: 24px; vertical-align: top;">📌</td>
          <td style="padding: 5px 0;">Contribute to our open-source projects on <a href="${GITHUB_URL}" style="color: #059669;">GitHub</a> to showcase your skills</td>
        </tr>
      </table>
    </div>

    <p style="font-size: 14px; color: #64748b; line-height: 1.7; font-style: italic; text-align: center; margin: 24px 0;">
      "Success is not final, failure is not fatal: it is the courage to continue that counts."
    </p>

    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      We wish you nothing but the very best in your future endeavors. Keep learning, keep building, and keep growing.
    </p>

    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      With warm regards,<br/>
      <strong style="font-size: 15px; color: #059669;">Mohammad Miran Khan</strong><br/>
      <span style="color: #94a3b8;">Founder & CEO, Growlancer</span>
    </p>`
  return baseEmailHtml('Application Update', body)
}

// ─── Status → Email Mapper ──────────────────────────────────────────────────
function sendStatusEmail(
  name: string,
  email: string,
  roleName: string,
  newStatus: string,
  offerLetterUrl?: string | null,
  ndaUrl?: string | null,
  internshipLetterUrl?: string | null,
  googleMeetLink?: string | null,
  interviewTime?: string | null,
  attachments?: Attachment[]
): Promise<boolean> {
  switch (newStatus) {
    case 'shortlisted':
      return sendBrevoEmail(email, name, `Shortlisted — ${roleName}`, buildShortlistedEmailHtml(name, roleName), attachments)
    case 'interview_scheduled':
      return sendBrevoEmail(email, name, `Interview Invitation — ${roleName} 🎤`, buildInterviewEmailHtml(name, roleName, googleMeetLink, interviewTime), attachments)
    case 'selected':
      return sendBrevoEmail(email, name, `Congratulations — You're Selected for ${roleName}! 🎉`, buildSelectedEmailHtml(name, roleName, offerLetterUrl, ndaUrl, internshipLetterUrl), attachments)
    case 'rejected':
      return sendBrevoEmail(email, name, `Application Update — ${roleName}`, buildRejectedEmailHtml(name, roleName), attachments)
    default:
      console.warn(`No email template for status: ${newStatus}`);
      return true
  }
}

// ─── Main Server ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Service-role client for DB operations (bypasses RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Anon client for auth verification (GET/PATCH admin checks)
    const supabaseAnon = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization') ?? '' },
        },
      }
    )

    // Rate limiting (30 req/min per IP)
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown'
    try {        await supabaseAnon.rpc('cleanup_expired_rate_limits')
      const { count } = await supabaseClient
        .from('rate_limits')
        .select('*', { count: 'exact', head: true })
        .eq('identifier', `internship:${clientIP}`)
        .gte('window_start', new Date(Date.now() - 60000).toISOString())

      if (count !== null && count >= 30) {
        return new Response(
          JSON.stringify({ error: 'Too many requests' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      await supabaseAnon
        .from('rate_limits')
        .insert({ identifier: `internship:${clientIP}`, route: 'internship-applications', count: 1, window_start: new Date().toISOString() })
    } catch {
      // Rate limiting is best-effort
    }

    const { method } = req

    // ─── POST: Submit new application ──────────────────────────────────────
    if (method === 'POST') {
      const body = await req.json()
      const {
        full_name, email, phone, country, university, degree, graduation_year,        role_id, role_name, linkedin_url, google_meet_link, github_url, portfolio_url,
        resume_url, resume_file_path, resume_file_name,
        cover_letter, why_growlancer, weekly_availability,
        available_from, available_to,
      } = body

      if (!full_name || !email || !role_id || !role_name || !cover_letter || !linkedin_url) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: full_name, email, role_id, role_name, linkedin_url, cover_letter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 🆕 Check if applicant already exists (same email) — update to 'applied' instead of duplicate
      const { data: existingApp } = await supabaseClient
        .from('internship_applications')
        .select('id, status')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      let application: Record<string, unknown> = {}
      let insertError: { message: string; code: string } | null = null
      let isReapply = false

      if (existingApp) {
        // Existing applicant — update record back to 'applied' with fresh data
        isReapply = true
        const { data: updated, error: updateErr } = await supabaseClient
          .from('internship_applications')
          .update({
            full_name, email,
            phone: phone || null, country: country || null,
            university: university || null, degree: degree || null,
            graduation_year: graduation_year || null, role_id, role_name,
            linkedin_url: linkedin_url || null,
            google_meet_link: google_meet_link || null,
            github_url: github_url || null, portfolio_url: portfolio_url || null,
            resume_url: resume_url || null,
            resume_file_path: resume_file_path || null,
            resume_file_name: resume_file_name || null,
            cover_letter,
            why_growlancer: why_growlancer || null,
            weekly_availability: weekly_availability || null,
            available_from: available_from || null, available_to: available_to || null,
            status: 'applied',
            notes: null,
          })
          .eq('id', existingApp.id)
          .select()
          .single()

        if (updateErr) {
          insertError = updateErr
        } else {
          application = updated as Record<string, unknown>
        }
      } else {
        // New applicant — insert fresh record
        const { data: inserted, error: insertErr } = await supabaseClient
          .from('internship_applications')
          .insert({
            full_name, email,
            phone: phone || null, country: country || null,
            university: university || null, degree: degree || null,
            graduation_year: graduation_year || null, role_id, role_name,
            linkedin_url: linkedin_url || null,
            google_meet_link: google_meet_link || null,
            github_url: github_url || null, portfolio_url: portfolio_url || null,
            resume_url: resume_url || null,
            resume_file_path: resume_file_path || null,
            resume_file_name: resume_file_name || null,
            cover_letter,
            why_growlancer: why_growlancer || null,
            weekly_availability: weekly_availability || null,
            available_from: available_from || null, available_to: available_to || null,
            status: 'applied',
          })
          .select()
          .single()

        if (insertErr) {
          insertError = insertErr
        } else {
          application = inserted as Record<string, unknown>
        }
      }

      if (insertError || !application) {
        console.error('Application save error:', JSON.stringify(insertError))
        return new Response(
          JSON.stringify({ error: 'Failed to submit application.', details: insertError?.message, code: insertError?.code }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // === SEND EMAILS VIA BREVO ===
      const appData: ApplicationData = {
        full_name, email, phone, country, university, degree, graduation_year,        role_id, role_name, linkedin_url, google_meet_link, github_url, portfolio_url,
        resume_url, resume_file_path, resume_file_name,
        cover_letter, why_growlancer, weekly_availability,
      }

      // 1. Send admin notification email
      const adminEmailSent = await sendBrevoEmail(
        ADMIN_EMAIL, 'Growlancer Admin',
        `[New Application] ${role_name} - ${full_name}`,
        buildAdminEmailHtml(appData)
      )

      // 2. Send confirmation email to applicant (with immediate "Under Review" status)
      const applicantEmailSent = await sendBrevoEmail(
        email, full_name,
        `Application Received — ${role_name} at Growlancer`,
        buildReceivedEmailHtml(appData)
      )

      // 3. Send "Under Review" email immediately (no need to wait 24 hours)
      const underReviewSent = await sendBrevoEmail(
        email, full_name,
        `Application Under Review — ${role_name} at Growlancer`,
        buildUnderReviewEmailHtml(full_name, role_name)
      )

      console.log(`Brevo emails — admin: ${adminEmailSent}, applicant: ${applicantEmailSent}, under_review: ${underReviewSent}`)

      // Notify admin users via in-app notifications
      const { data: admins } = await supabaseClient
        .from('profiles')
        .select('id')
        .eq('role', 'admin')
        .is('deleted_at', null)

      if (admins && admins.length > 0) {
        await supabaseClient.from('notifications').insert(
          admins.map(admin => ({
            user_id: admin.id,
            type: 'internship_application',
            title: 'New Internship Application',
            message: `${full_name} applied for ${role_name}`,
            metadata: { application_id: application.id, role_id, role_name, applicant_name: full_name, applicant_email: email },
            action_url: `/admin/internships/${application.id}`,
          }))
        )
      }

      return new Response(
        JSON.stringify({
          success: true,
          application_id: application.id,
          is_reapplication: isReapply,
          emails_sent: { admin: adminEmailSent, applicant: applicantEmailSent, under_review: underReviewSent },
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── GET: List applications (no auth required - admin section is public) ──
    if (method === 'GET') {
      const url = new URL(req.url)
      const status = url.searchParams.get('status')
      const roleFilter = url.searchParams.get('role_id')
      const search = url.searchParams.get('search')
      const limit = parseInt(url.searchParams.get('limit') || '50')
      const offset = parseInt(url.searchParams.get('offset') || '0')

      let query = supabaseClient.from('internship_applications').select('*').order('created_at', { ascending: false }).range(offset, offset + limit - 1)
      if (status) query = query.eq('status', status)
      if (roleFilter) query = query.eq('role_id', roleFilter)
      if (search) query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`)

      let countQuery = supabaseClient.from('internship_applications').select('*', { count: 'exact', head: true })
      if (status) countQuery = countQuery.eq('status', status)
      if (roleFilter) countQuery = countQuery.eq('role_id', roleFilter)
      const { count } = await countQuery

      const { data: applications, error } = await query
      if (error) throw error

      return new Response(
        JSON.stringify({ applications, total: count || 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── PATCH: Update application status OR send email ───────────────────
    if (method === 'PATCH') {
      const body = await req.json()
      const { application_id, status: newStatus, notes, google_meet_link, interview_time, send_email_only, offer_letter_url, nda_url, internship_letter_url } = body

      if (!application_id) {
        return new Response(JSON.stringify({ error: 'application_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Get full current application data
      const { data: currentApp, error: fetchError } = await supabaseClient
        .from('internship_applications')
        .select('*')
        .eq('id', application_id)
        .single()

      if (fetchError || !currentApp) {
        return new Response(JSON.stringify({ error: 'Application not found' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // ─── EMAIL-ONLY MODE: send email with optional link/time save ──────
      if (send_email_only === true) {
        const statusToSend = newStatus || currentApp.status

        // Save meet link/time to DB if provided (admin might not have saved them yet)
        const emailSaveData: Record<string, unknown> = {}
        if (google_meet_link !== undefined) emailSaveData.google_meet_link = google_meet_link
        if (interview_time !== undefined) emailSaveData.interview_time = interview_time
        if (Object.keys(emailSaveData).length > 0) {
          await supabaseClient
            .from('internship_applications')
            .update(emailSaveData)
            .eq('id', application_id)
        }

        // Use provided values if given, otherwise fall back to DB (which may have been just updated)
        const effectiveMeetLink = google_meet_link !== undefined ? google_meet_link : currentApp.google_meet_link
        const effectiveTime = interview_time !== undefined ? interview_time : currentApp.interview_time

        const effectiveOfferUrl = offer_letter_url !== undefined ? offer_letter_url : currentApp.offer_letter_url;
        const effectiveNdaUrl = nda_url !== undefined ? nda_url : currentApp.nda_url;
        const effectiveInternshipUrl = internship_letter_url !== undefined ? internship_letter_url : currentApp.internship_letter_url;

        // Fetch PDF attachments for 'selected' status (offer letter, NDA, internship letter)
        let attachments: Attachment[] | undefined;
        if (statusToSend === 'selected') {
          const attachPromises: Promise<Attachment | null>[] = [];
          if (effectiveOfferUrl) {
            attachPromises.push(fetchPdfAsAttachment(effectiveOfferUrl, getFileNameFromUrl(effectiveOfferUrl, 'Offer_Letter.pdf')));
          }
          if (effectiveNdaUrl) {
            attachPromises.push(fetchPdfAsAttachment(effectiveNdaUrl, getFileNameFromUrl(effectiveNdaUrl, 'NDA.pdf')));
          }
          if (effectiveInternshipUrl) {
            attachPromises.push(fetchPdfAsAttachment(effectiveInternshipUrl, getFileNameFromUrl(effectiveInternshipUrl, 'Internship_Letter.pdf')));
          }

          if (attachPromises.length > 0) {
            const results = await Promise.all(attachPromises);
            const validAttachments = results.filter((a): a is Attachment => a !== null);
            if (validAttachments.length > 0) {
              attachments = validAttachments;
              console.log(`Fetched ${validAttachments.length} PDF attachment(s) for selected email`);
            }
          }
        }

        let statusEmailSent = false

        if (['shortlisted', 'interview_scheduled', 'selected', 'rejected'].includes(statusToSend)) {
          statusEmailSent = await sendStatusEmail(
            currentApp.full_name,
            currentApp.email,
            currentApp.role_name,
            statusToSend,
            effectiveOfferUrl || null,
            effectiveNdaUrl || null,
            effectiveInternshipUrl || null,
            effectiveMeetLink || null,
            effectiveTime || null,
            attachments,
          )
          console.log(`Email-only mode: ${statusToSend} email sent: ${statusEmailSent}`)
        }

        return new Response(
          JSON.stringify({ ...currentApp, status_email_sent: statusEmailSent }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ─── STATUS UPDATE MODE: update DB only, NO email sent ──────────────
      const updateData: Record<string, unknown> = {}
      if (newStatus) updateData.status = newStatus
      if (notes !== undefined) updateData.notes = notes
      if (google_meet_link !== undefined) updateData.google_meet_link = google_meet_link
      if (interview_time !== undefined) updateData.interview_time = interview_time

      const { data: application, error } = await supabaseClient
        .from('internship_applications')
        .update(updateData)
        .eq('id', application_id)
        .select()
        .single()

      if (error) throw error

      // NO automatic email — admin must click "Send Email" separately
      return new Response(
        JSON.stringify({ ...application, status_email_sent: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Internship applications error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
