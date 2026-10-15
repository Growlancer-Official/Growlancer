<<<<<<< HEAD
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CountrySelect } from '../components/CountrySelect';
import { ToastProvider } from '../components/Toast';
=======
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CountrySelect } from '../components/CountrySelect';
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803

/**
 * Locks the onboarding country contract (founder directive, task 2):
 *
<<<<<<< HEAD
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

=======
 * - India is the BASE (pinned first) and the ONLY available country.
 * - Every other country is browsable A→Z under "Coming Soon", labelled per
 *   row, but display-only — clicking or pressing Enter on one must never
 *   call onChange (availability is not a free pick; the platform is
 *   India-first and the DB only normalizes real availability).
 * - "Remote / Online" stays a work mode, not a country.
 *
 * The list comes back from `useCountries` already A→Z (server order + the
 * hook's own sort), so the mock delivers it in that shape and the test
 * asserts the DOM preserves it.
 */
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
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

<<<<<<< HEAD
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
=======
function renderSelect(value = '') {
  const onChange = vi.fn();
  render(<CountrySelect value={value} onChange={onChange} />);
  // The trigger shows the placeholder with no value, the stored country
  // otherwise; either way clicking it opens the dropdown.
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
  const triggerName = value ? new RegExp(value, 'i') : /search for your country/i;
  fireEvent.click(screen.getByRole('button', { name: triggerName }));
  return { onChange };
}

<<<<<<< HEAD
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
=======
describe('CountrySelect — India is the only available country', () => {
  afterEach(cleanup);

  it('pins India first under "Currently Available" with an AVAILABLE badge', () => {
    renderSelect();
    // Regex: the header text carries the 🇮🇳 flag before the words.
    expect(screen.getByText(/Currently Available/)).toBeTruthy();
    const india = screen.getByRole('button', { name: /india/i });
    expect(india.textContent).toContain('AVAILABLE');
    // India sits above the Coming Soon section.
    const order = screen.getAllByRole('button').map(b => b.textContent || '');
    const indiaIdx = order.findIndex(t => t.includes('India'));
    const nepalIdx = order.findIndex(t => t.includes('Nepal'));
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
    expect(indiaIdx).toBeGreaterThanOrEqual(0);
    expect(indiaIdx).toBeLessThan(nepalIdx);
  });

<<<<<<< HEAD
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
=======
  it('lists the remaining countries A→Z under a "Coming Soon" header, each labelled', () => {
    renderSelect();
    // The phrase appears as the section header AND on every row badge; the
    // header is the instance that sits outside any button.
    const header = screen.getAllByText('Coming Soon').find(el => !el.closest('button'));
    expect(header, 'section header missing').toBeTruthy();
    const names = ['Nepal', 'United States', 'Zambia'];
    const texts = screen.getAllByRole('button').map(b => b.textContent || '');
    const idxs = names.map(n => texts.findIndex(t => t.includes(n)));
    idxs.forEach(i => expect(i).toBeGreaterThan(0));
    // A→Z: Nepal < United States < Zambia
    expect(idxs[0]).toBeLessThan(idxs[1]);
    expect(idxs[1]).toBeLessThan(idxs[2]);
    // Every coming-soon row carries its own badge.
    const nepal = screen.getByRole('button', { name: /nepal/i });
    expect(nepal.textContent).toContain('Coming Soon');
    expect(nepal.getAttribute('aria-disabled')).toBe('true');
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
  });

  it('selecting India works', () => {
    const { onChange } = renderSelect();
<<<<<<< HEAD
    fireEvent.click(screen.getByRole('button', { name: /India/ }));
=======
    fireEvent.click(screen.getByRole('button', { name: /india/i }));
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('India');
  });

<<<<<<< HEAD
  it('a coming-soon country is NOT selectable by click — it joins the waitlist instead', async () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /Nepal/ }));
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(mockJoinCountryWaitlist).toHaveBeenCalledWith('Nepal'));
=======
  it('a coming-soon country is NOT selectable by click', () => {
    const { onChange } = renderSelect();
    const nepal = screen.getByRole('button', { name: /nepal/i });
    fireEvent.click(nepal);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('a coming-soon country is NOT selectable by keyboard (Enter)', () => {
    const { onChange } = renderSelect();
    const input = screen.getByPlaceholderText('Search countries...');
    // idx 0 = Remote, 1 = India, 2 = Nepal (first coming-soon row).
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
  });

  it('keyboard Enter still selects India', () => {
    const { onChange } = renderSelect();
<<<<<<< HEAD
    const input = screen.getByPlaceholderText('Search 190+ countries...');
=======
    const input = screen.getByPlaceholderText('Search countries...');
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 0 = Remote → 1 = India
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('India');
  });

<<<<<<< HEAD
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

=======
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
  it('keeps "Remote / Online" as a selectable work mode', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /remote \/ online/i }));
    expect(onChange).toHaveBeenCalledWith('Remote');
  });

<<<<<<< HEAD
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
=======
  it('shows a stored value even when it is a coming-soon country (legacy data)', () => {
    const { onChange } = renderSelect('United States');
    // Trigger shows the stored country; the list still refuses new picks.
    expect(screen.getAllByText('United States').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /zambia/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
>>>>>>> 932659bfb95478161315d2c0570f03d716ff5803
