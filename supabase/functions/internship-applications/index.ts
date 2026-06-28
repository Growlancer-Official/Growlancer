// Internship Applications Edge Function
// Handles new internship application submissions & status updates
// Sends real email notifications via Brevo (Sendinblue):
//   1) Admin notification to growlancer.own@gmail.com
//   2) Confirmation email to applicant
//   3) Status change emails (shortlisted, interview, selected, rejected)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') ?? ''
const BREVO_FROM_EMAIL = Deno.env.get('BREVO_FROM_EMAIL') ?? 'growlancer.own@gmail.com'
const BREVO_FROM_NAME = 'Growlancer Team'
const ADMIN_EMAIL = 'growlancer.own@gmail.com'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://growlancer.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-app-version, x-app-name',
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

// ─── Brevo Email Sender ─────────────────────────────────────────────────────
async function sendBrevoEmail(
  to: string,
  toName: string,
  subject: string,
  htmlContent: string
): Promise<boolean> {
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': BREVO_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
        to: [{ email: to, name: toName }],
        subject,
        htmlContent,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('Brevo API error:', res.status, text)
      // Return error info so we can debug
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f8fafc; padding: 40px 20px; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 32px; text-align: center;">
      <h1 style="color: white; font-size: 22px; font-weight: 700; margin: 0;">${title}</h1>
    </div>
    <!-- Body -->
    <div style="padding: 32px;">
      ${bodyHtml}
    </div>
    <!-- Footer -->
    <div style="padding: 24px 32px; background: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="color: #94a3b8; font-size: 12px; margin: 0 0 4px;">Growlancer — AI-Powered Freelancing Marketplace</p>
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        <a href="${APP_URL}" style="color: #059669; text-decoration: none;">${APP_URL}</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

/** Application Received — sent immediately after submission */
function buildReceivedEmailHtml(data: ApplicationData): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${data.full_name},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Thank you for applying to the <strong>${data.role_name}</strong> position at Growlancer.
      Your application has been received and is now under review by our team.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #166534; margin: 0 0 12px;">📋 What happens next?</h3>
      <table style="font-size: 14px; color: #166534;">
        <tr><td style="padding: 4px 12px 4px 0;">1.</td><td>Application review (within 24 hours)</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;">2.</td><td>Interview invitation (single round)</td></tr>
        <tr><td style="padding: 4px 12px 4px 0;">3.</td><td>Onboarding &amp; start</td></tr>
      </table>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      If you have any questions, feel free to reach out to us at
      <a href="mailto:${ADMIN_EMAIL}" style="color: #059669;">${ADMIN_EMAIL}</a>.
    </p>`
  return baseEmailHtml('Application Received! 🎉', body)
}

/** Admin Notification — sent to growlancer.own@gmail.com */
function buildAdminEmailHtml(data: ApplicationData): string {
  const PROJECT_REF = Deno.env.get('SUPABASE_URL')?.replace('https://', '')?.replace('.supabase.co', '') || 'zttwsjehcgaicziqyxpq'
  const resumeLink = data.resume_file_path
    ? `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/internship_resumes/${data.resume_file_path}`
    : data.resume_url || 'Not provided'

  const body = `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #64748b; width: 140px; border-bottom: 1px solid #f1f5f9;">Name</td>
          <td style="padding: 8px 0; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${data.full_name}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Email</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><a href="mailto:${data.email}" style="color: #059669;">${data.email}</a></td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Role</td>
          <td style="padding: 8px 0; font-weight: 600; color: #0f172a; border-bottom: 1px solid #f1f5f9;">${data.role_name}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Phone</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.phone || 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Country</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.country || 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">University</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.university || 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Degree</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.degree || 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Grad Year</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.graduation_year || 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">GitHub</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.github_url ? `<a href="${data.github_url}" style="color: #059669;">${data.github_url}</a>` : 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">LinkedIn</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.linkedin_url ? `<a href="${data.linkedin_url}" style="color: #059669;">${data.linkedin_url}</a>` : 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Portfolio</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;">${data.portfolio_url ? `<a href="${data.portfolio_url}" style="color: #059669;">${data.portfolio_url}</a>` : 'Not provided'}</td></tr>
      <tr><td style="padding: 8px 0; color: #64748b; border-bottom: 1px solid #f1f5f9;">Resume</td>
          <td style="padding: 8px 0; border-bottom: 1px solid #f1f5f9;"><a href="${resumeLink}" style="color: #059669;">View Resume</a></td></tr>
      <tr><td style="padding: 8px 0; color: #64748b;">Availability</td>
          <td style="padding: 8px 0;">${data.weekly_availability || 'Not specified'} hrs/week</td></tr>
    </table>
    <div style="margin-top: 24px; padding: 16px; background: #f1f5f9; border-radius: 12px;">
      <h3 style="font-size: 13px; color: #64748b; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Cover Letter</h3>
      <p style="font-size: 14px; color: #0f172a; line-height: 1.6; margin: 0;">${data.cover_letter}</p>
    </div>
    ${data.why_growlancer ? `
    <div style="margin-top: 16px; padding: 16px; background: #f1f5f9; border-radius: 12px;">
      <h3 style="font-size: 13px; color: #64748b; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.05em;">Why Growlancer?</h3>
      <p style="font-size: 14px; color: #0f172a; line-height: 1.6; margin: 0;">${data.why_growlancer}</p>
    </div>` : ''}
    <div style="margin-top: 30px; text-align: center;">
      <a href="${APP_URL}/admin/internships" style="display: inline-block; padding: 12px 32px; background: #059669; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
        View in Admin Dashboard →
      </a>
    </div>`
  return baseEmailHtml('New Internship Application', body)
}

/** Under Review — sent 24 hours after application */
function buildUnderReviewEmailHtml(name: string, roleName: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${name},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      This is a quick update on your application for the <strong>${roleName}</strong> position.
      Our team is actively reviewing your application and we'll get back to you within the next 2–3 business days.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #166534; margin: 0 0 8px;">⏳ Current Status</h3>
      <p style="font-size: 14px; color: #166534; margin: 0;">Under Review</p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      While you wait, feel free to check out our platform at
      <a href="${APP_URL}" style="color: #059669;">${APP_URL}</a> to learn more about what we're building.
    </p>`
  return baseEmailHtml('Application Under Review 📝', body)
}

/** Shortlisted */
function buildShortlistedEmailHtml(name: string, roleName: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${name},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Great news! You've been <strong>shortlisted</strong> for the <strong>${roleName}</strong> position at Growlancer.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #92400e; margin: 0 0 8px;">⭐ Next Step</h3>
      <p style="font-size: 14px; color: #92400e; margin: 0;">
        Our team will reach out to you within 48 hours to schedule an interview.
        Please keep an eye on your inbox (and spam folder).
      </p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      Questions? Email us at <a href="mailto:${ADMIN_EMAIL}" style="color: #059669;">${ADMIN_EMAIL}</a>.
    </p>`
  return baseEmailHtml('Congratulations — You\'re Shortlisted! 🎉', body)
}

/** Interview Scheduled */
function buildInterviewEmailHtml(name: string, roleName: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${name},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      You've been invited for an interview for the <strong>${roleName}</strong> position at Growlancer!
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f3e8ff; border: 1px solid #d8b4fe; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #6b21a8; margin: 0 0 8px;">🎤 Interview Details</h3>
      <p style="font-size: 14px; color: #6b21a8; margin: 0;">
        Our team will contact you shortly with specific interview timing and format details.
        The interview will be a 30–45 minute video call with the founder.
      </p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      <strong>Tips for success:</strong>
    </p>
    <ul style="font-size: 14px; color: #64748b; line-height: 1.7;">
      <li>Prepare questions about the role and Growlancer</li>
      <li>Have a stable internet connection ready</li>
    </ul>`
  return baseEmailHtml('Interview Invitation 🎤', body)
}

/** Selected */
function buildSelectedEmailHtml(name: string, roleName: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${name},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      We're thrilled to inform you that you've been <strong>selected</strong> for the <strong>${roleName}</strong> position at Growlancer! 🎉
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #166534; margin: 0 0 8px;">🚀 Onboarding Steps</h3>
      <ol style="font-size: 14px; color: #166534; margin: 0; padding-left: 20px;">
        <li style="padding: 4px 0;">Welcome email with onboarding details</li>
        <li style="padding: 4px 0;">Access to GitHub repository and tools</li>
        <li style="padding: 4px 0;">Introduction to the team via Google Meet</li>
        <li style="padding: 4px 0;">First task assignment and kickoff call</li>
      </ol>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      Our team will send you the complete onboarding package within 24 hours.
      Get ready to build the future of AI-powered freelancing! 🚀
    </p>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      Welcome aboard!<br/>
      — The Growlancer Team
    </p>`
  return baseEmailHtml('Welcome to Growlancer — You\'re Selected! 🎉🚀', body)
}

/** Rejected */
function buildRejectedEmailHtml(name: string, roleName: string): string {
  const body = `
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">Hi ${name},</p>
    <p style="font-size: 15px; color: #0f172a; line-height: 1.7;">
      Thank you for taking the time to apply for the <strong>${roleName}</strong> position at Growlancer.
      We truly appreciate your interest in joining our team.
    </p>
    <div style="margin: 28px 0; padding: 20px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;">
      <h3 style="font-size: 14px; color: #991b1b; margin: 0 0 8px;">💡 After careful consideration</h3>
      <p style="font-size: 14px; color: #991b1b; margin: 0;">
        We've decided to move forward with other candidates for this position.
        This was a difficult decision, and we were impressed by your application.
      </p>
    </div>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      <strong>Don't lose heart!</strong> We encourage you to:
    </p>
    <ul style="font-size: 14px; color: #64748b; line-height: 1.7;">
      <li>Apply again for future internship cohorts</li>
      <li>Follow us on <a href="${APP_URL}" style="color: #059669;">Growlancer</a> for updates</li>
      <li>Keep building your portfolio and skills</li>
    </ul>
    <p style="font-size: 14px; color: #64748b; line-height: 1.7;">
      We wish you all the best in your journey!<br/>
      — The Growlancer Team
    </p>`
  return baseEmailHtml('Application Update 💙', body)
}

// ─── Status → Email Mapper ──────────────────────────────────────────────────
function sendStatusEmail(
  name: string,
  email: string,
  roleName: string,
  newStatus: string,
): Promise<boolean> {
  switch (newStatus) {
    case 'shortlisted':
      return sendBrevoEmail(email, name, `Shortlisted — ${roleName}`, buildShortlistedEmailHtml(name, roleName))
    case 'interview_scheduled':
      return sendBrevoEmail(email, name, `Interview Invitation — ${roleName}`, buildInterviewEmailHtml(name, roleName))
    case 'selected':
      return sendBrevoEmail(email, name, `You're Selected! — ${roleName}`, buildSelectedEmailHtml(name, roleName))
    case 'rejected':
      return sendBrevoEmail(email, name, `Application Update — ${roleName}`, buildRejectedEmailHtml(name, roleName))
    default:
      console.warn(`No email template for status: ${newStatus}`);
      return true
  }
}

// ─── Main Server ────────────────────────────────────────────────────────────
serve(async (req) => {
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

      if (!full_name || !email || !role_id || !role_name || !cover_letter) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields: full_name, email, role_id, role_name, cover_letter' }),
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

      // Insert the application
      const { data: application, error: insertError } = await supabaseClient
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

      if (insertError) {
        console.error('Insert error:', JSON.stringify(insertError))
        return new Response(
          JSON.stringify({ error: 'Failed to submit application.', details: insertError.message, code: insertError.code }),
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
          emails_sent: { admin: adminEmailSent, applicant: applicantEmailSent, under_review: underReviewSent },
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── GET: List applications (admin only) ───────────────────────────────
    if (method === 'GET') {
      const { data: { user }, error: userError } = await supabaseAnon.auth.getUser()
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

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

    // ─── PATCH: Update application status (admin only) ─────────────────────
    if (method === 'PATCH') {
      const { data: { user }, error: userError } = await supabaseAnon.auth.getUser()
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const { data: profile } = await supabaseClient.from('profiles').select('role').eq('id', user.id).single()
      if (profile?.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      const body = await req.json()
      const { application_id, status: newStatus, notes } = body

      if (!application_id) {
        return new Response(JSON.stringify({ error: 'application_id is required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }

      // Get current application data before updating (for email)
      const { data: currentApp } = await supabaseClient
        .from('internship_applications')
        .select('full_name, email, role_name, status')
        .eq('id', application_id)
        .single()

      // Update the application
      const updateData: Record<string, unknown> = {}
      if (newStatus) updateData.status = newStatus
      if (notes !== undefined) updateData.notes = notes

      const { data: application, error } = await supabaseClient
        .from('internship_applications')
        .update(updateData)
        .eq('id', application_id)
        .select()
        .single()

      if (error) throw error

      // 🆕 Send status change email to applicant (if status actually changed)
      let statusEmailSent = false
      if (newStatus && newStatus !== currentApp?.status) {
        statusEmailSent = await sendStatusEmail(
          currentApp?.full_name || application.full_name,
          currentApp?.email || application.email,
          currentApp?.role_name || application.role_name,
          newStatus,
        )
        console.log(`Status email sent to applicant: ${statusEmailSent} (${newStatus})`)
      }

      return new Response(
        JSON.stringify({ ...application, status_email_sent: statusEmailSent }),
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
