import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CookieConsent } from '../components/CookieConsent';
import {
  CONSENT_STORAGE_KEY,
  openConsentPreferences,
  readConsent,
} from '../lib/consent';

// jsdom has no ResizeObserver; the notice measures itself so full-height
// dashboard sidebars can reserve the exact space it takes.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const renderNotice = () =>
  render(
    <MemoryRouter>
      <CookieConsent />
    </MemoryRouter>
  );

/** The notice waits ~600ms so it never fights the first paint. */
async function showNotice() {
  renderNotice();
  await act(async () => {
    vi.advanceTimersByTime(700);
  });
}

const storedConsent = () => {
  const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
};

describe('Cookie consent notice', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('leads with plain, professional copy', async () => {
    await showNotice();
    expect(screen.getByRole('heading', { name: /^cookies$/i })).toBeTruthy();
    expect(document.body.textContent).toContain('keep you signed in');
  });

  it('states its real scope and promises nothing it does not do', async () => {
    await showNotice();
    const text = document.body.textContent || '';
    expect(text).toMatch(/essential storage/i);
    expect(text).toMatch(/no advertising or cross-site tracking/i);
    // Nothing in the product implements advertising/retargeting, so the notice
    // must not present it as a category the visitor is opting into.
    expect(text).not.toMatch(/personalized advertisements/i);
  });

  it('offers exactly one action: a proper close', async () => {
    await showNotice();
    expect(screen.getByRole('button', { name: /close cookie notice/i })).toBeTruthy();
    // The popup must not ask the visitor to accept/reject/manage anything.
    expect(screen.queryByRole('button', { name: /^accept/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^reject/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^manage$/i })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('the cross records the safe default and dismisses', async () => {
    // Dismissing can never be read as agreement, so it takes the same decision
    // as "Reject optional": necessary only, analytics off.
    await showNotice();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /close cookie notice/i }));
      vi.advanceTimersByTime(400);
    });

    expect(storedConsent()?.analytics).toBe(false);
    expect(storedConsent()?.necessary).toBe(true);
    expect(readConsent()?.analytics).toBe(false);
    expect(screen.queryByRole('heading', { name: /^cookies$/i })).toBeNull();
  });

  it('does not appear again once a decision is stored', async () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ necessary: true, analytics: false, version: 2, updatedAt: new Date().toISOString() })
    );
    await showNotice();
    expect(screen.queryByRole('heading', { name: /^cookies$/i })).toBeNull();
  });

  it('can be reopened later from the footer, keeping the stored answer', async () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ necessary: true, analytics: true, version: 2, updatedAt: new Date().toISOString() })
    );
    await showNotice();
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => {
      openConsentPreferences();
    });

    const dialog = screen.getByRole('dialog', { name: /cookie preferences/i });
    expect(within(dialog).getByRole('switch', { name: /analytics/i }).getAttribute('aria-checked')).toBe('true');
  });

  it('the panel exposes only the categories that exist', async () => {
    await showNotice();
    await act(async () => {
      openConsentPreferences();
    });

    const dialog = screen.getByRole('dialog', { name: /cookie preferences/i });
    expect(within(dialog).getByText(/strictly necessary/i)).toBeTruthy();
    expect(within(dialog).getByRole('switch', { name: /analytics/i })).toBeTruthy();
    // No marketing toggle exists because no marketing code exists.
    expect(within(dialog).queryByText(/marketing/i)).toBeNull();
    expect(within(dialog).queryByText(/functional/i)).toBeNull();
  });

  it('saving a hand-picked choice persists exactly that choice', async () => {
    await showNotice();
    await act(async () => {
      openConsentPreferences();
    });

    const toggle = screen.getByRole('switch', { name: /analytics/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      fireEvent.click(toggle);
    });
    expect(screen.getByRole('switch', { name: /analytics/i }).getAttribute('aria-checked')).toBe('true');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save preferences/i }));
      vi.advanceTimersByTime(400);
    });

    expect(storedConsent()?.analytics).toBe(true);
  });

  it('closes the panel on Escape', async () => {
    await showNotice();
    await act(async () => {
      openConsentPreferences();
    });
    expect(screen.getByRole('dialog', { name: /cookie preferences/i })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: /cookie preferences/i })).toBeNull();
  });
});
