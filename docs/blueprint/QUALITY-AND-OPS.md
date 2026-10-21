# Growlancer — Quality Gates, CI/CD and Operations

**Last verified: 2026-10-20.** Scope: how any change to this repository is verified, deployed, monitored and recovered —
the exact commands, gates, and the places where a green check is **not** proof. Documentation only.

**Basis.** HEAD `59be15a`, branch `main`, **working tree dirty** (uncommitted referral work, and `docs/blueprint/**`
being written concurrently). File counts are from the working tree; CI statements were read from the GitHub API on
2026-10-20 (`gh run list` / `gh run view` / `check-runs …/annotations` / `gh secret list` / `gh variable list` /
`branches/main/protection`). Repo `Growlancer-Official/Growlancer`; production Supabase project `zttwsjehcgaicziqyxpq`.
No secret value appears in this file.

| Label | Means |
|---|---|
| **GATE** | Runs on every push/PR and can turn a run red. Not a blocker: `main` has **no branch protection** (API returns `Branch not protected`, 404). |
| **PASSED** | A recorded green run exists; the run id/date is cited. |
| **MANUAL** | Needs a human, production credentials, a paid gateway or a dashboard. |
| **UNVERIFIED** | Read from code/docs, not measured in this pass. |

---

## 1. The system in one page

One `git push origin main` fires three independent pipelines, and **none waits for another**:

| Pipeline | Trigger | Does | Gated on the others? |
|---|---|---|---|
| **Vercel** (dashboard, not in this repo) | GitHub integration on `main` | `npm run build`, serves `dist/`, adds CSP/security headers from `vercel.json` | **No** — deploys even when CI is red |
| **CI** — `.github/workflows/ci.yml` | push to `main`, every PR | typecheck, lint, unit tests, build, white-screen guard, browser element audit, authenticated sweeps, logout security | **No** |
| **Backend Deploy** — `backend-deploy.yml` | push touching `supabase/**` or itself; `workflow_dispatch` | drift gate → `db push` → redeploy all 33 functions → privilege/money pentest → whole-surface audit | **No** |
| **Supabase Check** | PR touching `supabase/**` | `db push --dry-run --include-all --yes` | No — PR signal only |
| **Supabase Deploy** | `workflow_run` on a workflow named `CI — Regression Guard` | legacy: `functions deploy --no-verify-jwt`, optional `db push` | **Dormant** — that name no longer exists |

**Consequence:** a red CI does not stop a deploy, and a green CI does not mean the deploy landed. Only Backend Deploy's
own post-deploy audits prove a backend change is live; only the browser layer proves a UI change works — and that job
is `needs:`-gated, so it is **skipped** whenever an earlier job fails (measured on HEAD `59be15a`: lint failed →
`Element audit: skipped`).

---

## 2. Verification matrix

Every code change: `npm run verify` (= `typecheck && lint && test && build`, the Standing Rule in `CLAUDE.md`,
`docs/FOUNDER-RUNBOOK.md` §8, codified in `package.json`).

| Change type | Required commands (in order) | Why | In CI? |
|---|---|---|---|
| Docs / comments | `npm test -- ciGuardrails noCommittedSecrets`; `npm run docs:check` if structure changed; `npm run preflight` if you changed a claim about live config | Docs are not compiled; only these tests read docs/workflows | No doc gate — MANUAL |
| Frontend UI / CSS / copy | verify → `PORT=4174 node server.js` → `node scripts/e2e/element-audit.mjs --base=http://127.0.0.1:4174 --group=<group> --strict` | Unit tests cannot see layout, clipping, contrast, console errors or auth chrome | GATE (anon + authenticated) |
| Frontend logic / hooks / lib | `npm run verify` | Logic is where the negative controls live; the build also runs the white-screen guard | GATE |
| Edge function (`supabase/functions/**`) | `npx esbuild supabase/functions/<fn>/index.ts --bundle --platform=neutral --outfile=NUL` → `npm test` (CORS + site-URL guards read every function) → push | `tsc --noEmit` does not typecheck Deno; there is **no unit harness** for edge functions | Partly / post-deploy GATE |
| Migration, non-money | `npm test -- sqlMigrationSyntax` → `npm test` → `npx supabase migration list` → PR (so `supabase-check.yml` parses it) → push | The lexer catches characters; only `db push` parses SQL for real | GATE (lexer, drift) / PR dry-run |
| Migration, money / RLS / grants | above **plus** self-audit against `CLAUDE.md` Security Principles §2/§9, a dry run in a **rolled-back transaction on the live DB**, then after deploy `node scripts/e2e/pentest-privileges.mjs` + `node scripts/e2e/surface-audit.mjs` | Money paths have no unit test that touches the DB; every recorded money defect was found by a runtime or dry-run probe | MANUAL dry-run + post-deploy GATE |
| Workflow (`.github/workflows/**`) | `npm test -- ciGuardrails` → push | That test asserts the fail-closed guards by reading the YAML; deleting an assertion to make a workflow pass is its failure mode | GATE |
| Secrets / domain / provider config | `npm run preflight` → change secret → `npm run preflight` again | Preflight verifies a value **by digest** without printing it; no test can see the deployed secret | MANUAL only |
| Dependency bump / test-only change | `npm run verify`; for test-only also the **full** suite | Cross-file allowlists must match migrations byte-for-byte; a localised run hides drift | GATE (build/tests) |

**Windows-specific, measured:**

| Area | Behaviour | Source |
|---|---|---|
| Unit tests | `pool: 'threads'`, `maxWorkers: 1` — `forks` (default) hangs on some Windows setups; do not "optimise" it | `vitest.config.ts:10-13` |
| Build | `node scripts/build.mjs` → `npx vite build` → **manual** recursive copy `dist/client/` → `dist/` (never `fs.cpSync`: copying into its own parent throws `ERR_FS_CP_*`), prunes stale mirrored dirs, generates a fallback SPA shell, then hard-fails if `#root`, `#vike_pageContext` or `#vike_globalContext` is missing | `scripts/build.mjs:138-182, 392-417` |
| Static serve | `node server.js`, PORT `4173` default; CI and local E2E use `4174` | `server.js:12`, `ci.yml:168` |
| `npm run start:prod` | POSIX prefix `NODE_ENV=production …` → fails in `cmd.exe`/PowerShell. Use `$env:NODE_ENV='production'; node server.js` | `package.json:15` |
| Chrome | `E2E_CHROME_PATH`, else `%LOCALAPPDATA%\ms-playwright\…`, else Program Files; CI installs Chrome-for-Testing | `element-audit.mjs`, `ci.yml:154` |
| Working directory | Harnesses read `.env.local`/`.env` from `process.cwd()` — run from the repo root | `scripts/e2e/*.mjs` |
| Sandboxed shells | `npm test` cannot spawn under the DSH file sandbox (Vite's `child_process.exec` realpath is denied). Use a normal terminal | this pass |

**Recorded runtimes:** full green CI **22m26s** (`9ae6492`); CI failing at the guard = seconds (guard runs before Chrome
download and build); Backend Deploy failing at `db push` **23s** (`38719764730`). `npm test` / `build` / `typecheck`
were **not measured in this pass** — do not quote a number until you run them.

---

## 3. Test suite inventory

**Shape.** `src/test/` = **50** `*.test.ts(x)` suites + `setup.ts` (jsdom + Testing Library) = 51 files, measured
18:55 on 2026-10-20. The tree is edited concurrently — re-count with `npm run docs:map` (the `Test suite` row in
`docs/blueprint/INVENTORY.md`); `src/test/projectMap.test.ts` fails when that inventory is stale. Recorded suite sizes
disagree (487/42 in `CLAUDE.md:990`, 423/36 in `LAUNCH-READINESS` §C, "~541" in `AGENTS.md` §11) — all predate or
postdate this set, so **re-measure before quoting**. Coverage is configured for 6 modules and has **no threshold**:
coverage is not a gate. **No test in `src/test/` touches a live database**; several read SQL/YAML as text.

### 3.1 Security, RLS, privilege

| File | Invariant | Neg. control |
|---|---|---|
| `profilesPrivatePrivilegeGuard.test.ts` | guard list vs client-writable list never overlap; `is_admin`, suspension, reputation blocked on INSERT **and** UPDATE | Yes |
| `profilesAnonColumnGuard.test.ts` | anon gets an exact 11-column allowlist, no table-level SELECT; policy `TO anon, authenticated`; **no `public_profiles` view** (it cannot be FK-embedded) | Yes — allowlist must equal the GRANT byte-for-byte |
| `profilesAuthenticatedColumnGuard.test.ts` | no table-level SELECT; all 14 columns granted (wildcard `profiles!fk(*)` embeds need every one) | Yes — same byte-for-byte rule |
| `serverOnlyRpcs.test.ts` | app code never names a server-only RPC; wallet writers have no `dbFunctions` wrapper; `create_user_profile` stays callable pre-session | Yes |
| `serviceRoleContextGuard.test.ts` | service-role detection uses both idioms NULL-safely, comment-aware; sweep asserted by **calling** the scalar function, not counting rows | Yes |
| `surfaceAuditAuthorizationGuard.test.ts` | NULL-safe guards, payout trio narrowed, internals server-only, workspace recursion broken **without** trading it for a leak, dead policies repaired | Yes |
| `countryWaitlistSecurity.test.ts` | waitlist never supplies identity, never writes the table, no client INSERT policy, admin check server-side from `profiles_private` | Partial |
| `cors.test.ts` | every edge function uses `_shared/cors.ts`; unknown origins not reflected; no credentials header; no `Origin` → no CORS headers | Yes |
| `noCommittedSecrets.test.ts` | no 64-hex literal or `*_SECRET/TOKEN/PASSWORD/KEY` with a real-looking value in the tracked tree; the leaked webhook secret stays gone | Yes — planted secret → RED |
| `aiMatchingOwnership.test.ts` | owner-scoped project fetch from the JWT **before** rate-limit, AI spend and match rewrite | Yes |
| `optionalRowSingleGuard.test.ts` | `.single()` never used on the optional `freelancer_profiles` table (PostgREST 406 on a normal state) | No |

### 3.2 Money, pricing, quota, ranking

| File | Invariant | Neg. control |
|---|---|---|
| `config.test.ts` | flat **5%**, 2% processing, ₹299 single plan, ₹2000 min budget | — |
| `escrow.test.ts` | 5% on creation; release only from `funded`; failures return false, not throw | Partial |
| `growCoins.test.ts` | Indian grouping, no NaN/frac; 1:1 discount above minimum, capped at balance; ledger-only money | Yes |
| `teamProjects.test.ts` | `TEAM_COMMISSION_RATE === 0.05`; breakdown adds 5% on top; CRUD + role-contract RPC wiring | — |
| `subscriptionHelpers.test.ts` | active / trial / cancelled semantics; "pro" name matching | — |
| `sellerLevels.test.ts` | thresholds at, above and just below — no off-by-one promotion | Yes |
| `servicePricing.test.ts` | Basic tier, fallback to lowest tier, legacy price column, zero tiers ignored | — |
| `aiQuotaTracking.test.ts` | the CHECK-allowed `ai_assistant` feature type; usage-log insert errors checked, not swallowed; sum-based usage read; **atomic** `increment_rate_limit` so a daily cap cannot reset; meter refreshes per message; error body read from `error.context`, not `data` | Yes |

### 3.3 Auth, signup, referrals, onboarding

| File | Invariant | Neg. control |
|---|---|---|
| `authService.test.ts` | `normalizeRole`, referral codes, profile fetch against a Supabase mock | — |
| `authRouteSurface.test.ts` | prerendered `/auth/*` URLs ⟺ routes; password-era routes stay gone | Yes |
| `authCallbackSessionBeatsError.test.ts` | a real session outranks a benign `?error=`; branch order asserted | Yes — old defect replanted → RED |
| `oauthDiagnostics.test.ts` | breadcrumb before leaving for the provider; staleness, expiry, unreadable record dropped, cleared on success/dismiss/sign-out | Yes |
| `oauthOnlyAuthSurface.test.ts` | GitHub + LinkedIn only; no password/email inputs; role persisted; refusal carries its reason | Yes |
| `signupProfileTrigger.test.ts` | `AFTER INSERT ON auth.users` creates both rows idempotently (profiles first), never blocks signup, records failures, repairs ghosts, wired into the sweep | Yes |
| `referralCode.test.ts` | normalisation, legacy codes untouched, invite-link parsing | Partial |
| `referralInviteCard.test.tsx` | "copy code" copies **only** the code, "copy link" the tracked URL; share intent is branded and role-aware | Yes |
| `referralShare.test.ts` | message carries code + link + sender, professional tone (no emoji), code formatted and searchable | Yes |
| `waitlistPage.test.tsx` | no success before a real subscribe; specific errors; disposable domains rejected | Yes |

### 3.4 UI contracts, a11y, design system

| File | Invariant | Neg. control |
|---|---|---|
| `dashboardSection.test.ts` | header label resolved from the route (exact → deepest prefix → param → nav → URL); never a default "Workspace" | — |
| `errorBoundary.test.tsx` | graceful fallback, never a white screen; Retry recovers | Partial |
| `mobileMenuEscape.test.tsx` | Escape closes the mobile menu | — |
| `earningsChart.test.tsx` | waiting state, totals, every month exposed as text, chart labelled | — |
| `consentBannerSpacing.test.tsx` | `--consent-banner-h` published once visible, cleared on consent, absent when already answered | — |
| `darkThemeCoverage.test.ts` | every light-rendering utility remapped or explicitly excused; no stale excuse; no light boot splash | Yes |
| `darkFormControls.test.ts` | native controls + floating dropdowns get palette surfaces in both themes | Yes |
| `themeProvider.test.tsx` | system default, saved preference, cycle order, `color-scheme`; `renderToString(dark) === renderToString(light)` | Yes |
| `typographyFonts.test.ts` | three serving paths identical; one request per family; every used weight has a real face | Yes — old declaration → RED |
| `cspFontAllowList.test.ts` | three CSP copies agree on fonts; Razorpay origins stay reachable | Yes |
| `iconPackConsolidation.test.ts` | no hand-drawn `<svg>` in migrated files; only brand marks remain | Yes |
| `currencyCountry.test.ts` | alpha-2, country name, legacy combined value; unknown → null | — |
| `countrySelectContract.test.tsx` | India selectable; 196 others display-only (click **and** Enter refused) | Yes |
| `adminProfileDirectory.test.ts` | names from `profiles`, emails from `profiles_private`; never queries `profiles.email` | — |
| `analyticsService.test.ts` | empty-but-successful backend still yields usable analytics | — |

### 3.5 Content honesty, config drift, SQL, CI

| File | Invariant | Neg. control |
|---|---|---|
| `publicMetricsHonesty.test.ts` | hero count from the live metrics hook; no hardcoded number; line hidden until real; exactly **one** metrics instance | Yes |
| `truthfulPlanClaims.test.ts` | advertised writing cap equals the enforced cap; analytics never sold as Premium; seed migration scrubs DB plan rows | Yes |
| `siteUrlGuard.test.ts` | `_shared/site.ts` is the only `APP_URL` reader; no hardcoded origin outside the allow-list | Yes (+ positive) |
| `ciGuardrails.test.ts` | missing secret **fails** (not skips); every consumed credential asserted; deploy guard precedes deploy; authenticated sweeps cannot pass logged-out; `db push` has **no** `--include-all` and the comment explains why | Yes — 4 controls |
| `projectMap.test.ts` | `docs/blueprint/INVENTORY.md` matches the tree (649 files / 12 groups) — a new page, function, migration, test or workflow cannot land without `npm run docs:map` | Yes |
| `sqlMigrationSyntax.test.ts` | every `.sql` under `supabase/` is lexically well-formed | Yes — real 42601 defect → RED at line 287 |

### 3.6 The custom SQL lexer (`src/test/sqlMigrationSyntax.test.ts`)

Written because `20270119000019` shipped a `DO $patch_guards$ … $patch_guards$` body with **one missing quote**; typecheck,
lint, build, 213 tests and 10 guard tests all passed (they read the migration as text) and only `db push` failed, with
`42601`, after merge.

It is a single-pass character lexer over every `.sql` file under `supabase/` (**304 measured: 296 migrations + 6
archived + 2 elsewhere**), tracking `normal`, `single`, `double`, `line-comment`, `block-comment`, plus `$tag$` bodies
lexed **in place** with a tag **stack** (no recursion, no offset arithmetic — so a reported line is the file's real
line). Two rules took iterations: the tag that closes a body cannot be content of that body (comment state loses to the
closing tag), and a line comment must reset state even when the newline branch already `continue`s. It fails on
unterminated literal/identifier/comment/body, on a single-line literal that swallows a newline, and on a file set
smaller than 200 (so a broken glob cannot pass vacuously). It also asserts the exact historical desync is still caught.

**Limit, stated in the file:** a lexer is not a parser. It cannot prove a body compiles, a column exists or a grant is
valid — only `db push` or a rolled-back dry run can.

---

## 4. CI — `.github/workflows/ci.yml`

Triggers: `push` to `main`, **all** PRs. `concurrency: ci-<ref>`, `cancel-in-progress: true` (a newer push cancels an
older run, including one whose browser layer has not started).

| # | Job (timeout) | Needs | Steps in order | Secrets |
|---|---|---|---|---|
| 1 | **Typecheck (tsc)** (15m) | — | checkout → Node 24 + npm cache → `npm install --no-audit --no-fund` → `npm run typecheck` | none |
| 2 | **Lint (eslint)** (15m) | — | same → `npm run lint` | none |
| 3 | **Unit tests + Production build (+ white-screen guard)** (25m) | — | checkout (`fetch-depth: 0`) → Node 24 → install → `npm test` → `npm run build` → upload `dist` (7 days) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (public, placeholder fallback) |
| 4 | **Element audit (375/768/1280)** (90m) | 1,2,3 | guard → Node 24 → install → Chrome-for-Testing → build → serve `PORT=4174` → 5 anonymous strict sweeps → seed accounts → `login --all --require-all` → storage-state existence check → 3 authenticated sweeps → 3 logout flows → teardown `always()` → artifacts (14 days) | 9 |

`npm install`, not `npm ci`, is deliberate: `npm ci` fails on this React 19 lockfile on the runner while `npm install`
(Vercel's own path) succeeds (`ci.yml:10-12`).

**Secrets, names only.** Job env requires nine and the guard asserts each: `SUPABASE_URL` (falls back to
`VITE_SUPABASE_URL`), `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `E2E_FREELANCER_EMAIL/_PASSWORD`,
`E2E_CLIENT_EMAIL/_PASSWORD`, `E2E_ADMIN_EMAIL/_PASSWORD`. Measured repo secrets are **12**: the six `E2E_*` plus
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`,
`VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` — `SUPABASE_URL` itself is not a repo secret, it takes the
`VITE_SUPABASE_URL` fallback. Also measured: variable `SUPABASE_DB_AUTO_PUSH = true`; `SUPABASE_DB_URL` and
`RAZORPAY_WEBHOOK_SECRET` are **not** set.

**Fail-closed guards** (the part that looks like clutter and is not):

| Guard | Behaviour | Where |
|---|---|---|
| Secret guard | Runs **first**, before Chrome download and build; missing name → `::error::` naming it + `exit 1`. No `can_seed_e2e` gate exists (asserted absent, comments stripped) | `ci.yml:120-144` |
| Fork PR | The **only** tolerated skip (GitHub exposes no secrets to forks); `::warning:: … NOT RUN … treat this run's green as covering anonymous pages only` | `ci.yml:128-132` |
| Partial sweep | `--require-all` + on-disk check for `.e2e/{freelancer,client,admin}.json`; a missing state exits 1 instead of dropping a role | `ci.yml:212-219` |
| Logged-out "green" | An authenticated audit that rendered logged-out chrome is an `authViolation` and fails even without `--strict` | `element-audit.mjs` |
| Teardown | `if: always() && run_authenticated == 'true'` — accounts never survive a failed run | `ci.yml:230-232` |

**Artifacts and logs.** `dist` (7 days) and `tests/e2e-artifacts/` (14 days, `if: always()`, gitignored because console
captures can embed anon-key JWTs). **Workflow logs are admin-token gated**; only `::error::` lines become public
check-run annotations. Measured: the failing `Lint` annotation contains the exact unused-variable messages, while the
failing `Whole-surface audit` step produced **only** `Process completed with exit code 1` — a red audit tells you
*that* it failed, not *what* it found.

**Flakiness and limits.** Linux runner has DejaVu, not the app's Fontshare faces → layouts that fit on Windows can
overflow at 375px (nav got its own scroll container). `--concurrency=2` because 4 Chrome contexts exhaust a 2–4 vCPU
runner. Chrome download costs ~1 min (guard runs first so a bad config fails in seconds). Seeding depends on the
service key and repairs a rotated password. **Route-list drift:** docs record 336 anonymous loads / 72 dashboard / 72
client / 51 admin, but today's `ROUTE_GROUPS` is 108 routes (35 public, 8 auth, 24 dashboard, 24 client, 17 admin) ×
3 viewports — re-measure from the run header. A React #418 `insertBefore` race historically cost 1–2 of 72
authenticated loads; a deterministic hydration cause was found and fixed (`CLAUDE.md:975-982`), not re-measured since.

**Not covered:** no dependency/CVE gate in these workflows (CodeQL dynamic workflows exist outside the repo); no SQL
execution; no edge-function runtime test; Chrome only (no WebKit/Firefox, no real device); hand-written a11y checks
rather than axe; no visual regression; no performance budget or load test; no secret scanning beyond a textual test.
And with no branch protection, **none of it blocks a merge**.

---

## 5. Backend deploy — `.github/workflows/backend-deploy.yml`

| # | Stage | Fails how | What a failure means |
|---|---|---|---|
| 1 | Checkout + `supabase/setup-cli@v1` | setup error | nothing ran |
| 2 | **Guard — access token** | `::error::` + exit 1 | nothing deployed |
| 3 | **Resolve DB connection** — `SUPABASE_DB_URL` if set, else derive the pooler URL from `SUPABASE_DB_PASSWORD`; never echoed | exit 1 naming both missing secrets | nothing deployed |
| 4 | **Guard — pentest secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`) | `::error::` + exit 1 **before any write** | nothing deployed — a deploy whose verification cannot run is not a successful deploy |
| 5 | Write `/tmp/driftcheck.mjs` | — | — |
| 6 | **Drift check `pre`** | exit 1 on remote-only or duplicate versions | nothing deployed |
| 7 | **`supabase db push --db-url …`** (no `--include-all`) | SQL error → exit 1 | the failing migration rolled back; earlier ones in the same push may have applied; stages 8–11 do not run |
| 8 | **Drift check `post`** | exit 1 if anything is still local-only | push claimed success but did not land everything |
| 9 | **Deploy all 33 functions from repo source** (loop; skips `_shared`) | collects failures, `failed=1`, exits non-zero **after** the loop | **partial deploy** — some functions live, stages 10–11 skipped, nothing verified |
| 10 | **Pentest** (`scripts/e2e/pentest-privileges.mjs`) | exit 1 on any landed escape | changes are **already live** |
| 11 | **Whole-surface audit** (`scripts/e2e/surface-audit.mjs`) | exit 1 on any probe failure **or teardown leftovers** | changes are **already live** |

**Failure semantics.** Stages 2–8 are pre-deploy; 9 is partial; 10–11 are post-deploy, so red there means **live and
unverified**, not "nothing happened". Measured 2026-10-20 (run `39397782170`, `e517864`): stages 2–10 `success`, stage 11
`failure` — migration, all 33 functions and the money-path pentest are live. The committed capture
`.devlog/surface-audit-run2.txt` reports **110 checks, 1 failure, 3 vacuous notes** and
`LEFTOVERS: projects=2, workspaces=2, workspace_activity_logs=2, notifications=1`; `surface-audit.mjs:1168` increments
`failures` for leftovers, so the counted failure is consistent with the audit's own residue rather than a product
finding — confirm from the log before treating it as a security event. A green deploy proves only that the drift gate,
pentest and surface audit did not object.

**Drift-gate rules** (`/tmp/driftcheck.mjs`):

| Mode | Remote-only (DB has it, repo does not) | Local-only (repo has it, DB does not) | Duplicate version (2 files, 1 version) |
|---|---|---|---|
| `pre` | **drift → fail** | pending → pass (this is what `db push` applies) | fail, naming both files |
| `post` | fail | **fail** | fail |

`db push` matches a repo file to a `schema_migrations` row **by version**, so two files sharing a version means only the
lexicographically-first can ever match; the other looks permanently unapplied and re-pushing hits a duplicate key that
surfaces as the misleading "a migration in the local directory does not exist on the remote database". `--include-all`
does not fix that — it forces the rogue file in while hiding the line that caught it. Hence no `--include-all`, an
explicit duplicate check, and a test asserting both the absence of the flag and the presence of the comment explaining
why (`ciGuardrails.test.ts:400-409`).

**Re-running.** `gh run rerun <id>` / *Re-run all jobs* (re-runs `db push`, usually a no-op, and redeploys every
function); *Run workflow* (`workflow_dispatch`); or locally `npm run deploy:backend` (`scripts/deploy-backend.sh`:
`db push --linked`, `functions deploy --use-api`) — **bash-only** and with **no** drift gate, secret guard, pentest or
surface audit. Emergency tool: commit and push immediately after, or the repo stops being the source of truth.

**Auto-deploy:** a push to `main` touching `supabase/functions/**`, `supabase/migrations/**`, `supabase/config.toml` or
the workflow file. A push touching only `src/**` deploys the frontend only.

**Repo → live, and why dashboard edits are dangerous.**

```
repo migration ──► drift gate (versions only) ──► db push ──► schema_migrations row ──► live schema
repo function dir ──────────────────────────────► functions deploy loop ──► live bundle (verify_jwt from config.toml)
```

Because the gate compares **version numbers, not bodies**: a dashboard-edited function body is live drift it cannot see,
and the next push silently reverts it — or your edit silently reverts a hardening change. Precedent: `20270122000000`
re-created three money RPCs from pre-hardening bodies, dropped their NULL-safe guards, and the hourly sweep wrote 4 open
HIGH `security_alerts`; the fix (`20270130000000`) is a forward migration (`LAUNCH-READINESS` header,
`LAUNCH-REVIEW-2026-10-20.md` §2.0). A SQL-editor change not captured in a migration is invisible until it breaks
something, and `db pull` generates a **new** migration rather than editing history. `supabase/config.toml` is local dev
config with `site_url = http://localhost:5173` — never `supabase config push` before fixing that line (§5.2).

---

## 6. E2E harness catalog — `scripts/e2e/**`

Plain Node ESM (`playwright-core` for browser work), reads `.env.local`/`.env` from `process.cwd()`, never prints a
secret, exits non-zero on failure, artifacts in `tests/e2e-artifacts/` (gitignored).

| Harness | Proves | Prereqs | Safety rails | Run | Duration |
|---|---|---|---|---|---|
| `create-test-accounts.mjs` | the 3 E2E accounts exist, can log in, `is_admin` read back from REST | service key + `SUPABASE_URL`; `gh` for `--rotate` | idempotent; credentials to gitignored `.env.e2e`; `--rotate --push-secrets` publishes GitHub secrets; prints nothing sensitive | `node … [--rotate --push-secrets]` | seconds |
| `remove-test-accounts.mjs` | accounts gone via the **same** full-cascade path a real deletion uses | service key | idempotent (`already_absent` = pass); `always()` in CI | `node …` | seconds |
| `login.mjs` | a real, refreshable, server-verified session per role | `E2E_<ROLE>_*`, anon key, `SUPABASE_URL` | GoTrue password grant (no UI form exists); writes `.e2e/<role>.json`; `--require-all` throws; refuses a tokenless session | `node … --all --require-all` | seconds/role |
| `element-audit.mjs` | element correctness at 375/768/1280: placeholder text, clipping, currency glyphs, generic labels, unnamed icon buttons, unlabeled inputs, 404 internal links, broken images, overflow, duplicate ids, heading skips, page/console errors, auth chrome (`--storage`), theme (`--theme`) | served build + Chrome | strict fails on any issue; authenticated runs fail closed if logged out; artifacts always written | `node … --group=public --strict --concurrency=2` | 5 groups ≈ 90-min CI budget |
| `logout-flow.mjs` | logout clears the session; **Back** does not resurrect the page; direct URL re-entry blocked | role storage + creds | per-role, non-zero on failure, artifact MD | `node … --role=freelancer` | tens of seconds |
| `nav-flows.mjs` | header links, mobile menu + Escape, mega-nav, footer links, modal switches, forgot-password route | served build | read-only | `node … --base=…` | ~1 min |
| `auth-flows.mjs` | logged-out surface: redirects, providers present, no password form, role required, removed routes degrade | served build | read-only, no account | `node … --base=…` | ~1 min |
| `auth-lifecycle.mjs` | the session between login and logout: reload, second tab, token refresh, verification state, teardown — per role | `E2E_<ROLE>_*`, anon key, service key | fail-closed config; throwaway account deleted | `node … [--role=client]` | 1–2 min/role |
| `oauth-signup-chain.mjs` | an `auth.users` insert alone yields profiles + private + wallet; browser path works; ghost repaired; idempotent | service + anon key | throwaway account, `finally` teardown, `--keep` for inspection | `npm run e2e:oauth-signup` | ~1 min; **17/17 PASSED** |
| `pentest-privileges.mjs` | runtime privilege + money boundaries over real HTTP: admin self-grant, suspension self-lift, reputation inflation, wallet self-credit, then contract → fund → release → dispute → withdraw with anon / cross-party / non-admin attempts | service key + anon key + REST URL (not the pooler) | 3 throwaway accounts deleted in `finally`; decides by **rows changed**, not HTTP status; stops before the provider payout call | `node …` | minutes; **103 checks / 40 escapes / 0 failures PASSED** |
| `surface-audit.mjs` | breadth: 113 tables / 233 functions / 298 policies — anon-executable helpers with a caller id, owner-scoped tables across users, private tables as anon, cross-tenant workspaces + positive control, DB invariants, 4 drift sweeps | service + anon key | throwaway accounts, `finally` teardown; prints `vacuous` when a probe had no data (empty table is never a pass); **fails on leftovers** | `node …` | minutes; last capture **110 checks / 1 failure (leftovers)** |
| `razorpay-chain.mjs` | one real test-mode chain and **which step stops it**: order (server-derived amount) → interactive auth → webhook → escrow → release → payout | service + anon key, deployed **test** keys | **aborts unless `key_id_mode === 'test'`**; 2 throwaway accounts cascade-deleted; `--keep` for follow-up | `node …` | 1–2 min; stops at hosted checkout by design |
| `razorpay-webhook-rehearsal.mjs` | the signed-webhook success branch: escrow funded, contract active, order captured, capture row, event logged, both parties notified, **replay ignored**, release books 5% + invoice + 3 ledger rows + wallet credit | `RAZORPAY_WEBHOOK_SECRET`, service + anon key | real signature over real HTTP; 3 anti-vacuity controls (forged signature refused, unknown order funds nothing, replay not double-funded); baseline row counts restored; fail-closed on missing/wrong secret | `npm run rehearse:webhook` | ~2 min; **33 checks / 0 failures PASSED** |
| `ai-providers.mjs` | the three AI functions really call a model (SSE with model name, real text, `ai_enhanced=true` + model scores) rather than silently falling back | service + anon key; seeds a matching freelancer + project | anon call must be **401** (anti-vacuity); 2 throwaway accounts deleted; exit 0 only on real model output | `node …` | ~1 min; **PASSED** |
| `device-audit.mjs` | 13 device profiles: status, console/page errors, failed requests, overflow with offending nodes, sub-44px taps, sub-12px text, images/alt, unnamed interactives, duplicate ids, heading skips, `lang`/viewport | served build + Chrome | read-only; artifacts; `--mode=auth:<role>` needs storage | `node … --mode=sweep` | long; not in CI |
| `network-errors.mjs` | every unfiltered 4xx/5xx for **one** URL — diagnostic, no pass/fail | served build | read-only | `node … --url=/report --base=…` | seconds |
| `probe.mjs`, `probe-login-error.mjs`, `devices.mjs` | ad-hoc element/modal measurements; shared device + route lists | served build | read-only, no assertions | see file header | seconds |

**Common rails, restated because they are why this is safe against production:** throwaway accounts on
`@growlancer-test.com` created through the admin API and deleted through the full-cascade RPC in `finally`; money
harnesses refuse live gateway keys or stop before the payout call; no harness prints a secret; artifacts and `.env.e2e`
are gitignored.

---

## 7. Preflight and the release checklist

**`npm run preflight`** (`scripts/founder-preflight.mjs`) is read-only by construction (REST GETs + `secrets list`) and
prints: (1) the secret **names** the code reads versus what is configured, with a curated required set (`RAZORPAY_KEY_ID`,
`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`, `APP_URL`, `AI_API_KEY`, `BREVO_API_KEY`,
`CRON_SECRET`); (2) digest-verified `APP_URL` / `PAYPAL_SANDBOX` (confirmed by sha256, never printed — a digest of a
low-entropy value would be reversible, so digests are not printed either); (3) live metrics a visitor sees; (4)
custom-domain readiness (resolver, no hardcoded origins, CORS, sitemap, config.toml, push script). Report mode exits 0;
`--strict` exits 1 while a blocker remains. **Deliberately not in CI** — it needs production credentials and a human
(`founder-preflight.mjs:18-20`).

| Runbook phase | Item | Gate |
|---|---|---|
| §0 | preflight | MANUAL |
| §0.5 | **Rotate the committed webhook secret** | 🔴 first — a forgeable `payment.captured` is a money-out path |
| §1 | RazorpayX Payouts + `RAZORPAY_ACCOUNT_NUMBER` (A1) | 🔴 money cannot leave |
| §2 | one real test-mode payment by hand (A2) | 🔴 prove money can come in |
| §3 | PayPal atomic switch (A5): backend keys **then** `VITE_PAYPAL_ENABLED` + redeploy | 🟡 wrong order funds real escrow with sandbox money |
| §4 | KYC off development mode (A4) + re-verify `dev_mode` rows | 🟡 |
| §5 | `growlancer.com` switch, 7 ordered steps, one `APP_URL` secret | 🟢 |
| §6 | branch protection (A7), 4 job-name contexts | 🟡 **still open** (measured 2026-10-20) |
| §7 | real supply (A8) | 🟡 |
| §8 | recurring ops: weekly preflight, weekly alerts, queued withdrawals, monthly `CRON_SECRET` | MANUAL |
| §10 | if something breaks: stop pushing, run preflight, read the pipelines, **never hand-edit money tables** | — |

**The loop:**

```powershell
npm run verify; npm run docs:check                 # 1. gate locally (+ preflight if config/secrets/domain)
# 2. security-audit the uncommitted diff: secrets, client-trusted money, RLS, webhook fail-open, IDOR,
#    request-body user_id, untracked artifacts
git add -A; git commit -m "<type>: <what>"; git push origin HEAD:main   # 3. frontend + backend together
gh run list --limit 4                              # 4. CI + Backend Deploy (Vercel: dashboard only)
node scripts/founder-preflight.mjs                 # 5. verify with numbers: preflight, then the matching harness
node scripts/e2e/pentest-privileges.mjs; node scripts/e2e/surface-audit.mjs      # money / RLS
node scripts/e2e/element-audit.mjs --base=<url> --group=<touched> --strict       # UI
```

**Rollback and recovery**

| Failure | Recovery | Limit |
|---|---|---|
| Bad frontend deploy | `git revert <sha>` → push → Vercel rebuilds | Forward-only; Vercel has no repo-side rollback button |
| Bad edge function | fix → push (all 33 redeploy) or re-run the workflow | A partial loop leaves an unknown subset live until the next run |
| Bad migration (applied) | write a **new forward migration**, push | **No down migrations exist**; `db push` has no `--down`; `migration repair` only edits version bookkeeping, it does not undo SQL |
| Migration failed mid-push | that migration's transaction rolled back; earlier ones may have applied. Read stage 7, fix forward | Never delete or rename an applied migration: it becomes remote-only drift and blocks every later deploy |
| Duplicate version blocks push | renumber the newer file (precedent `20270127000000`) | Never `--include-all` to get past it |
| Dashboard-only change | capture with `db pull`, reconcile, push | The gate cannot see body drift; only the monitor or a failed audit will |
| Secret leaked / wrong | rotate at the provider, `secrets set`, re-run the proving harness (webhook rehearsal must be 33/0 **and** the old value must 401) | Deleting a committed literal is not rotation — git history keeps it |
| Data loss | Supabase backups / PITR (plan-dependent) | **UNVERIFIED** — no restore has been rehearsed; assume nothing about RPO |

---

## 8. Observability

| Signal | Where | Means | Consumer |
|---|---|---|---|
| **Sentry** (browser) | `pages/+client.ts:6-36` — DSN-gated (`VITE_SENTRY_DSN` must start `https://`), loaded after `load` + idle, env `production`, release `growlancer@VITE_APP_VERSION`, traces `0.1`, replay `0.1`/`1.0` on error, `maskAllText` | frontend exceptions, slow transactions, masked replays | Sentry project owner. If the DSN is unset in Vercel this is silently off — **UNVERIFIED** from the repo |
| **`security_alerts`** | `supabase/migrations/20261214000000_security_drift_monitor.sql` — `severity` (critical/high/medium/low), `category`, `detail`, `source`, `is_resolved`, timestamps; RLS admin SELECT, service_role ALL | one row per new finding | admin console (realtime), founder's weekly check, `security-alert-notify` |
| **Hourly drift sweep** | `pg_cron` job `growlancer-security-drift`, `15 * * * *` → `check_security_drift()` | RLS-disabled tables, open policies, unprotected `SECURITY DEFINER`, open storage writes, self-writable trust columns, anon-reachable money RPCs, client-writable money tables, stale JWT-claim guards, profile column allowlists, signup ghost accounts | insert → realtime → admin; email via `pg_net` → `security-alert-notify` with `CRON_SECRET` |
| **Alert email** | `supabase/functions/security-alert-notify` (Brevo) | "new drift findings" | founder. ⚠️ currently a **logged no-op**: Brevo rejects every send on the account's Authorised-IPs setting (A9) — rows still insert and still reach the admin console |
| **Status page** | `src/pages/StatusPage.tsx` — client probe of `profiles` count + timing every 120s; two rows are **static** ("Realtime" = "Pre-launch monitoring", "AI matching" = "Operational"), PayPal = "Coming Soon" | only the DB row is measured; the rest is copy | public visitors. Not an SLO monitor or incident feed |
| **Vercel Analytics / Speed Insights** | `pages/+Layout.tsx:31` (`<Analytics />`, production only) | page views + Core Web Vitals | Vercel dashboard |
| **Email delivery** | Brevo + the `email_sent` flag callers log; rows where the function writes them | whether a send was handed to the provider | edge logs; A9 for the current failure |
| **Audit / ledger tables** | `ledger_entries`, `payment_webhook_events`, `razorpay_transactions`, `platform_revenue`, `invoices`, `signup_profile_failures`, `client_errors`, `fraud_events`, `workspace_activity_logs` | financial + behavioural history; `signup_profile_failures` is the fail-soft signup record | founder SQL, admin console, the audits (`escrow_balance == sum(held escrows)`, no orphans, no negative balances) |
| **Deploy state** | GitHub Actions + check-run annotations | last known verification per commit | anyone with repo read (annotations) / admin token (logs) |

**No alert covers:** a page that renders wrong, a slow query, a webhook that never arrives, an email accepted then
bounced, a failed Vercel deploy while CI stayed green, or any drift outside the sweep's shapes. Those are found by the
E2E harnesses, the weekly preflight, or a human.

---

## 9. Environment and secrets (names only — never values)

| Tier | Where set | Names | Notes |
|---|---|---|---|
| **Client (public)** | Vercel env vars, local `.env` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_VERSION`, `VITE_SENTRY_DSN`, `VITE_PAYPAL_ENABLED`, `VITE_RAZORPAY_CONFIG_ID` | Inlined by Vite at build → changing one needs a **redeploy**, not a restart. Template `.env.example` |
| **Edge secrets** | `npx supabase secrets set --project-ref …` | `SUPABASE_*` (auto), `RAZORPAY_KEY_ID/_KEY_SECRET/_WEBHOOK_SECRET/_ACCOUNT_NUMBER`, `PAYPAL_CLIENT_ID/_CLIENT_SECRET/_WEBHOOK_ID/_SANDBOX`, `APP_URL`, `AI_API_KEY/_BASE_URL/_MODEL`, `BREVO_API_KEY`, `EMAIL_FROM/_REPLY_TO`, `CRON_SECRET`, `SUREPASS_API_TOKEN/_BASE_URL`, `KYC_PROVIDER` | Persist across deploys; preflight enumerates what the code reads |
| **GitHub Actions** | repo Settings → Secrets | 12 measured: `E2E_{FREELANCER,CLIENT,ADMIN}_{EMAIL,PASSWORD}`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` (+ variable `SUPABASE_DB_AUTO_PUSH`) | No `SUPABASE_DB_URL` (derived); no `RAZORPAY_WEBHOOK_SECRET` (rehearsal reads the environment) |
| **Supabase Auth config** | `scripts/push_redirect_urls.mjs` (reads `APP_URL`) | `site_url` + redirect allow-list | Refuses a malformed origin; run it in the same sitting as the `.com` switch |

**`APP_URL` is the single source of truth for the site origin.** `supabase/functions/_shared/site.ts` is the only
reader (`SITE_URL`, `siteUrl(path)`, `FALLBACK_SITE_URL`, warns when unset, never logs the value); 12 edge functions
were codemodded onto it (email logos/footers, subscription and dashboard buttons, PayPal return/cancel URLs, the AI
attribution header, the two cron functions' hardcoded links). Only `_shared/cors.ts` (multi-domain allow-list **by
design**) and `site.ts` (documented fallback) keep an origin. `src/test/siteUrlGuard.test.ts` fails CI on any hardcoded
growlancer origin or direct `APP_URL` read; mailbox strings like `support@growlancer.com` are deliberately not matched.

**Rotation**

| Secret | How | Proof |
|---|---|---|
| `RAZORPAY_WEBHOOK_SECRET` | regenerate in Razorpay → `secrets set` | rehearsal **33/0**, then the **old** value must 401 |
| `CRON_SECRET` | set both sides together (env secret **and** `cron_settings.cron_secret`; crons accept either) | crons keep firing, no 401 in `net._http_response` |
| `SUPABASE_DB_PASSWORD` / `SUPABASE_ACCESS_TOKEN` | provider → update repo secret | next deploy reaches stage 7 / stage 2 guard passes |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → rotate, update repo secret + local `.env.local` | CI job-4 guard passes, pentest runs |
| E2E passwords | `create-test-accounts.mjs --rotate --push-secrets` | CI login 3/3 |
| `APP_URL` | one secret; instant on next invocation, no redeploy | preflight digest shows the new origin |
| `PAYPAL_*` | backend first (`PAYPAL_SANDBOX=false`), verify by digest, **then** flip `VITE_PAYPAL_ENABLED` and redeploy | preflight shows `false` before the UI appears |

Never print, commit, log or paste a value; never echo a digest of a low-entropy value. `.env`, `.env.local`,
`.env.e2e`, `.e2e/`, `tests/e2e-artifacts/` are gitignored for exactly this reason.

---

## 10. The docs system — which file is authoritative for what

| Doc | Authoritative for | Rule |
|---|---|---|
| `AGENTS.md` | the standing engineering contract: business rules, security invariants, read order, decision rights | Loaded every session; keep it short. If a rule stops being true, fix it in the same commit |
| `CLAUDE.md` | business model, Security Principles, the Standing Rule, and the **chronological status log** | Append one dated entry per pass; never rewrite history; keep the rules sections short |
| `docs/LAUNCH-READINESS.md` | the **only** list of launch blockers (§A founder actions, §B engineering backlog, §C verified-working + how to re-prove each) | Update when a blocker opens/closes; do not grow a second blocker list |
| `docs/FOUNDER-RUNBOOK.md` | the **operator** playbook: exact order, clicks, verification line, rollback per step | Every step keeps a `How to verify` line |
| `docs/blueprint/{FRONTEND,BACKEND,DATABASE,DOMAIN-FLOWS}.md` | the module maps (routes, services, schema, flows) | Update when structure or ownership changes |
| `docs/blueprint/INVENTORY.md` | generated file list (649 files / 12 groups) | **Never edit by hand** — `npm run docs:map`; `npm run docs:check` detects staleness; `src/test/projectMap.test.ts` fails on drift |
| `docs/UI-ELEMENT-AUDIT-REPORT.md` | defect log, per-pass evidence, harness false positives (§1-§23) | Append a section per pass with run ids and counts |
| `docs/LAUNCH-REVIEW-2026-10-20.md` | point-in-time review of the 20 Oct pass | Immutable — write a new dated review |
| `DEPLOYMENT.md` | original three-service wiring + one-time setup | **Stale in parts** (calls `supabase-deploy.yml` the deploy path, says 26 functions, `db push --include-all`, `2026-08-03` migration state). Read for the mental model, not current truth |
| `.devlog/*` | raw captured output of a pass | Append-only evidence, never the claim |
| This file | the gates themselves | Update when a workflow, harness, secret name or documented runtime changes |

**The rule that makes docs usable: every status claim must be measured and dated.** "Tests pass" is not a claim;
"`npm test` → 487 tests / 42 files, 2026-10-16, run X" is. The repo shows why: `CLAUDE.md:987-988` records
"`--include-all` added", while `backend-deploy.yml:168-184` deliberately forbids it and `ciGuardrails.test.ts:400`
asserts its absence. Both sentences are in the tree; only one is true. Fix the doc — do not average it.

---

## 11. Known gaps, and what a future team must not assume

**Untested / untestable**

| Path | Status | Why |
|---|---|---|
| Real card authorisation in Razorpay's checkout | **MANUAL forever** | Interactive by design; the chain script stops there and says so |
| RazorpayX payout (money **out**) | **BLOCKED** | `POST /v1/payouts` → 404 until Payouts is enabled; withdrawals queue, funds held not lost |
| Edge-function runtime | only post-deploy probes | No Deno unit harness; `tsc` does not cover them |
| SQL semantics | only `db push` | The lexer proves characters, not schema |
| Mobile Safari / Firefox / real devices | **untested** | Chrome-only via `playwright-core` |
| Email deliverability | **broken** | Brevo Authorised-IPs (A9) rejects every send; six email-dependent flows are silent |
| OAuth consent leg | broken externally | LinkedIn can stall on its own page (B10) |
| Data restore / PITR | **unrehearsed** | No restore drill on record |
| Load / cost at scale | untested | No performance or soak test in this repo |

**Skipped, weak or quietly vacuous**

- **Element audit is `needs:`-gated** — any lint/typecheck/build failure skips the browser layer (measured on HEAD).
- **No branch protection** (measured 404) — every gate here is advisory; a direct push to `main` deploys.
- **The drift gate compares versions, not bodies** — dashboard edits survive until the next push overwrites them.
- **The surface audit prints `vacuous`** when a probe had no data (3 notes last run, e.g. 32/47 private tables empty). An
  empty table is not a passing RLS test.
- **The audit's own residue can fail the deploy** — leftovers increment `failures`; the last run failed on that.
- **A failing surface audit emits no `::error::`** — findings are in admin-gated logs; a normal token sees only exit 1.
- **`noCommittedSecrets` is textual** — it catches 64-hex literals and credential-shaped assignments, not encoded ones.
- **Unit tests read migrations as text** — passing them proves the string matches, not that Postgres accepts it.
- **`FOUNDER-RUNBOOK` §8 weekly query is wrong**: it selects `security_alerts where resolved = false`, but the column is
  `is_resolved` (`20261214000000:22`), so the founder's weekly check errors instead of counting. (Flagged, not edited.)
- **`supabase-deploy.yml` is dormant but armed** — its `workflow_run` listens for a workflow name that no longer exists,
  its push gate variable is `true`, and it deploys **`--no-verify-jwt`** for every function. Renaming CI back would
  disable JWT verification platform-wide. Delete or fix it deliberately.
- **`deploy-backend.sh` is a gate-free, bash-only path to production.**
- **Two docs disagree on the deploy flag**: `DEPLOYMENT.md` §4 says use `--include-all`; the workflow forbids it. Follow
  the workflow.
- **`AGENTS.md` references `docs/PROJECT-BLUEPRINT.md`, which does not exist** (read-order step 2 and the file map both
  point at it) — measured 2026-10-20. Its §11 also calls engineering "green" on a day the lint gate is red on `main`.

**Manual-only (no automation):** branch protection · `.com` DNS/domain switch · RazorpayX activation + account number ·
one human card payment · PayPal live keys + webhook registration · KYC provider token + Production toggle · Brevo
Authorised-IPs · legal entity + grievance contact · publishing real services and collecting reviews · rotating the leaked
webhook secret · any data restore.

**Cost / time:** green CI ≈ 22 min (90 at worst); the element audit re-downloads Chrome and rebuilds on every run
(artifacts are not reused because `server.js` needs `dist/` on disk); every backend deploy redeploys 33 functions
serially; the pentest and surface audit create and destroy real accounts on every backend push, and `ledger_entries`
keeps probe rows (B9: 147 rows, `platform_revenue` 0) because `delete_user_all_data` does not cascade text-keyed ledger
rows; `npm test` is single-worker on Windows by design.

**Do not assume:** that a green check ran the thing (this repo has shipped green jobs whose guard never executed); that a
red deploy means nothing deployed (post-deploy stages fail *after* the change is live); that CI blocks a merge; that the
live DB matches the repo body-wise; that tests touch a database; that an empty table proves an RLS policy; that email
works; that money can leave the platform; that numbers in `docs/` are current; that the working tree is clean or `main`
is green (on 2026-10-20 neither was).

---

## 12. Definition of Done (copy for any change)

**Before push**

- [ ] Business rules intact: flat 5% (client-side, above price), ₹299 single plan, free packaging, free client AI,
      **merit-based ranking** (`is_pro` in no scoring path), payout fee shown separately.
- [ ] Security Principles §1-§9 walked against the diff (server-derived amounts, `SECURITY DEFINER`-only money writes,
      fail-closed webhooks, server-side admin checks, `CRON_SECRET`, identity from `auth.getUser()`, every DB change in a
      migration, RLS SELECT audited, money-RPC checklist).
- [ ] `npm run verify` clean — typecheck, **lint** (currently the red gate on `main`), tests, build; plus
      `npm test -- sqlMigrationSyntax` for any `.sql` and `npm test -- ciGuardrails` for any workflow edit.
- [ ] Targeted proof per §2: element audit for UI, preflight for config, dry-run + pentest for money migrations.
- [ ] No secret, digest, token or test artifact in the diff; untracked files checked.
- [ ] `npm run docs:map` if structure changed (`docs:check` clean); `CLAUDE.md` dated entry with **measured** numbers;
      `LAUNCH-READINESS` if a blocker moved; `FOUNDER-RUNBOOK` if an operator step changed; this file if a gate, harness
      or secret changed.

**After push**

- [ ] Frontend **and** backend pushed together; SHA recorded.
- [ ] CI: each job's conclusion + run id (typecheck, lint, unit+build, element audit — including whether it was skipped).
- [ ] Backend Deploy: each **stage's** conclusion, not just the run's; Vercel state checked (not visible from this repo).
- [ ] Live verification with a command and numbers, not an impression.
- [ ] If something failed: say whether the change is **live and unverified** or **not deployed at all**.

**Deploy report format**

```text
Changed:      <one line per behaviour change>
Commit:       <sha>  pushed: yes/no  branch: main
CI:           <run id>  typecheck=<c> lint=<c> unit+build=<c> element-audit=<c|skipped>
Backend:      <run id>  drift-pre=<c> push=<c> drift-post=<c> functions=<c> pentest=<c> surface=<c>
Vercel:       <state / url>
Verified:     <command> → <numbers>      (one line per claim)
Not verified: <what you did not measure, and why>
Rollback:     <revert sha | forward migration | unset secret>
Open risks:   <alerts, blockers, §11 gap ids>
```

---

### Derived from

`.github/workflows/ci.yml` · `backend-deploy.yml` · `supabase-check.yml` · `supabase-deploy.yml` · `package.json` ·
`vitest.config.ts` · `vite.config.ts` · `scripts/build.mjs` · `scripts/founder-preflight.mjs` ·
`scripts/security-audit.mjs` · `scripts/deploy-backend.sh` · `scripts/e2e/**` (19 files) · `src/test/**` (51 files) ·
`supabase/config.toml` · `supabase/functions/_shared/site.ts` · `20261214000000_security_drift_monitor.sql` ·
`pages/+client.ts` · `pages/+Layout.tsx` · `src/pages/StatusPage.tsx` · `vercel.json` · `server.js` · `.env.example` ·
`.gitignore` · `AGENTS.md` · `CLAUDE.md` · `DEPLOYMENT.md` · `docs/FOUNDER-RUNBOOK.md` · `docs/LAUNCH-READINESS.md` ·
`docs/LAUNCH-REVIEW-2026-10-20.md` · `docs/UI-ELEMENT-AUDIT-REPORT.md` · `docs/blueprint/INVENTORY.md`.
