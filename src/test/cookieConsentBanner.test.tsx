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

  it('leads with the approved copy', async () => {
    await showNotice();
    // The heading is the playful "we ate your cookies" line; the required
    // sentence is carried directly beneath it as the promise.
    expect(screen.getByRole('heading', { name: /we ate your cookies/i })).toBeTruthy();
    expect(document.body.textContent).toContain('For a better experience.');
  });

  it('explains necessary vs optional storage and promises nothing it does not do', async () => {
    await showNotice();
    const text = document.body.textContent || '';
    expect(text).toMatch(/sign-in and security storage stays on/i);
    expect(text).toMatch(/nothing optional runs unless you allow it/i);
    expect(text).toMatch(/no advertising or cross-site tracking/i);
    // Nothing in the product implements advertising/retargeting, so the notice
    // must not present it as a category the visitor is opting into.
    expect(text).not.toMatch(/personalized advertisements/i);
  });

  it('offers the accept, reject, manage and close actions', async () => {
    await showNotice();
    expect(screen.getByRole('button', { name: /^accept all$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^reject optional$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^manage$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /close — reject optional cookies/i })).toBeTruthy();
  });

  it('accept all records analytics consent and dismisses', async () => {
    await showNotice();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^accept all$/i }));
      vi.advanceTimersByTime(400);
    });

    expect(storedConsent()?.analytics).toBe(true);
    expect(readConsent()?.analytics).toBe(true);
    expect(screen.queryByRole('heading', { name: /we ate your cookies/i })).toBeNull();
  });

  it('reject optional keeps analytics off and still remembers the answer', async () => {
    await showNotice();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^reject optional$/i }));
      vi.advanceTimersByTime(400);
    });

    expect(storedConsent()?.analytics).toBe(false);
    expect(storedConsent()?.necessary).toBe(true);
    expect(screen.queryByRole('heading', { name: /we ate your cookies/i })).toBeNull();
  });

  it('the cross dismisses AND keeps optional storage off', async () => {
    // A dismissed box must never be readable as consent, so the close button
    // takes the same decision as "Reject optional".
    await showNotice();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /close — reject optional cookies/i }));
      vi.advanceTimersByTime(400);
    });

    expect(storedConsent()?.analytics).toBe(false);
    expect(screen.queryByRole('heading', { name: /we ate your cookies/i })).toBeNull();
  });

  it('manage opens a real panel with only the categories that exist', async () => {
    await showNotice();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^manage$/i }));
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
      fireEvent.click(screen.getByRole('button', { name: /^manage$/i }));
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

  it('does not appear again once a decision is stored', async () => {
    localStorage.setItem(
      CONSENT_STORAGE_KEY,
      JSON.stringify({ necessary: true, analytics: false, version: 2, updatedAt: new Date().toISOString() })
    );
    await showNotice();
    expect(screen.queryByRole('heading', { name: /we ate your cookies/i })).toBeNull();
  });

  it('can be reopened later, keeping the stored answer', async () => {
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

  it('closes the panel on Escape', async () => {
    await showNotice();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^manage$/i }));
    });
    expect(screen.getByRole('dialog', { name: /cookie preferences/i })).toBeTruthy();

    await act(async () => {
      fireEvent.keyDown(document, { key: 'Escape' });
    });
    expect(screen.queryByRole('dialog', { name: /cookie preferences/i })).toBeNull();
  });
});
