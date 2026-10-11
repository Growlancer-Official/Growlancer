import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CountrySelect } from '../components/CountrySelect';

/**
 * Locks the onboarding country contract (founder directive, task 2):
 *
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

function renderSelect(value = '') {
  const onChange = vi.fn();
  render(<CountrySelect value={value} onChange={onChange} />);
  // The trigger shows the placeholder with no value, the stored country
  // otherwise; either way clicking it opens the dropdown.
  const triggerName = value ? new RegExp(value, 'i') : /search for your country/i;
  fireEvent.click(screen.getByRole('button', { name: triggerName }));
  return { onChange };
}

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
    expect(indiaIdx).toBeGreaterThanOrEqual(0);
    expect(indiaIdx).toBeLessThan(nepalIdx);
  });

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
  });

  it('selecting India works', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /india/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('India');
  });

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
  });

  it('keyboard Enter still selects India', () => {
    const { onChange } = renderSelect();
    const input = screen.getByPlaceholderText('Search countries...');
    fireEvent.keyDown(input, { key: 'ArrowDown' }); // 0 = Remote → 1 = India
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('India');
  });

  it('keeps "Remote / Online" as a selectable work mode', () => {
    const { onChange } = renderSelect();
    fireEvent.click(screen.getByRole('button', { name: /remote \/ online/i }));
    expect(onChange).toHaveBeenCalledWith('Remote');
  });

  it('shows a stored value even when it is a coming-soon country (legacy data)', () => {
    const { onChange } = renderSelect('United States');
    // Trigger shows the stored country; the list still refuses new picks.
    expect(screen.getAllByText('United States').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /zambia/i }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
