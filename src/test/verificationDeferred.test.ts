import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { IDENTITY_VERIFICATION_ENABLED, isIdentityVerificationPath } from '../lib/featureFlags';
import { requireKycForAction } from '../lib/kycGate';
import { clientProfileCompletion, freelancerProfileCompletion } from '../lib/profileCompletion';

/**
 * Identity verification is deferred for launch.
 *
 * The product change: both roles lost the verification entry points (sidebar,
 * header chip, /dashboard/identity-verification, /client/verification) and the
 * action-time KYC gate stopped blocking orders, escrow funding and withdrawals.
 * In its place, profile completeness is the trust signal and BOTH roles must be
 * able to reach 100% without uploading a document.
 *
 * What must stay true until KYC ships:
 *   1. the flag stays off, so the gate and the chip cannot reappear by accident;
 *   2. old bookmarks do not 404 — the two paths redirect into the profile;
 *   3. neither completion list contains a verification field, or 100% would be
 *      unreachable for a brand-new account;
 *   4. completeness is monotonic: every filled field moves the number up, and a
 *      fully-filled profile is exactly 100.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const FREELANCER_SHELL = read('src/layouts/DashboardLayout.tsx');
const CLIENT_SHELL = read('src/layouts/ClientDashboardLayout.tsx');
const APP = read('src/app/App.tsx');

describe('identity verification is deferred', () => {
  it('the flag is off', () => {
    expect(IDENTITY_VERIFICATION_ENABLED).toBe(false);
  });

  it('neither dashboard shell links to a verification screen', () => {
    expect(FREELANCER_SHELL).not.toContain('/dashboard/identity-verification');
    expect(CLIENT_SHELL).not.toContain('/client/verification');
    // The header chip was the second entry point; it must not be rendered either.
    expect(FREELANCER_SHELL).not.toContain('<VerifyNowHeaderButton');
    expect(CLIENT_SHELL).not.toContain('<VerifyNowHeaderButton');
  });

  it('old links redirect into the profile instead of 404ing', () => {
    expect(APP).toContain(
      '<Route path="identity-verification" element={<Navigate to="/dashboard/profile" replace />} />',
    );
    expect(APP).toContain(
      '<Route path="verification" element={<Navigate to="/client/settings" replace />} />',
    );
    // The user-facing screen is no longer routed (the admin review queue is
    // independent and may stay).
    expect(APP).not.toContain('<IdentityVerificationPage />');
  });

  it('the KYC gate opens the critical actions it used to block', async () => {
    // Signed-in and signed-out both pass: nothing is KYC-gated while deferred,
    // and server-side ownership checks are unaffected.
    await expect(requireKycForAction({ id: 'user-1' })).resolves.toMatchObject({
      verified: true,
      status: 'deferred',
    });
    await expect(requireKycForAction(null)).resolves.toMatchObject({ verified: true });
  });

  it('isIdentityVerificationPath recognises exactly the two deferred paths', () => {
    expect(isIdentityVerificationPath('/dashboard/identity-verification')).toBe(true);
    expect(isIdentityVerificationPath('/client/verification?tab=status')).toBe(true);
    expect(isIdentityVerificationPath('/dashboard/profile')).toBe(false);
    expect(isIdentityVerificationPath(null)).toBe(false);
  });
});

describe('profile completion — 100% is reachable for both roles without KYC', () => {
  const FULL_FREELANCER = {
    name: 'Asha Rao',
    title: 'Product designer',
    bio: 'Eight years designing B2B SaaS dashboards.',
    hourly_rate: 1800,
    skills: ['Figma', 'UX research'],
    languages: ['English', 'Hindi'],
    location: 'Pune, India',
    portfolio_url: 'https://example.com/asha',
    education: 'NID, Ahmedabad',
  };

  const FULL_CLIENT = {
    name: 'Ravi Mehta',
    avatar: 'https://example.com/ravi.png',
    industry: 'E-commerce',
    location: 'Bengaluru, India',
    description: 'We build D2C brands and hire designers quarterly.',
    website: 'https://example.com/store',
  };

  it('a complete freelancer profile is exactly 100 and lists nothing missing', () => {
    const result = freelancerProfileCompletion(FULL_FREELANCER);
    expect(result).toMatchObject({ percent: 100, completed: 9, total: 9, missing: [] });
  });

  it('a complete client profile is exactly 100 and lists nothing missing', () => {
    const result = clientProfileCompletion(FULL_CLIENT);
    expect(result).toMatchObject({ percent: 100, completed: 6, total: 6, missing: [] });
  });

  it('an empty profile scores 0 and names every field', () => {
    expect(freelancerProfileCompletion({}).percent).toBe(0);
    expect(freelancerProfileCompletion({}).missing).toHaveLength(9);
    expect(clientProfileCompletion({}).percent).toBe(0);
    expect(clientProfileCompletion({}).missing).toHaveLength(6);
  });

  it('a business logo counts as the client photo field', () => {
    const withLogo = clientProfileCompletion({ ...FULL_CLIENT, avatar: null, companyLogo: 'https://example.com/logo.png' });
    expect(withLogo.percent).toBe(100);
  });

  it('no completion field is a verification/KYC document', () => {
    const labels = [
      ...freelancerProfileCompletion({}).missing,
      ...clientProfileCompletion({}).missing,
    ];
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(/verif|kyc|aadhaar|pan\b|document|identity/);
    }
  });

  it('completion is monotonic — each filled field raises the score', () => {
    const fields = Object.entries(FULL_FREELANCER);
    let previous = -1;
    for (let count = 0; count <= fields.length; count += 1) {
      const partial = Object.fromEntries(fields.slice(0, count));
      const { percent } = freelancerProfileCompletion(partial as Parameters<typeof freelancerProfileCompletion>[0]);
      expect(percent).toBeGreaterThanOrEqual(previous);
      previous = percent;
    }
    expect(previous).toBe(100);
  });
});
