// This file runs only on the client side (not during SSR).
// It contains side effects that require browser APIs.

// ─── Recover from a stale page shell instead of hanging ───────
// A tab that is still open across a deploy (or one that got a cached HTML
// shell) asks for a chunk hash the new build no longer ships. The SPA rewrite
// answers that request with index.html, the browser rejects it as a module,
// and the lazy route's import never settles — the section shows its skeleton
// forever, looking exactly like an infinite load. Nothing in the app can render
// that route, but the page CAN reload into the matching HTML + assets.
//
// Bounded to one attempt per minute so a genuinely broken build cannot turn
// into a reload loop (the user still sees the app, not a flashing tab).
if (typeof window !== 'undefined') {
  const RELOAD_AT_KEY = 'growlanzo:chunk-reload-at';
  const ONE_MINUTE = 60_000;

  const recoverFromStaleChunk = (): boolean => {
    try {
      const last = Number(window.sessionStorage.getItem(RELOAD_AT_KEY) || 0);
      if (Date.now() - last < ONE_MINUTE) return false;
      window.sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    } catch {
      // Storage blocked (private mode) — still worth the single reload.
    }
    window.location.reload();
    return true;
  };

  // Vite's own signal for a failed dynamic import / modulepreload.
  window.addEventListener('vite:preloadError', (event) => {
    const preloadEvent = event as Event & { preventDefault: () => void };
    if (recoverFromStaleChunk()) preloadEvent.preventDefault();
  });

  // Browsers report a module whose response was HTML (the SPA fallback) here.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as { message?: string } | string | undefined;
    const message = String(
      (typeof reason === 'string' ? reason : reason?.message) || '',
    );
    if (
      !/failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed/i.test(
        message,
      )
    ) {
      return;
    }
    event.preventDefault();
    recoverFromStaleChunk();
  });
}

// ─── Deferred Sentry initialization ─────────────────────────
// Sentry loading is deferred to after first paint (saves ~40KB gzipped from critical path)
if (typeof window !== 'undefined') {
  // These pages are PRERENDERED, so this module can hydrate AFTER the load
  // event has already fired. Adding a `load` listener then does nothing at all
  // — the callback never runs, and (measured 2026-10-29) neither Sentry nor the
  // service worker was ever initialising on a fast load. Run immediately when
  // the document is already complete, and wait for `load` only when it is not.
  const onWindowLoad = (fn: () => void) => {
    if (document.readyState === 'complete') fn();
    else window.addEventListener('load', fn, { once: true });
  };

  const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (SENTRY_DSN && SENTRY_DSN.startsWith('https://')) {
    onWindowLoad(() => {
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
    onWindowLoad(() => {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          // A worker that changed on the server should take over on the next
          // load instead of waiting for every tab to close — otherwise a user
          // keeps a shell from an older deploy for days.
          registration.update().catch(() => {
            // Offline or blocked — the installed worker keeps serving.
          });
        },
        (error) => {
          console.warn('[SW] Registration failed:', error);
        },
      );
    });
  }
}
