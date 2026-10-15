import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';

// MainLayout reads auth state for the header CTA; a stub keeps this test
// focused on the mobile-menu Escape behavior without a real Supabase client.
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: false, role: null, user: null }),
}));

// MainLayout renders the Outlet for routed content; a stub keeps the test focused
// on the header + mobile menu shell.
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, Outlet: () => <div data-testid="outlet-stub" /> };
});

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <MainLayout />
    </MemoryRouter>
  );
}

describe('MainLayout mobile menu Escape-close (Section-1G)', () => {
  afterEach(cleanup);

  it('closes the mobile menu when Escape is pressed', () => {
    renderLayout();

    const openBtn = screen.getByRole('button', { name: 'Open menu' });
    fireEvent.click(openBtn);
    expect(screen.getByRole('button', { name: 'Close menu' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close menu' })).not.toBeInTheDocument();
  });

  it('does not interfere with Escape when the menu is closed', () => {
    renderLayout();
    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.getByRole('button', { name: 'Open menu' })).toBeInTheDocument();
  });
});
