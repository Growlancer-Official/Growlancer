import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { hasConsent, subscribeConsent } from '../lib/consent';

// ────────────────────────────────────────────────────────────────────────────
// ConsentGatedAnalytics
//
// Vercel Analytics + Speed Insights used to be mounted unconditionally in
// production (`import.meta.env.PROD && <Analytics />`), which meant two
// optional measurement scripts started on the very first page view — before the
// visitor had been asked anything. A banner that says "off unless you allow it"
// has to be true at the network layer, not just in the copy.
//
// This mounts them only when `analytics` consent is actually stored, and reacts
// immediately when the visitor changes their mind (allow → scripts start;
// reject → they stop being rendered on the next route).
//
// SSR-safe: consent lives in localStorage, which does not exist on the server.
// Rendering nothing until after mount keeps the server HTML and the first client
// render identical (no hydration mismatch).
// ────────────────────────────────────────────────────────────────────────────

export function ConsentGatedAnalytics({ enabled }: { enabled: boolean }) {
  const [mounted, setMounted] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    setMounted(true);
    setAllowed(hasConsent('analytics'));
    return subscribeConsent(() => setAllowed(hasConsent('analytics')));
  }, []);

  if (!enabled || !mounted || !allowed) return null;

  return (
    <>
      <Analytics />
      <SpeedInsights />
    </>
  );
}
