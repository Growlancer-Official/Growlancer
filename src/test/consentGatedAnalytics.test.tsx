import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { ConsentGatedAnalytics } from '../components/ConsentGatedAnalytics';
import { clearConsent, writeConsent } from '../lib/consent';

// The point of this component is a network-level promise: "off unless you allow
// it". Marking the modules lets the test assert the scripts are genuinely not
// mounted, not merely hidden.
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => 'vercel-analytics' }));
vi.mock('@vercel/speed-insights/react', () => ({ SpeedInsights: () => 'speed-insights' }));

/** The mocked scripts render as bare text nodes, so read the container. */
const mountedScripts = (container: HTMLElement) => container.textContent || '';

describe('ConsentGatedAnalytics', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('mounts nothing before the visitor has answered', () => {
    const { container } = render(<ConsentGatedAnalytics enabled />);
    expect(mountedScripts(container)).toBe('');
  });

  it('stays off when optional storage was rejected', () => {
    writeConsent(false);
    const { container } = render(<ConsentGatedAnalytics enabled />);
    expect(mountedScripts(container)).toBe('');
  });

  it('mounts both once analytics is allowed', () => {
    writeConsent(true);
    const { container } = render(<ConsentGatedAnalytics enabled />);
    expect(mountedScripts(container)).toContain('vercel-analytics');
    expect(mountedScripts(container)).toContain('speed-insights');
  });

  it('reacts to a change of mind without a reload', async () => {
    const { container } = render(<ConsentGatedAnalytics enabled />);
    expect(mountedScripts(container)).toBe('');

    await act(async () => {
      writeConsent(true);
    });
    expect(mountedScripts(container)).toContain('vercel-analytics');

    await act(async () => {
      clearConsent();
    });
    expect(mountedScripts(container)).toBe('');
  });

  it('never mounts outside production', () => {
    writeConsent(true);
    const { container } = render(<ConsentGatedAnalytics enabled={false} />);
    expect(mountedScripts(container)).toBe('');
  });
});
