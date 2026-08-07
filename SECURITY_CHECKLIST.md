# Growlancer — Standing Security Checklist (5 checks)

**MANDATORY.** Every implemented / edited / updated / deleted change touching the codebase
(`src/`, `supabase/**`, `server.js`, `Dockerfile/nginx`) MUST pass the relevant checks below
**before** it is committed or pushed. Failure to run these = the change is not done.

Source: `Growlancer-Security-Audit-Prompts.pdf` (5 Growlancer-specific prompts) + the prior
run recorded in `SECURITY_AUDIT_REPORT.md`. If a full audit was already done, still re-check the
surfaces YOUR diff touches.

> Keep the diff small and reviewable. For each changed file, ask: *"what could go wrong on the 5 axes?"*
> and check the corresponding box. A change that only adds a button still gets the "content injection"
> + "secret" boxes; a migration change gets the RPC/ownership + RLS boxes.

---

## Check 1 — Secret Leak Prevention
- [ ] No secret uses a `VITE_` prefix (those get bundled into the client JS). Only `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are allowed client-side (anon is public, safe **only if RLS is on**).
- [ ] `service_role` key / raw `eyJ...` JWT / `RAZORPAY_*_SECRET` / `PAYPAL_*_SECRET` / `PAYPAL_WEBHOOK_ID` / `OMNIROUTE_API_KEY` appear **nowhere** in `src/` — server-side Edge Functions only.
- [ ] Real keys never committed: `.env` stays gitignored; `.env.example` holds only placeholders.
- [ ] No `console.log` in Edge Functions or `src/lib` prints a secret, JWT, or full Supabase token.

## Check 2 — Personal Data Flow
- [ ] Diff of `identityVerification`/`credentialVerification`, `clientPaymentMethods`/`withdrawal`, uploads, `messages`/`reviews`: no PII (emails, phones, bank/UPI, KYC URLs, auth tokens) written to logs.
- [ ] AI payloads (`ai-assistant`, `ai-matching`, `ai-ticket-responder` → OmniRoute): only fields the feature needs; no payment/KYC/contact that isn't required. Identity from JWT, never from request body.
- [ ] Recovery codes stored hashed/bcrypt, single-use; TOTP secret not returned after setup.
- [ ] No PII in `localStorage` (only Supabase's own session storage).
- [ ] `admin-data` returns only fields an admin truly needs — never raw payout account numbers / KYC doc URLs.
- [ ] Deletion actually erases/anonymizes (wallet, KYC docs, messages), not just a status flag.

## Check 3 — Pre-Deploy Production
- [ ] Missing required secret ⇒ Edge Function **fails closed / fails loud** (log + clear 500), never silently continues.
- [ ] No leftover debug `console.log` / commented blocks / `TODO/FIXME` about incomplete security / test-only routes; `import.meta.env.DEV` gates are off in prod build.
- [ ] Error responses never leak stack traces, raw SQL error text, or file paths — generic message only.
- [ ] `server.js` + `vercel.json` keep the security headers (`nosniff`, `DENY`, HSTS, CSP with the correct font/connect/frame sources) — verify them on every server/config change.
- [ ] Rate limiting enforced via the `rate_limits` table on any auth/payment/wallet/AI route you touch (min 5/min auth, stricter withdrawal/2FA).
- [ ] CORS: no `*` on payment/wallet/admin functions; restrict to production domain.
- [ ] `supabase/.temp` stays gitignored; no hardcoded connection string.

## Check 4 — Deep Audit (escrow / wallets / webhooks / MFA / business logic)
- [ ] **Ownership:** every RPC/edge function that takes `contract_id` / `milestone_id` / `wallet_id` / `dispute_id` / `contract_id` / `conversation_id` / `user_id` confirms the caller is a party (`auth.uid()` = owner) — no IDOR possible by swapping IDs.
- [ ] **Money auth:** escrow/wallet RPCs are SECURITY DEFINER with `auth.uid()` checks; no path passing another user's id to move funds; no RPC re-granted to `anon`/`authenticated` that touches money.
- [ ] **Amount:** never trust a client-submitted amount/currency/price — the Edge Function recomputes from the DB (`contracts.amount`, `subscription_plans.price`, etc.) before creating an order.
- [ ] **Webhooks:** Razorpay **and** PayPal webhook signatures verified (raw body HMAC / PayPal verify); status only marked after verification, never from a client callback. Webhook secrets fail-closed.
- [ ] **Query safety:** parameterized Supabase queries only — no string-concatenated SQL / regex-interpolated `.filter`.
- [ ] **MFA:** recovery codes single-use + hashed; disabling 2FA requires re-auth.
- [ ] **Inputs:** free-text rendered without `dangerouslySetInnerHTML` (XSS); file upload type/size validated **server-side**, files not served executable from same domain.

## Check 5 — Attacker's Perspective
- [ ] **IDOR:** substitute another user's id on every id-keyed endpoint → must be ownership-checked server-side, not just UI-filtered.
- [ ] **Session/login:** no edge function skips JWT verification; expired/malformed tokens rejected everywhere; `admin-signup` cannot self-provision an admin without existing admin authorization / `ADMIN_SIGNUP_SECRET`.
- [ ] **Privilege escalation:** `admin-data` / `admin-signup` verify the `admin` role **inside the function** (DB/claim), so a regular user gets 403 when calling directly — not just a client-side route guard.
- [ ] **Abuse / AI cost:** rate limits actually apply to signup, OTP/confirm, messaging spam, file uploads, and the AI functions (OmniRoute LLM credits) — an unthrottled loop is direct cost-abuse.
- [ ] **Referral / trial:** cannot self-refer to farm rewards; cannot delete+re-signup to restart a trial.
- [ ] **Content injection:** try script/HTML in every free-text field (bio, review, portfolio, message, ticket) and confirm it never executes on render.
- [ ] **Internal exposure:** `.git`, raw `.env`, `supabase/.temp`, `_health` all unreachable on the deployed domain; RLS **on** for every `public` table PostgREST can expose.
- [ ] **Business logic:** escrow amount can't be negative/zero; promo can't double-apply; withdrawal can't exceed real wallet balance.

---

## How to apply (fast lanes)
- **Docs / non-runtime change** (`.md`, comments): checks 3.2–3.4, 5.7 only.
- **Frontend page/component:** 2.6 (no PII in storage), 4.8 (XSS/free-text), 5.7.
- **A service / API call (`src/lib/*`):** 2.3 (AI), 4.3 (amount), 5.1 (IDOR/ownership), 3.3 (error leak).
- **A migration / RPC / SQL:** 1.1 (no secrets), 4.1–4.3 (ownership + money auth + grants), 5.8 (business logic), RLS on any new table.
- **An Edge Function or webhook:** 1.4, 2.4, 3.3, 3.5, 4.6, 4.7, 5.2.

## Blocking items before enabling live payments (from the audit)
Set in Supabase Edge Functions secrets: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYPAL_WEBHOOK_ID` (and flip `PAYPAL_SANDBOX=false`), `CRON_SECRET`; restore a transactional email provider. A human security review of the wallet/withdrawal RPCs is still recommended before public launch.