import { describe, it, expect } from 'vitest';
import {
  buildReferralShareIntent,
  buildReferralShareMessage,
  buildReferralShareSubject,
  referralCardFileName,
} from '../lib/referralShare';

const CODE = 'GRW-7K2M-9QXT';
const LINK = 'https://growlanzo.com/signup?ref=GRW-7K2M-9QXT';

describe('buildReferralShareMessage', () => {
  it('contains the formatted code, the link and the sender', () => {
    const message = buildReferralShareMessage({ code: CODE, link: LINK, name: 'Aarav Mehta' });
    expect(message).toContain(CODE);
    expect(message).toContain(LINK);
    expect(message).toContain('Invite from Aarav Mehta.');
  });

  it('reads as a professional invitation — no emoji, no casual greeting', () => {
    const message = buildReferralShareMessage({ code: CODE, link: LINK, name: 'Aarav' });
    expect(message).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u);
    expect(message.toLowerCase()).not.toContain('hey!');
    expect(message.toLowerCase()).not.toContain('🚀');
    expect(message).toContain("You're invited to Growlanzo.");
  });

  it('tails the pitch to the sender role', () => {
    const freelancer = buildReferralShareMessage({ code: CODE, link: LINK, role: 'freelancer' });
    const client = buildReferralShareMessage({ code: CODE, link: LINK, role: 'client' });
    const neutral = buildReferralShareMessage({ code: CODE, link: LINK });

    expect(freelancer).toContain('projects matched to your skills');
    expect(client).toContain('matching that fits the brief you post');
    expect(neutral).toContain('verified talent');
    expect(freelancer).not.toBe(client);
  });

  it('formats an unformatted code before showing it', () => {
    const message = buildReferralShareMessage({ code: 'GRW7K2M9QXT', link: LINK });
    expect(message).toContain(CODE);
  });
});

describe('buildReferralShareSubject', () => {
  it('names the code so inboxes can be searched', () => {
    expect(buildReferralShareSubject({ code: CODE, link: LINK })).toBe(
      `You're invited to Growlanzo — invite code ${CODE}`
    );
  });
});

describe('buildReferralShareIntent', () => {
  it('whatsapp carries the full message', () => {
    const url = buildReferralShareIntent('whatsapp', { code: CODE, link: LINK });
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1])).toContain(CODE);
  });

  it('linkedin shares the tracked link', () => {
    const url = buildReferralShareIntent('linkedin', { code: CODE, link: LINK });
    expect(url).toBe(
      `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(LINK)}`
    );
  });

  it('twitter carries the message', () => {
    const url = buildReferralShareIntent('twitter', { code: CODE, link: LINK });
    expect(decodeURIComponent(url.split('text=')[1])).toContain(CODE);
  });

  it('email encodes a subject and a body', () => {
    const url = buildReferralShareIntent('email', { code: CODE, link: LINK });
    expect(url.startsWith('mailto:?subject=')).toBe(true);
    expect(url).toContain('&body=');
    expect(decodeURIComponent(url)).toContain(CODE);
  });
});

describe('referralCardFileName', () => {
  it('produces a safe PNG filename', () => {
    expect(referralCardFileName(CODE)).toBe(`growlanzo-invite-${CODE}.png`);
    expect(referralCardFileName('grw/7k2m/9qxt')).toBe('growlanzo-invite-GRW-7K2M-9QXT.png');
  });
});
