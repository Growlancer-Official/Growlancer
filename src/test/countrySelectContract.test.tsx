import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CountrySelect } from '../components/CountrySelect';
import { ToastProvider } from '../components/Toast';

/**
 * Locks the onboarding country contract (founder directive, task 2):
 *
 * - India is the BASE (pinned first, under "Live now") and the ONLY selectable
 *   country.
 * - Every other country is browsable A→Z under "Coming soon" with a live
 *   interest count; tapping one JOINS ITS WAITLIST and must never call onChange
 *   (availability is not a free pick).
 * - Interest counts come from the server aggregate RPC, and a country the user
 *   has already requested shows "On the list" and is not re-submitted.
 * - "Remote / Online" stays a work mode, not a country.
 */

// vi.hoisted keeps the spies and the auth flag above the hoisted vi.mock calls
// (a plain `const` here would be in the temporal dead zone when the factory is
// installed).
const { mockJoinCountryWaitlist, mockFetchCountryInterest, authState } = vi.hoisted(() => ({
  mockJoinCountryWaitlist: vi.fn(),
  mockFetchCountryInterest: vi.fn(),
  authState: { authenticated: true },
}));

vi.mock('../hooks/useCountries', () => ({
  useCountries: () => ({
    countries: [
      { id: 'in', name: 'India', code: 'IN' },
      { id: 'np', name: 'Nepal', code: 'NP' },
      { id: 'us', name: 'United States', code: 'US' },
      { id: 'zm', name: 'Zambia', code: 'ZM' },
    ],
    loading: false,
    refresh: async () => {},
  }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: authState.authenticated }),
}));

vi.mock('../lib/countryWaitlist', () => ({
  fetchCountryInterest: mockFetchCountryInterest,
  joinCountryWaitlist: mockJoinCountryWaitlist,
}));

function renderSelect(value = '') {
  const onChange = vi.fn();
  render(
    <ToastProvider>
      <CountrySelect value={value} onChange={onChange} />
    </ToastProvider>,
  );
  const triggerName = value ? new RegExp(value, 'i') : /search for your country/i;
  fireEvent.click(screen.getByRole('button', { name: triggerName }));
  return { onChange };
}

describe('CountrySelect — India is live, everything else joins a waitlist', () => {
  beforeEach(() => {
    authState.authenticated = true;
    mockFetchCountryInterest.mockResolvedValue([
      { country: 'Nepal', interested: 7, last_joined: null },
      { country: 'Zambia', interested: 1, last_joined: null },
    ]);
    mockJoinCountryWaitlist.mockResolvedValue({ success: true, already_exists: false, country: 'Nepal' });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('pins India first under "Live now" with a SELECT affordance', () => {
    renderSelect();
    expect(screen.getByText('Live now')).toBeTruthy();
    const india = screen.getByRole('button', { name: /India/ });
    expect(india.textContent).toContain('Select');
    const order = screen.getAllByRole('button').map((b) => b.textContent || '');
    const indiaIdx = order.findIndex((t) => t.includes('India'));
    const nepalIdx = order.findIndex((t) => t.includes('Nepal'));
    expect(indiaIdx).toBeGreaterThanOrEqual(0);
    expect(indiaIdx).toBeLessThan(nepalIdx);
  });

  it('lists the remaining countries A→Z under a "Coming soon" header', () => {
    renderSelect();
    const header = screen.getAllByText('Coming soon').find((el) => !el.closest('button'));
    expect(header, 'section header missing').toBeTruthy();

    const texts = screen.getAllByRole('button').map((b) => b.textContent || '');
    const idxs = ['Nepal', 'United States', 'Zambia'].map((n) => texts.findIndex((t) => t.includes(n)));
    idxs.forEach((i) => expect(i).toBeGreaterThan(0));
    // A→Z: Nepal < United States < Zambia
    expect(idxs[0]).toBeLessThan(idxs[1]);
    expect(idxs[1]).toBeLessThan(idxs[2]);
  });

  it('shows the live interest count for a coming-soon country', async () => {
    renderSelect();
    await waitFor(() => expect(screen.getByText('7 people waiting')).toBeTruthy());
    expect(screen.getByText('1 person waiting')).toBeTruthy();
  });

  it('selecting India works', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /India/ }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('India');
  });

  it('a coming-soon country is NOT selectable by click — it joins the waitlist instead', async () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /Nepal/ }));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(mockJoinCountryWaitlist).toHaveBeenCalledWith('Nepal'));
  });

  it('keyboard Enter still selects India', () => {
    const { onChange } = renderSelect();
    const input = screen.getByPlaceholderText('Search 190+ countries...');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 0 = Remote → 1 = India
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('India');
  });

  it('keyboard Enter on a coming-soon row joins the waitlist, never selects', async () => {
    const { onChange } = renderSelect();
    const input = screen.getByPlaceholderText('Search 190+ countries...');
    // 0 = Remote, 1 = India, 2 = Nepal (first coming-soon row)
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(mockJoinCountryWaitlist).toHaveBeenCalledWith('Nepal'));
  });

  it('keeps "Remote / Online" as a selectable work mode', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /remote \/ online/i }));
    expect(onChange).toHaveBeenCalledWith('Remote');
  });

  it('marks a requested country "On the list" and does not submit it twice', async () => {
    renderSelect();
    const nepal = screen.getByRole('button', { name: /Nepal/ });
    fireEvent.click(nepal);
    await waitFor(() => expect(screen.getByText('On the list')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Nepal/ }));
    expect(mockJoinCountryWaitlist).toHaveBeenCalledTimes(1);
    // An idempotent re-tap is a no-op, not an extra submission.
  });

  it('does not call the RPC for a signed-out visitor', () => {
    authState.authenticated = false;
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /Nepal/ }));
    expect(onChange).not.toHaveBeenCalled();
    expect(mockJoinCountryWaitlist).not.toHaveBeenCalled();
  });

  it('surfaces a server refusal instead of pretending success', async () => {
    mockJoinCountryWaitlist.mockResolvedValue({ success: false, error: 'Unknown country' });
    renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /Nepal/ }));
    await waitFor(() =>
      expect(screen.getByText('Could not join waitlist')).toBeTruthy(),
    );
    expect(screen.queryByText('On the list')).toBeNull();
  });

  it('shows a stored value even when it is a coming-soon country (legacy data)', async () => {
    const { onChange } = renderSelect('United States');
    expect(screen.getAllByText('United States').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Nepal/ }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

/**
 * Every country picker in the product must offer the SAME countries in the
 * SAME order. The OAuth country gate used to show a hand-curated seven
 * (US/GB/CA/AU/AE/SG + "Other Country") while onboarding listed all 197 — two
 * different truths about which countries exist, and the gate's ISO codes went
 * into the waitlist as 'US' where onboarding wrote 'United States', splitting
 * the admin's per-country interest chart in two.
 */
describe('the OAuth country gate uses the shared picker, not a shortlist', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const gate = readFileSync(path.join(root, 'src/pages/AuthCallbackPage.tsx'), 'utf8')
    .replace(/\r\n/g, '\n');

  it('renders the shared CountrySelect for every country other than India', () => {
    expect(gate).toContain("from '../components/CountrySelect'");
    expect(gate).toMatch(/<CountrySelect\b[\s\S]*?onPick=/);
  });

  it('has no hand-picked country array and no "Other Country" escape hatch', () => {
    // the old shape: { code: 'US', flag: '🇺🇸', name: 'United States' },
    expect(gate).not.toMatch(/\{\s*code:\s*'[A-Z]{2}'\s*,\s*flag:/);
    expect(gate).not.toContain("code: 'OTHER'");
  });

  it('captures the canonical country NAME, so waitlist rows match onboarding', () => {
    expect(gate).toMatch(/p_country:\s*selectedCountry/);
    expect(gate).not.toMatch(/p_country:\s*'IN'/);
    // and the India branch keys off the same spelling the picker emits
    expect(gate).toContain("selectedCountry === 'India'");
  });
});
