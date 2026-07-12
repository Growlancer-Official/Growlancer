// This file runs only on the client side (not during SSR).
// It contains side effects that require browser APIs.

// ─── Deferred Sentry initialization ─────────────────────────
// Sentry loading is deferred to after first paint (saves ~40KB gzipped from critical path)
if (typeof window !== 'undefined') {
  const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (SENTRY_DSN && SENTRY_DSN.startsWith('https://')) {
    window.addEventListener('load', () => {
      const start = () => {
        import('@sentry/react')
          .then((Sentry) => {
            Sentry.init({
              dsn: SENTRY_DSN,
              environment: 'production',
              release: `growlancer@${(import.meta.env.VITE_APP_VERSION as string) || '1.0.0'}`,
              integrations: [
                Sentry.browserTracingIntegration(),
                Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true }),
              ],
              tracesSampleRate: 0.1,
              replaysSessionSampleRate: 0.1,
              replaysOnErrorSampleRate: 1.0,
            });
          })
          .catch(() => {
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

  // ─── Progressive Web App: Service Worker Registration ─────
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(
        () => {
          // Service worker registered successfully
        },
        (error) => {
          console.warn('[SW] Registration failed:', error);
        },
      );
    });
  }
}
