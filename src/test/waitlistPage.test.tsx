import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WaitlistPage } from '../pages/WaitlistPage';

// Mock the Supabase client (edge-function invoke) — unit tests must never make
// live network calls.
vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

// Mock the router hook (the page navigates home on success).
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

import { supabase } from '../lib/supabase';

const invokeMock = supabase.functions.invoke as unknown as ReturnType<typeof vi.fn>;

function renderPage() {
  return render(
    <MemoryRouter>
      <WaitlistPage />
    </MemoryRouter>
  );
}

const TYPE_EMAIL = /email address/i;
const SUBMIT = /notify me at launch/i;

describe('WaitlistPage (non-India visitor waitlist)', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('does NOT show the success message before any subscribe action (regression: old page hardcoded a fake waitlist success)', () => {
    renderPage();
    expect(screen.queryByText(/you're on the waitlist/i)).toBeNull();
    expect(screen.getByLabelText(TYPE_EMAIL)).toBeTruthy();
    expect(screen.getByRole('button', { name: SUBMIT })).toBeTruthy();
  });

  it('shows a specific error for an empty submit', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(screen.getByRole('alert')).toHaveTextContent(/email is required/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('shows a specific error for a malformed email', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(TYPE_EMAIL), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('rejects disposable email domains client-side', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(TYPE_EMAIL), { target: { value: 'test@mailinator.com' } });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    expect(screen.getByRole('alert')).toHaveTextContent(/disposable/i);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('shows the truthful success state only after the edge function succeeds', async () => {
    invokeMock.mockResolvedValueOnce({ data: { success: true }, error: null });
    renderPage();
    fireEvent.change(screen.getByLabelText(TYPE_EMAIL), { target: { value: 'rahul@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(screen.getByText(/you're on the waitlist/i)).toBeTruthy());
    expect(screen.getByText(/rahul@example\.com/i)).toBeTruthy();
  });

  it('surfaces the server error message when the edge function rejects (e.g. duplicate/disposable server-side)', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'Already subscribed' }) } },
    });
    renderPage();
    fireEvent.change(screen.getByLabelText(TYPE_EMAIL), { target: { value: 'dupe@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/already subscribed/i));
  });

  it('disables the submit button and shows a spinner while submitting (double-submit guard)', async () => {
    let resolveFn: (v: unknown) => void = () => {};
    invokeMock.mockReturnValueOnce(new Promise((res) => { resolveFn = res; }));
    renderPage();
    fireEvent.change(screen.getByLabelText(TYPE_EMAIL), { target: { value: 'slow@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
    const btn = await screen.findByRole('button', { name: /joining/i });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    resolveFn({ data: { success: true }, error: null });
    await waitFor(() => expect(screen.getByText(/you're on the waitlist/i)).toBeTruthy());
  });
});
