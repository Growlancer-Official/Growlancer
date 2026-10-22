import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ReferralInviteCard } from '../components/ReferralInviteCard';
import { ToastProvider } from '../components/Toast';

const CODE = 'GRW-7K2M-9QXT';
const LINK = `https://growlanzo.com/signup?ref=${CODE}`;

function renderCard(overrides: Partial<React.ComponentProps<typeof ReferralInviteCard>> = {}) {
  return render(
    <ToastProvider>
      <ReferralInviteCard code={CODE} link={LINK} name="Aarav Mehta" role="freelancer" live {...overrides} />
    </ToastProvider>
  );
}

describe('ReferralInviteCard', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const open = vi.fn();

  beforeEach(() => {
    writeText.mockClear();
    open.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    vi.spyOn(window, 'open').mockImplementation(open as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the formatted code', () => {
    renderCard();
    expect(screen.getByText(CODE)).toBeTruthy();
  });

  it('copy code copies ONLY the code, never the link', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /copy code/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(CODE));
    expect(writeText).not.toHaveBeenCalledWith(LINK);
    await screen.findByRole('button', { name: /code copied/i });
  });

  it('copy invite link copies the tracked signup URL', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /copy invite link/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(LINK));
    await screen.findByRole('button', { name: /link copied/i });
  });

  it('offers a separate share action with the branded card', () => {
    renderCard();
    expect(screen.getByRole('button', { name: /share with invite card/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /download the growlanzo invite card/i })
    ).toBeTruthy();
  });

  it('opens the professional WhatsApp intent with the code', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /share your growlanzo invite on whatsapp/i }));

    expect(open).toHaveBeenCalledTimes(1);
    const url = String(open.mock.calls[0][0]);
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain(CODE);
    expect(decodeURIComponent(url)).toContain(LINK);
  });

  it('previews the professional message without emoji', () => {
    renderCard();
    fireEvent.click(screen.getByText(/preview the message people receive/i));
    const preview = screen.getByText(/you're invited to growlanzo\./i).textContent || '';
    expect(preview).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
    expect(preview).toContain('Invite from Aarav Mehta.');
  });

  it('disables the actions until a code exists', () => {
    renderCard({ code: '' });
    expect(
      (screen.getByRole('button', { name: /copy code/i }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it('marks itself live only when the realtime channel is connected', () => {
    const { unmount } = renderCard({ live: true });
    expect(screen.getByText(/^live$/i)).toBeTruthy();
    unmount();
    cleanup();
    renderCard({ live: false });
    expect(screen.getByText(/^syncing$/i)).toBeTruthy();
  });
});
