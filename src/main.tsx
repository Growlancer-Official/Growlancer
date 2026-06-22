import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './app/App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles/globals.css';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);

// ─── Progressive Web App: Service Worker Registration ──────────────────────
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        // Service worker registered successfully
      },
      (error) => {
        console.warn('[SW] Registration failed:', error);
      }
    );
  });
}
