import React from 'react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { usePageContext } from 'vike-react/usePageContext';

// ─── CSS ──────────────────────────────────────────────────
// Import global Tailwind styles so they're included in the bundle
import '../src/styles/globals.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  const pageContext = usePageContext();

  // On the server, use MemoryRouter with Vike-provided URL.
  // On the client, BrowserRouter handles navigation.
  const router =
    typeof window !== 'undefined' ? (
      <BrowserRouter>{children}</BrowserRouter>
    ) : (
      <MemoryRouter initialEntries={[pageContext.urlPathname]}>
        {children}
      </MemoryRouter>
    );

  return (
    <ErrorBoundary>
      {router}
      <Analytics />
      <SpeedInsights />
    </ErrorBoundary>
  );
}
