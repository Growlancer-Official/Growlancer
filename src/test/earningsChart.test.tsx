import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { EarningsChart } from '../components/EarningsChart';

/**
 * The freelancer earnings chart.
 *
 * It is a hand-built SVG, so most of it cannot be asserted structurally. What
 * must hold regardless of the drawing:
 *   - the numbers are rendered (summary + an accessible list, since a map is
 *     useless to a screen reader)
 *   - an empty period says so instead of drawing a broken frame
 *   - a zero-earnings period still renders (not an empty box)
 *
 * Amounts come from useCurrency(); with no provider it falls back to INR, which
 * is the documented default.
 */

const DATA = [
  { month: '2026-05', amount: 0 },
  { month: '2026-06', amount: 5000 },
  { month: '2026-07', amount: 12000 },
  { month: '2026-08', amount: 3000 },
];

describe('EarningsChart', () => {
  afterEach(cleanup);

  it('shows a waiting state with no data instead of an empty chart frame', () => {
    render(<EarningsChart data={[]} />);
    expect(screen.getByText(/waiting for earnings data/i)).toBeTruthy();
  });

  it('renders the total, monthly average and best month', () => {
    render(<EarningsChart data={DATA} />);
    // total = 20000, average = 5000, best = 12000
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('₹20,000')).toBeTruthy();
    expect(screen.getByText('Monthly average')).toBeTruthy();
    expect(screen.getByText('₹5,000')).toBeTruthy();
    expect(screen.getByText('Best month')).toBeTruthy();
    expect(screen.getByText('₹12,000')).toBeTruthy();
  });

  it('exposes every month as accessible text (a chart image alone is not enough)', () => {
    render(<EarningsChart data={DATA} />);
    const list = document.querySelector('ul.sr-only');
    expect(list).toBeTruthy();
    const items = list!.querySelectorAll('li');
    expect(items).toHaveLength(DATA.length);
    expect(items[0].textContent).toContain('₹0');
    expect(items[2].textContent).toContain('₹12,000');
  });

  it('labels the chart for assistive tech', () => {
    render(<EarningsChart data={DATA} />);
    const svg = document.querySelector('svg[role="img"]');
    expect(svg).toBeTruthy();
    expect(svg!.getAttribute('aria-label')).toMatch(/Total ₹20,000/);
  });

  it('still renders a period where nothing was earned yet', () => {
    render(<EarningsChart data={[{ month: '2026-09', amount: 0 }]} />);
    expect(screen.queryByText(/waiting for earnings data/i)).toBeNull();
    // The axis and the month label must still be there, not a blank frame.
    expect(document.querySelector('svg[role="img"]')).toBeTruthy();
  });

  it('reports the change against the previous month', () => {
    render(<EarningsChart data={DATA} />);
    // last month 3000 vs previous 12000 → down 75%
    expect(screen.getByText('-75.0%')).toBeTruthy();
  });
});
