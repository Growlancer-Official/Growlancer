import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
        <Analytics />
        <SpeedInsights />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// ─── Deferred: Sentry initializes after first paint (non-critical — ~40KB gzipped) ──────
if (!import.meta.env.DEV) {
  const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
  if (SENTRY_DSN && SENTRY_DSN.startsWith('https://')) {
    window.addEventListener('load', () => {
      const start = () => {
        import('@sentry/react').then((Sentry) => {
          Sentry.init({
            dsn: SENTRY_DSN,
            environment: 'production',
            release: `growlancer@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
            integrations: [
              Sentry.browserTracingIntegration(),
              Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
            ],
            tracesSampleRate: 0.1,
            replaysSessionSampleRate: 0.1,
            replaysOnErrorSampleRate: 1.0,
          });
        }).catch(() => {
          // Sentry failed to load — non-critical
        });
      };
      if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(start, { timeout: 3000 });
      } else {
        setTimeout(start, 2000);
      }
    });
  }
}

// ─── Progressive Web App: Service Worker Registration ──────────────────────
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      () => {
        // Service worker registered successfully
      },
      (error) => {
        console.warn('[SW] Registration failed:', error);
      }
    );
  });
}
