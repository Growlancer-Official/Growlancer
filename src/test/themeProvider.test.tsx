import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

/**
 * Dark theme.
 *
 * The requirement is that a visitor whose system prefers dark gets a properly
 * themed site. Two halves have to agree for that to be true:
 *   1. index.html paints the right theme before React boots (no light flash)
 *   2. ThemeProvider owns the live state afterwards
 * so this file tests both, plus the shared storage key they must not drift on.
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

  it('agrees with the index.html FOUC guard on the storage key', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    // The inline script runs before React; a different key here would mean the
    // first paint and the live state disagree (dark flash for saved-light users).
    expect(html).toContain(STORAGE_KEY);
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain("classList.add('dark')");
  });
});
