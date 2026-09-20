import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CookieConsent } from '../components/CookieConsent';

// The banner links to /privacy and /cookies, so it needs a router context.
const renderBanner = () =>
  render(
    <MemoryRouter>
      <CookieConsent />
    </MemoryRouter>
  );

// The banner is fixed to the bottom of the viewport. On dashboard/client routes
// that buried the full-height sidebar's Homepage / Logout actions until the
// visitor answered it. The component publishes its measured height as
// `--consent-banner-h` and the two sidebars subtract it from 100vh, so these
// assertions lock the contract between the two: set while the banner is up,
// removed as soon as it is answered.

// jsdom has no ResizeObserver; the banner observes itself so a reflow (the action
// buttons wrapping on narrow screens) updates the reserved height.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const BANNER_VAR = '--consent-banner-h';

describe('CookieConsent reserves space for full-height sidebars', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty(BANNER_VAR);
  });

  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty(BANNER_VAR);
  });

  it('publishes --consent-banner-h once the banner is visible', async () => {
    vi.useFakeTimers();
    renderBanner();

    // The banner waits 600ms before appearing so the page can render first.
    expect(document.documentElement.style.getPropertyValue(BANNER_VAR)).toBe('');

    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    // The banner's own action button proves it is on screen.
    expect(screen.getByRole('button', { name: /accept all/i })).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue(BANNER_VAR)).not.toBe('');
    vi.useRealTimers();
  });

  it('clears the reserved height once consent is given', async () => {
    vi.useFakeTimers();
    renderBanner();

    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(document.documentElement.style.getPropertyValue(BANNER_VAR)).not.toBe('');

    const accept = screen.getByRole('button', { name: /accept all/i });
    await act(async () => {
      fireEvent.click(accept);
      vi.advanceTimersByTime(1000);
    });

    // Sidebars go back to a full 100vh — no leftover space from a dismissed banner.
    expect(document.documentElement.style.getPropertyValue(BANNER_VAR)).toBe('');
    vi.useRealTimers();
  });

  it('reserves nothing when consent was already stored', async () => {
    // Shape mirrors saveConsent(): flat prefs plus the numeric version.
    localStorage.setItem(
      'growlancer_consent',
      JSON.stringify({
        necessary: true,
        functional: true,
        analytics: true,
        marketing: true,
        version: 1,
        timestamp: new Date().toISOString(),
      })
    );

    vi.useFakeTimers();
    renderBanner();
    await act(async () => {
      vi.advanceTimersByTime(700);
    });

    expect(document.documentElement.style.getPropertyValue(BANNER_VAR)).toBe('');
    vi.useRealTimers();
  });
});
