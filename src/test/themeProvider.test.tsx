import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { ThemeToggle } from '../components/ThemeToggle';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

/**
 * Dark theme.
 *
 * The requirement is that a visitor whose system prefers dark gets a properly
 * themed site. Two halves have to agree for that to be true:
 *   1. the pre-paint guard paints the right theme before React boots (no light
 *      flash) — injected into every built page's <head> by vite.config.ts,
 *      NOT by the repo-root index.html, which Vike never serves (measured: the
 *      built HTML carries none of its markers). This file used to assert the
 *      guard lived in index.html, i.e. it locked in a guard that never ran.
 *   2. ThemeProvider owns the live state afterwards
 * so this file tests both, plus the shared storage key they must not drift on,
 * plus the hydration contract (the first render cannot depend on the theme).
 */

const STORAGE_KEY = 'growlancer-theme';

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addEventListener: (_type: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_type: string, cb: () => void) => listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => false,
  };
  window.matchMedia = vi.fn().mockImplementation(() => mql) as unknown as typeof window.matchMedia;
  return { listeners, mql };
}

function Probe() {
  const { preference, resolved, cyclePreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="resolved">{resolved}</span>
      <button onClick={cyclePreference}>cycle</button>
    </div>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove('dark');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(cleanup);

  it('follows the system preference by default', async () => {
    stubMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('resolved').textContent).toBe('dark'));
    expect(screen.getByTestId('preference').textContent).toBe('system');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('stays light when the system does not prefer dark', async () => {
    stubMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('resolved').textContent).toBe('light'));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('honours a saved explicit preference over the system', async () => {
    stubMatchMedia(false);
    localStorage.setItem(STORAGE_KEY, 'dark');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('resolved').textContent).toBe('dark'));
    expect(screen.getByTestId('preference').textContent).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('cycles light → dark → system and persists each step', async () => {
    stubMatchMedia(false);
    localStorage.setItem(STORAGE_KEY, 'light');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('resolved').textContent).toBe('light'));

    fireEvent.click(screen.getByRole('button', { name: 'cycle' }));
    await waitFor(() => expect(screen.getByTestId('preference').textContent).toBe('dark'));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'cycle' }));
    await waitFor(() => expect(screen.getByTestId('preference').textContent).toBe('system'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('system');

    fireEvent.click(screen.getByRole('button', { name: 'cycle' }));
    await waitFor(() => expect(screen.getByTestId('preference').textContent).toBe('light'));
  });

  it('sets color-scheme so native controls render dark too', async () => {
    stubMatchMedia(true);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(document.documentElement.style.colorScheme).toBe('dark'));
  });

  it('agrees with the pre-paint guard that actually ships on the storage key', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const viteConfig = readFileSync(path.join(root, 'vite.config.ts'), 'utf8');
    // The guard runs before React; a different key here would mean the first
    // paint and the live state disagree (dark flash for saved-light users).
    // It is injected by the boot-splash plugin — index.html is not the served
    // document, so a copy there would never reach a browser.
    expect(viteConfig).toContain('THEME_FOUC_GUARD');
    expect(viteConfig).toContain(STORAGE_KEY);
    expect(viteConfig).toContain('prefers-color-scheme: dark');
    expect(viteConfig).toContain("classList.add('dark')");
  });

  it('renders the SAME markup for a dark and a light preference on first render', () => {
    // Measured on the built site: a saved-dark visitor hydrated a different tree
    // than the server had rendered (server cannot read localStorage), and React
    // threw error #418 on every load. The first render must therefore be
    // preference-independent — and this asserts it without a browser: whatever
    // the stored value is, renderToString must produce identical HTML.
    const firstRenderWith = (stored: string) => {
      window.localStorage.setItem(STORAGE_KEY, stored);
      return renderToString(
        <ThemeProvider>
          <ThemeToggle />
        </ThemeProvider>,
      );
    };
    const dark = firstRenderWith('dark');
    const light = firstRenderWith('light');
    expect(dark).toBe(light);
    // ...and that shared markup is the neutral/system state, not a guess.
    expect(dark).toContain('System theme');
  });
});
