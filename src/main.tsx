import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;

// Only initialize Sentry if DSN is provided (avoids silent error swallowing)
if (SENTRY_DSN && SENTRY_DSN.startsWith('https://')) {
  Sentry.init({
    dsn: SENTRY_DSN,
    enabled: !import.meta.env.DEV,
    environment: import.meta.env.DEV ? 'development' : 'production',
    release: `growlancer@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      return event;
    },
  });
} else if (import.meta.env.PROD) {
  console.warn('[Sentry] VITE_SENTRY_DSN not configured — error monitoring disabled. Set it in production env.');
}

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
