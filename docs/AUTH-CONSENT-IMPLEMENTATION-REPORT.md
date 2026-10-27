# Auth, Session Persistence, Dashboard Redirects & Cookie Consent — Implementation Report

**Project:** Growlanzo · **Date:** 2026-10-27 · **Branch:** `main`

---

## 1. What was inspected before any code changed

`src/context/AuthContext.tsx`, `src/pages/AuthCallbackPage.tsx`, `src/components/LoginModal.tsx`,
`src/components/SignupModal.tsx`, `src/components/ProtectedRoute.tsx`, `src/layouts/MainLayout.tsx`,
`src/lib/authAction.ts`, `src/lib/supabase.ts` (`persistSession`, `detectSessionInUrl`,
`autoRefreshToken`, `flowType: implicit`), `src/components/CookieConsent.tsx`,
`pages/+Head.tsx`, `pages/+Layout.tsx`, `src/pages/CookiesPage.tsx`,
`supabase/migrations/20270119000026_signup_profile_trigger.sql`, and the repo's E2E harness.

No second auth system was introduced. Everything runs on the existing Supabase OAuth
session, route guards and profile/role model.

---

## 2. Root causes found (not guessed)

### RC-1 — Clicking the *other* provider silently created a second account
GoTrue only rejects a sign-in when the email already exists. A LinkedIn account
identified by GitHub with a **different** email (work address, `noreply@<id>@…`) passes
that check, GoTrue creates a second `auth.users` row, and the `on_auth_user_created`
trigger writes an unfinished profile for it. Nothing errored — the person silently landed
in an empty dashboard instead of their own.

The existing provider-mismatch screen could not catch this by construction: it only fires
on a duplicate-email rejection, which is exactly what does not happen here.

### RC-2 — Optional analytics loaded before consent was ever asked for
`pages/+Layout.tsx` mounted `<Analytics />` and `<SpeedInsights />` unconditionally in
production. The banner's promise ("off unless you allow it") was not true at the network
layer. Separately, `hasConsent()` was exported by the banner and **called by nothing**,
and the banner offered a *marketing* category while `src/pages/CookiesPage.tsx` stated
there are no advertising cookies — the banner and the policy contradicted each other.

### RC-3 — A hand-written "critical CSS" block silently disabled responsive layout
`pages/+Head.tsx` injects an inline `<style>` into `<head>` **after** the compiled
stylesheet. It re-declared `.flex-col { flex-direction: column }` with normal specificity,
so by document order it outranked the real utilities: **every** `flex-col sm:flex-row`
element in the app rendered as a column at every width. Measured live at 1440px — the
cookie notice's action buttons stacked vertically even though all three responsive
variants matched.

---

## 3. Changes

### Authentication / session / dashboard routing

| File | Change |
|---|---|
| `src/lib/secondAccountGuard.ts` *(new)* | Detects a *different* identity on the same browser profile (fingerprint must match; unreadable/incoming-empty emails excluded), plus a one-shot, 10-minute-TTL approval so "create a second account" must be an explicit decision. |
| `src/pages/AuthCallbackPage.tsx` | New `second_account` status: destroys the unusable incoming session and asks before continuing — **"Sign in to my existing account"** (named provider) vs **"Create a new account with GitHub/LinkedIn"**. On explicit approval the browser marker is force-updated so the guard never re-questions that sign-in. Runs only for *login* intent (`no savedRole`), an unfinished profile, and no approval. |
| `src/lib/browserIdentity.ts` | Records which provider the account signs in with, so the guard names the real provider instead of guessing "the other one" (a person can hold two GitHub accounts). Backward compatible with old records. |
| `src/context/AuthContext.tsx` | Passes the session's `app_metadata.provider` into the browser record. |

Already correct and deliberately left alone: role-based destination
(`getPostAuthPath`), the single `/onboarding` route, session resume on the Login
action, `?modal=login` deep-link resume, the 24-hour inactivity sign-out, and
server-side role/suspension checks in `ProtectedRoute`.

### Cookie consent

| File | Change |
|---|---|
| `src/lib/consent.ts` *(new)* | Single source of truth. v2 schema with **only two categories**; a v1 record is treated as no decision (the old notice offered a category nothing implements). Storage failure returns `null` so the notice is never dismissed without a saved answer. |
| `src/components/CookieConsent.tsx` | Rewritten: playful compact box — **"We ate your cookies 🍪" / "For a better experience."** with **Reject optional · Manage · Accept all · ✕**. Panel offers *Strictly necessary (always on)* + *Analytics* only. Black `#08110D` surface with emerald accents. `role="dialog"`, `aria-modal`, `aria-labelledby`, initial focus, Tab trap, Escape to close, 44px targets, `role="switch"` toggle. |
| `src/components/ConsentGatedAnalytics.tsx` *(new)* | Mounts Vercel Analytics + Speed Insights **only** when analytics consent is stored, and reacts to changes. SSR-safe (renders nothing until mounted → no hydration mismatch). |
| `pages/+Layout.tsx` | Replaced the unconditional `<Analytics />`/`<SpeedInsights />` with `<ConsentGatedAnalytics enabled={import.meta.env.PROD} />`. |
| `pages/+Head.tsx` | Critical-CSS utilities wrapped in `:where()` → zero specificity, so the compiled stylesheet always wins. |
| `src/components/SiteFooter.tsx` | "Cookie preferences" reopens the panel from any page. |
| `src/pages/CookiesPage.tsx` | Policy rewritten to match reality (only what runs) + "Manage cookie preferences" button. |

**The ✕ does not mean "allowed"** — it takes the same decision as *Reject optional*, so
hiding the box can never be read as agreement.

### Tests added

`src/test/consent.test.ts` (9), `src/test/cookieConsentBanner.test.tsx` (11),
`src/test/consentGatedAnalytics.test.tsx` (5), `src/test/secondAccountGuard.test.ts` (11);
`src/test/consentBannerSpacing.test.tsx` updated to the v2 record shape.

---

## 4. Verification — all commands actually executed

| Check | Result |
|---|---|
| `tsc --noEmit` | **0 errors** |
| `eslint . --ext ts,tsx` | **0 errors, 0 warnings** |
| `vitest run` | **65 files / 759 tests — 0 failures**, `EXIT=0` |
| `npm run build` | **EXIT=0** (also from a clean `rm -rf dist`) |
| `npm run build:check` (`tsc && vite build`) | **EXIT=0** |
| `scripts/e2e/auth-flows.mjs` (mobile-360 + desktop-1440) | **70 pass / 0 fail** |
| `scripts/e2e/logout-flow.mjs` — freelancer | **5/5** (`/dashboard`, session cleared, Back does not resurrect, URL re-entry blocked) |
| `scripts/e2e/logout-flow.mjs` — client | **5/5** (`/client`) |
| `scripts/e2e/auth-lifecycle.mjs` — freelancer | **18/18** |
| `scripts/e2e/auth-lifecycle.mjs` — client | **18/18** |
| Browser: consent (1440px) | one 109px row, `--consent-banner-h` published, no overflow |
| Browser: consent (390px) | full-width action row, **Accept above Reject**, ✕ in the card's bottom-right corner, no overlap, no horizontal overflow |
| Browser: consent network gate | **0** `_vercel/*` requests before consent → 2 after *Accept*; **0** after *Reject* / cross, surviving a reload |
| Browser: persistence | choice survives reload; box does not reappear; footer reopens the panel showing the stored answer |

**E2E total: 116/116 checks.**

Not executable here, and therefore **not claimed as tested**: a real GitHub/LinkedIn
browser round-trip (headless runs cannot complete an interactive provider login). The
callback logic is covered by unit tests plus the repo's existing provider-mismatch and
session-resume probes.

---

## 5. Remaining configuration / deployment steps

1. **Re-run the E2E harness against production after deploy** — `.env.e2e` accounts were
   repaired with `scripts/e2e/create-test-accounts.mjs` (`profile=200` for all three);
   rotate with `--rotate` if you want fresh passwords pushed to GitHub Secrets.
2. **Vercel Web Analytics** is now consent-gated. If you enable it in the Vercel
   dashboard, visitors who have not accepted will still not send data — verify the
   dashboard's own preview traffic source after enabling.
3. **No Supabase migrations are required** for this change.
4. **Redirect URLs** — unchanged; `/auth/callback` must remain in
   Dashboard → Authentication → URL Configuration → Redirect URLs.
5. `docs/blueprint/INVENTORY.md` was regenerated (`npm run docs:map`) for the new files.

---

## 6. Modified / added files

**Added:** `src/lib/consent.ts`, `src/lib/secondAccountGuard.ts`,
`src/components/ConsentGatedAnalytics.tsx`, `src/test/consent.test.ts`,
`src/test/cookieConsentBanner.test.tsx`, `src/test/consentGatedAnalytics.test.tsx`,
`src/test/secondAccountGuard.test.ts`, this report.

**Modified:** `src/components/CookieConsent.tsx`, `pages/+Layout.tsx`, `pages/+Head.tsx`,
`src/pages/CookiesPage.tsx`, `src/components/SiteFooter.tsx`,
`src/pages/AuthCallbackPage.tsx`, `src/context/AuthContext.tsx`,
`src/lib/browserIdentity.ts`, `src/test/consentBannerSpacing.test.tsx`,
`docs/blueprint/INVENTORY.md`.
