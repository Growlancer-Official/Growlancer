import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { ConsentGatedAnalytics } from '../src/components/ConsentGatedAnalytics';
import { usePageContext } from 'vike-react/usePageContext';

// ─── CSS ──────────────────────────────────────────────────
// Import global Tailwind styles so they're included in the bundle
import '../src/styles/globals.css';

export default function Layout({ children }: { children: React.ReactNode }) {
  const pageContext = usePageContext();

  // On the client, BrowserRouter handles navigation.
  // On the server, StaticRouter renders with Vike-provided URL (correct SSR pattern).
  const router =
    typeof window !== 'undefined' ? (
      <BrowserRouter>{children}</BrowserRouter>
    ) : (
      <StaticRouter location={pageContext.urlPathname}>
        {children}
      </StaticRouter>
    );

  return (
    <ErrorBoundary>
      {router}
      {/* Vercel Analytics/SpeedInsights — production only (no 404s in dev) AND
          only once the visitor has actually allowed optional analytics. */}
      <ConsentGatedAnalytics enabled={import.meta.env.PROD} />
    </ErrorBoundary>
  );
}
