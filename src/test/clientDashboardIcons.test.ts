import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Client navigation glyphs.
 *
 * Founder report (Oct 2026): the AI Matches and Team Projects icons on the
 * client side read wrong — AI Matches showed a generic "person + magnifier"
 * (a talent-search glyph) while the AI screens themselves use the sparkle, and
 * Team Projects used a rounded "users" variant that reads as an account icon.
 * The fix pairs each destination with the glyph its own page already uses:
 *   • AI Matches   → Sparkles   (the same glyph as ClientMatchesPage)
 *   • Team Projects→ Users      (the same glyph as ClientTeamProjectsPage)
 * This test keeps the two in step.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');

const CLIENT_SHELL = read('src/layouts/ClientDashboardLayout.tsx');
const CLIENT_DASHBOARD = read('src/pages/ClientDashboard.tsx');

describe('client navigation icons match their destination', () => {
  it('AI Matches uses the AI sparkle, not a talent-search glyph', () => {
    expect(CLIENT_SHELL).toContain("path: '/client/matches', icon: Sparkles, label: 'AI Matches'");
    expect(CLIENT_SHELL).not.toContain('UserRoundSearch');
  });

  it('Team Projects uses the group icon', () => {
    expect(CLIENT_SHELL).toContain(
      "path: '/client/team-projects', icon: Users, label: 'Team Projects'"
    );
    expect(CLIENT_SHELL).not.toContain('UsersRound');
  });

  it('the dashboard shortcut to the match page carries the same glyph', () => {
    expect(CLIENT_DASHBOARD).toContain(
      "{ label: 'Find Talent', path: '/client/matches', icon: Sparkles"
    );
  });

  it('both glyphs are imported where they are used', () => {
    const lucideBlock = CLIENT_SHELL.slice(
      CLIENT_SHELL.indexOf("from 'lucide-react'") - 400,
      CLIENT_SHELL.indexOf("from 'lucide-react'")
    );
    expect(lucideBlock).toContain('Sparkles');
    expect(lucideBlock).toContain('Users');
  });
});
