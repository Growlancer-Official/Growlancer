/**
 * ErrorBoundary unit test — verifies the graceful fallback screen renders
 * (never a white-screen) and the Retry button recovers, per the element-audit
 * Section-1 H requirement ("error-state must never be a blank screen").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '../components/ErrorBoundary';

// Bomb component: throws on every render (simulates a broken child).
function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('E2E deliberate test explosion');
  return <div>child content fine</div>;
}

describe('ErrorBoundary (element-audit shared-component check)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React logs caught errors to console.error — silence for clean output.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('renders children normally when no error occurs', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    expect(screen.getByText('child content fine')).toBeTruthy();
  });

  it('shows the graceful fallback screen (not a white screen) when a child throws', () => {
    const { container } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText(/We encountered an unexpected error/i)).toBeTruthy();
    // Retry affordance must exist.
    const retry = screen.getByRole('button', { name: /retry|try again/i });
    expect(retry).toBeTruthy();
    // Fallback must actually paint visible content — not an empty shell.
    expect(container.textContent!.trim().length).toBeGreaterThan(40);
  });

  it('recovers when Retry is clicked (resets and re-renders children)', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();

    // Parent stops throwing (e.g. upstream data fixed) — Retry must show children again.
    rerender(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));
    expect(screen.getByText('child content fine')).toBeTruthy();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });
});
