import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resolveDashboardSection } from '../lib/dashboardSection';

/**
 * Contract for the dashboard header's section name.
 *
 * The defect this locks (founder report, Oct 14 2026 — two screenshots showing
 * "Post New Project" and "Identity Verification" both labelled "Workspace"):
 * the header searched ONLY the sidebar groups and fell back to a hardcoded
 * 'Workspace', so every route the sidebar does not own announced itself with
 * the wrong page name.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8').replace(/\r\n/g, '\n');

const CLIENT_LINKS = [
  { path: '/client', label: 'Overview' },
  { path: '/client/matches', label: 'AI Matches' },
  { path: '/client/invites', label: 'Invites' },
  { path: '/client/proposals', label: 'Proposals' },
  { path: '/client/workspace', label: 'Workspace' },
  { path: '/client/projects', label: 'My Projects' },
  { path: '/client/team-projects', label: 'Team Projects' },
  { path: '/client/verification', label: 'Verification' },
  { path: '/client/support-tickets', label: 'Support Tickets' },
];

describe('resolveDashboardSection', () => {
  it('names every client route the sidebar does not own (the reported bug)', () => {
    // Both of these are real screenshots from the founder's report.
    expect(resolveDashboardSection('/client/post', CLIENT_LINKS)).toBe('Post a Project');
    expect(resolveDashboardSection('/client/verification', CLIENT_LINKS)).toBe('Verification');
    // …and the rest of the non-sidebar routes that used to say "Workspace".
    expect(resolveDashboardSection('/client/team-projects/create', CLIENT_LINKS)).toBe(
      'Post a Team Project'
    );
    expect(resolveDashboardSection('/client/contests/create', CLIENT_LINKS)).toBe('Post a Contest');
    expect(resolveDashboardSection('/client/support-tickets', CLIENT_LINKS)).toBe('Support Tickets');
    expect(resolveDashboardSection('/client/help-center', CLIENT_LINKS)).toBe('Help Center');
    expect(resolveDashboardSection('/client/ai-assistant', CLIENT_LINKS)).toBe('AI Assistant');
  });

  it('names the freelancer routes the sidebar does not own', () => {
    expect(resolveDashboardSection('/dashboard/services/create')).toBe('Create Service');
    expect(resolveDashboardSection('/dashboard/services/edit/abc123')).toBe('Edit Service');
    expect(resolveDashboardSection('/dashboard/certifications/abc123')).toBe('Skill Test');
    expect(resolveDashboardSection('/dashboard/identity-verification')).toBe('Verification');
    expect(resolveDashboardSection('/dashboard/time-tracking')).toBe('Time Tracking');
    expect(resolveDashboardSection('/dashboard/support-tickets')).toBe('Support Tickets');
  });

  it('prefers the deepest route, so a child never inherits its parent name', () => {
    // /dashboard/services is "Services"; its /create child must not say that.
    expect(resolveDashboardSection('/dashboard/services')).toBe('Services');
    expect(resolveDashboardSection('/dashboard/services/create')).toBe('Create Service');
    // /client/team-projects is "Team Projects"; its child must not say that.
    expect(resolveDashboardSection('/client/team-projects')).toBe('Team Projects');
    expect(resolveDashboardSection('/client/team-projects/create')).toBe('Post a Team Project');
  });

  it('keeps dynamic segments on their parent section', () => {
    expect(resolveDashboardSection('/client/workspace/9f2c-1a')).toBe('Workspace');
    expect(resolveDashboardSection('/client/team-projects/abc')).toBe('Team Projects');
  });

  it('ignores query strings and trailing slashes', () => {
    expect(resolveDashboardSection('/client/invites?filter=pending')).toBe('Invites');
    expect(resolveDashboardSection('/client/invites/')).toBe('Invites');
  });

  it('never guesses an unrelated name — an unknown route is derived from the URL', () => {
    expect(resolveDashboardSection('/client/brand-new-launch-page')).toBe('Brand New Launch Page');
    expect(resolveDashboardSection('/dashboard/some/future-tool')).toBe('Future Tool');
  });

  it('the bare role roots stay "Overview"', () => {
    expect(resolveDashboardSection('/client')).toBe('Overview');
    expect(resolveDashboardSection('/dashboard')).toBe('Overview');
    expect(resolveDashboardSection('/')).toBe('Overview');
  });

  it('only the Workspace route is ever called "Workspace"', () => {
    // Negative control for the exact defect: scan every route in the map and
    // prove the label appears for /workspace routes and nothing else.
    const workspaceOwners = [
      ...CLIENT_LINKS.map((l) => l.path),
      '/client/post',
      '/client/team-projects/create',
      '/client/verification',
      '/dashboard/services/create',
      '/dashboard/profile',
      '/dashboard/wallet',
    ].filter((p) => resolveDashboardSection(p, CLIENT_LINKS) === 'Workspace');

    expect(workspaceOwners).toEqual(['/client/workspace']);
  });
});

describe('the shells actually use the resolver', () => {
  it.each(['src/layouts/DashboardLayout.tsx', 'src/layouts/ClientDashboardLayout.tsx'])(
    '%s resolves the header name instead of hardcoding one',
    (rel) => {
      const source = read(rel);
      expect(source).toContain("from '../lib/dashboardSection'");
      expect(source).toContain('resolveDashboardSection(currentPath, [');
      // The old fallback was the bug: a route with no sidebar link was labelled
      // "Workspace" no matter what it was.
      expect(source).not.toMatch(/\?\s*'Overview'\s*:\s*\(.*\?\?\s*'Workspace'/);
      expect(source).not.toContain("?.label || 'Workspace'");
    }
  );

  it.each(['src/layouts/DashboardLayout.tsx', 'src/layouts/ClientDashboardLayout.tsx'])(
    '%s feeds every navigation group into the resolver',
    (rel) => {
      const source = read(rel);
      // sidebarGroups alone was the cause; account + support links matter too
      // (Verification, Wallet, Support Tickets, Help Center, Disputes).
      //
      // Deferred modules (contests, certificates) are filtered out of the
      // sidebar, so the resolver receives the FILTERED list. The invariant is
      // unchanged: it must still be the sidebar groups plus account + support,
      // and the filtered list must still be derived from `sidebarGroups`.
      expect(source).toContain('...visibleSidebarGroups.flatMap((group) => group.links)');
      expect(source).toMatch(/visibleSidebarGroups:\s*SidebarGroup\[\]\s*=\s*sidebarGroups/);
      expect(source).toContain('isDeferredRoute');
      expect(source).toContain('...accountLinks');
      expect(source).toContain('...supportLinks');
    }
  );
});
