# Growlancer — Pre-Launch E2E Test Report

**Date:** 2026-09-15 · **Branch:** `freebuff/ab-bro-listen-end-to-end-comphrensive-testing-from-aff63013-7e2c-44e0-8b44-a7785db81cc7`
**Test environments:** Vite dev server (5173) + production build served by `server.js` on 4173 (mirrors Vercel's static-first fallback)
**Device matrix:** 13 profiles — 320px mini phone → 4K desktop (320, 360, 375, 390, 414, 360-landscape, 844-landscape, 768, 1024, 1280, 1440, 1920, 2560)

---

## 1. Verdict

| Check | Result |
|---|---|
| Unit/integration tests (vitest) | ✅ 107/107 pass |
| TypeScript typecheck | ✅ clean |
| Production build | ✅ clean (prerender + boot-splash injection verified) |
| Device-matrix sweep — **8 key routes × 13 devices (104 page loads)** | ✅ **0 hard failures** (console/page errors, 4xx/5xx) |
| Horizontal overflow / clipped content | ✅ 0 across all route × device combos |
| React hydration errors | ✅ 0 (was: #418 on every non-prerendered route) |
| Interactive elements without accessible name | ✅ 0 (was: 4) |
| Inputs without accessible label | ✅ 0 (was: 18) |
| Heading level skips | ✅ 0 (was: 23, then +14 more caught by the FULLSITE sweep — fixed, see §3a) |
| FULLSITE sweep — 41 routes × 4 canonical devices (164 page loads) | ✅ 0 hard failures, 0 overflow, 0 duplicate ids, 0 broken images (heading skips now 0 — §3a) |
| Missing viewport meta / `<html lang>` | ✅ 0 (was: viewport meta entirely missing — launch blocker) |
| Duplicate DOM ids / broken images | ✅ 0 |
| Auth flows E2E (`scripts/e2e/auth-flows.mjs`) | ✅ 72/72 pass |
| Nav/header/footer/modal E2E (`scripts/e2e/nav-flows.mjs`) | ✅ 17/17 pass |

**Evidence:** `tests/e2e-artifacts/FINAL4-matrix-2026-09-15T13-07-55-983Z.md` (+ `.json`), `auth-flows-2026-09-15T12-12-28-669Z.md`, `nav-flows-2026-09-15T12-29-28-499Z.md`.

> **Note:** `tests/e2e-artifacts/` runs ka throwaway output hai aur **gitignored** hai (console
> captures me Supabase anon-key JWTs embed ho sakte hain). Ye report repo me source-of-truth
> hai; raw artifacts locally regenerate kiye ja sakte hain — commands §7 me hain.

---

## 2. Critical bugs fixed this session (launch blockers)

1. **Mobile viewport meta was never rendered** — `pages/+config.ts` set `viewport` to a custom string, but vike-react only supports `'responsive'` or a number and emitted an EMPTY tag for anything else. Every phone rendered a zoomed-out 980px desktop layout. → set `viewport: 'responsive'`. (Fixed earlier in session; re-verified.)

2. **`/dashboard` (and every non-prerendered route) crashed hydration with React #418** on all 13 devices. The SPA fallback served the prerendered HOMEPAGE HTML and vike-react hydrated it against the dashboard React tree. → boot-splash script now clears `#root` pre-hydration on non-prerendered paths, so vike-react does a clean full client render (`vite.config.ts` `BOOT_SPLASH_HTML`). Verified: 0 page errors.

3. **`server.js` didn't mirror Vercel's static-first fallback** — it served `index.html` for EVERY route, so prerendered pages (`/about`, `/terms`, …) never served their own HTML locally (wrong title/canonical in local prod tests, masked the hydration bug). → now serves `dist/client/<route>/index.html` when it exists, falling back to the app shell (`server.js`, path-traversal safe).

4. **Homepage waitlist country select collapsed to 23px** (`flex-1` in a column-flex parent sets `flex-basis:0%` on the main axis, silently overriding `h-12`). → `w-full sm:flex-1` in `src/pages/HomePage.tsx`. Confirmed 48px on the current production bundle.

5. **Header breakpoint gap at 1024–1245px** — Login/Signup buttons overflowed off-screen between the desktop-nav and mobile-menu breakpoints. → hamburger visibility widened (`xl:hidden`) in `src/layouts/MainLayout.tsx`. (Fixed earlier in session; re-verified in this sweep at 1024/1100/1280.)

## 3. A11y fixes this session

- 18 unlabeled inputs → labels/aria-labels (waitlist, signup, search sorts, help-center, services, contests, certificate verify, admin login, report/feedback, AI chat, contact).
- 4 icon-only buttons without accessible names → aria-labels (toast close, login/signup password toggles, AI chat close, reset-password toggle, client settings, professional profile).
- 23 heading-level skips → fixed to H1→H2→H3 order across ~20 pages + `CookieConsent` (H3→H2), `CategoriesSection` cards (H3→H2), search/service card titles, empty-state headings.
- WCAG 2.5.5 tap targets: raised sub-24px controls (footer legal links, cookie-consent buttons, cert-verify header links, contact links, contest-detail tabs) to ≥24–48px.
- "Back to Home" contrast bumps across ~20 static pages.

### 3a. FULLSITE-sweep follow-up (fixed 2026-09-16)

The 13-device matrix covered only 8 key routes; a post-report FULLSITE sweep (41 routes × 4
canonical devices, `FULLSITE-sweep-2026-09-15T13-21-13-818Z.md`) surfaced **14 heading-level
skips** on routes outside the matrix (`/philosophy`, `/contact`, `/report`, `/guidelines`,
`/terms`, `/privacy`, `/waitlist`, `/certificate`). Three of those (contact, report, guidelines)
were already fixed in source but the sweep ran against a stale build; the rest are now fixed:

- **TermsPage** — fee cards `5%`/`0%` H4→H2, escrow clause items A–E H5→H3, dispute-protocol + contact-box H5→H3, outline-nav H3→H2 (15 tags total).
- **PrivacyPage** — data-layer items A–C, KYC items A–D, contact-box H5→H3, outline-nav H3→H2 (9 tags).
- **WaitlistPage** — "Early Access" / "Launch Updates" H3→H2.
- **CertificateVerifyPage** — info-card titles + "How Verification Works" H3→H2, step titles H4→H3.
- **GuidelinesPage** — Team-Projects + Enforcement-Protocol H4→H2 (latent duplicate of the stale-build finding).

Tailwind preflight resets heading margins/sizes, so these swaps are visually identical — DOM
semantics/AT only. **Verified:** `HEADINGFIX2-*.md` sweep over all 9 affected routes →
**0 heading skips**; typecheck clean; production build clean; 107/107 unit tests pass.

## 4. Auth & nav flow coverage (all passing)

- **Protected routes** `/dashboard`, `/client`, `/client/post`, `/client/payments` → unauthenticated users land on the login modal (mobile + desktop).
- **`/admin`** stays on `/admin` and renders the dedicated AdminLoginPage (server-side `profiles.role='admin'` guard — correct per security principles).
- **Login modal:** empty submit blocked; invalid email format blocked; **wrong credentials show the real Supabase error inline without crashing** (the 400 is expected backend behavior).
- **Signup modal:** opens from header, all fields labeled, empty submit blocked.
- **Login↔Signup switch buttons** both directions; **"Forgot Password?"** navigates to `/auth/forgot-password`; **Escape** closes the modal (verified live).
- **Auth pages:** forgot-password / otp / magic-link all validate empty + invalid email; otp is email-first (code input appears after a valid email — code-entry step covered by manual checks below).
- **Header links** (16 checked) navigate correctly; **mobile hamburger** opens, navigates, and closes; **footer**: 21/21 internal links resolve with no 4xx/5xx; **cookie banner** is dismissible.

## 5. Known-benign findings (accepted, not launch-blocking)

- **Tap targets 36–42px** (49 elements): header logo/login/signup, category tabs, filter chips, Magic-Link/OTP buttons (40px). These meet the 24px WCAG 2.5.8 floor and Apple's 44px is borderline met on most; spacing between adjacent targets prevents mis-taps. Recommend a follow-up pass to reach a uniform 44px minimum on header controls.
- **Text < 12px on phones** (9 elements): decorative micro-labels — "BETA", "FROM", "COMING", "PRO", tooltip hints, form eyebrows (9–11px). Intentional design tokens (`text-[9px]`, `text-[10px]`, `text-[11px]`); no informational content is unreadable.
- **`net::ERR_ABORTED` on `rest/v1/profiles?select=id`** — a React-strictmode/unmount-aborted fetch, retried successfully; no user impact.
- **Supabase realtime websocket console warning** on some loads — transient reconnect during page load; no functional impact.

## 6. Remaining manual checks (cannot be automated without credentials/keys)

1. **Logged-in dashboard flows (header → logout)** for client, freelancer, and admin roles — requires test credentials. Includes contract lifecycle, escrow funding (test mode), milestone approvals, wallet withdrawal, disputes, notifications, team-projects accept step.
2. **OTP code entry** — real OTP delivery + 6-digit code step (email-first flow verified up to the send step only; sending would spam the backend).
3. **OAuth providers** (GitHub/LinkedIn) — need configured Supabase providers.
4. **Payment end-to-end** — Razorpay/PayPal in test mode: order creation, webhook, escrow credit, 5% commission ledger entry, payout/withdrawal via RazorpayX.
5. **Emails** — magic link, verify email, reset password, notification emails (SMTP/Resend templates).
6. **Real devices** — the harness emulates viewports/touch accurately, but do one smoke pass on a physical low-end Android + iPhone Safari (iOS Safari quirks, safe-area insets, 100vh keyboard behavior).
7. **KYC provider production toggle** — currently `kyc_provider_config.mode = 'development'` (auto-verify). Switch to production + real provider token before launch; dev-mode rows must be re-verified.
8. **`E2E_IGNORE_VERCEL_404` favicon-style 404s** — verify `/favicon.ico` behaves correctly on the real Vercel deployment (locally ignorable artifact).
9. **Vercel deploy check** — confirm the new `server.js` fallback semantics aren't needed there (Vercel uses `_redirects`/rewrites, which are correct), and that the boot-splash + `#root` clearing works against the real CDN-cached HTML.

## 7. How to re-run everything

```bash
# Unit tests + typecheck
npm run typecheck && npm test

# Production build + local prod server (4173)
npm run build && PORT=4173 node server.js

# Device matrix (8 routes × 13 devices) against prod artifact
E2E_IGNORE_VERCEL_404=1 node scripts/e2e/device-audit.mjs --base=http://localhost:4173 --mode=matrix

# FULLSITE sweep (all 41 routes × 4 canonical devices)
E2E_IGNORE_VERCEL_404=1 node scripts/e2e/device-audit.mjs --base=http://localhost:4173 --mode=sweep

# Auth flows (72 checks) / nav flows (17 checks)
node scripts/e2e/auth-flows.mjs --base=http://localhost:5173
node scripts/e2e/nav-flows.mjs --base=http://localhost:5173

# Single-element probe (height/labels on any selector/device)
node scripts/e2e/probe.mjs --url=/ --base=http://localhost:4173 --device=phone-360-landscape --selector="#waitlist-country"
```
