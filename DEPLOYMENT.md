# Growlancer — Deployment & Automation Runbook

How the three services (GitHub, Vercel, Supabase) connect and how changes ship. Read this once before the first automated deploy.

## 1. The pipeline at a glance

```
push to main
    │
    ├─ Vercel (GitHub integration, dashboard-managed)
    │     npm run build (scripts/build.mjs) → serves dist/ from main
    │
    ├─ GitHub Actions — CI — Regression Guard (.github/workflows/ci.yml)
    │     typecheck + lint + production build (white-screen guard)
    │
    └─ GitHub Actions — Supabase Deploy (.github/workflows/supabase-deploy.yml)
          supabase functions deploy --all   → all 26 edge functions
          supabase db push (gated)          → migrations (see §4)
```

Pull requests also trigger:
- **CI** (typecheck/lint/build), and
- **Supabase Check** (`supabase-check.yml`): `db push --dry-run` — catches SQL errors before merge (read-only, never applies).

## 2. What is already connected

| Connection | Status | How |
|---|---|---|
| GitHub → Vercel | ✅ live | Vercel project `growlancer` (id `prj_FdaxAKkah0ly5dsHOsYcU84mHWq8`) deploys `main` |
| GitHub → Supabase (CI check) | ✅ file present | `supabase-check.yml` (needs secrets — see §3) |
| GitHub → Supabase (deploy) | ✅ file present | `supabase-deploy.yml` (needs secrets + the `SUPABASE_DB_AUTO_PUSH` gate) |
| Local CLI → Supabase | ✅ live | `supabase` CLI v2.107.0 authed + linked to **`zttwsjehcgaicziqyxpq`** ("Growlancer", ap-southeast-1) |

There is a second Supabase project **`stwfjfbrzzqgshtxoixa`** (also named "Growlancer", ap-northeast-2) that is **not linked** — treat it as a possible future staging/QA environment. Do not deploy migrations to it accidentally.

## 3. One-time setup — do these once

### 3.1 Create a Supabase access token (1 min)
1. Supabase dashboard → **Account** (bottom-left avatar) → **Access Tokens** → **Generate new token**.
2. Name it `github-actions`, copy it — it's shown once.

### 3.2 Add GitHub secrets (2 min)
Repo → **Settings → Secrets and variables → Actions → Secrets**. Add:

| Name | Value |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | the token from 3.1 |
| `SUPABASE_PROJECT_REF` | `zttwsjehcgaicziqyxpq` |
| `SUPABASE_DB_PASSWORD` | the Postgres password of that project (Database → Connection, or set when the project was created) |

Then **Variables** (same page): add `SUPABASE_DB_AUTO_PUSH` = `false` (leave `false` until §4 is done; flip to `true` afterward).

### 3.3 Confirm Vercel env vars (2 min)
Vercel project → **Settings → Environment Variables** (Production). Must include:
- `VITE_SUPABASE_URL` = `https://zttwsjehcgaicziqyxpq.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = the project's anon/public key
- `VITE_APP_VERSION` (optional), `VITE_SENTRY_DSN` (optional)

> `VITE_*` vars are inlined at build time on Vercel. They are public-safe (anon key is public by design).

### 3.4 Confirm Supabase edge-function secrets (2 min)
Supabase dashboard → **Project → Edge Functions → Secrets** (or `supabase secrets set`). Must include: `GEMINI_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`, `RAZORPAY_WEBHOOK_SECRET`, `PAYPAL_*`, `ADMIN_SIGNUP_SECRET`, `CRON_SECRET`, `APP_URL`. These persist across function deploys.

### 3.5 (Recommended) Branch protection on `main`
Repo → **Settings → Branches → Add rule** for `main`: require status checks to pass (**CI — Regression Guard**), require PR review, disallow force-push. This guarantees every deploy-to-`main` already passed CI.

## 4. ⚠️ Migration-drift reconciliation (do this BEFORE flipping `SUPABASE_DB_AUTO_PUSH`)

`supabase migration list` shows the repo's migrations vs. what's applied on the live DB. **It currently shows several local files NOT yet applied remotely.** Auto-`db push` would apply them all — some are destructive or auth-affecting, so reconcile them deliberately first:

1. Run `npx supabase migration list` and note every row where the **Remote** column is blank (applied-on-push-only).
2. For each pending file, decide **apply** or **intentionally skip**:
   - `20260612_internship_applications.sql` — check whether internships were provisioned another way; if the live schema already works, skip (or rename to avoid re-applying).
   - `20260731000000_*` (add_interview_time / enable_realtime_admin_tables) — decide which of the same-prefix pair is genuinely new.
   - `20260801000000_*` trio (`admin_credentials`, **`combined_migration`**, `newsletter_subscribers`) — **`combined_migration.sql` TRUNCATEs and reseeds all 143 categories.** If applied now it re-creates category rows with new UUIDs → breaks `freelancer_profiles.category` / `project_categories` references. Only apply if you intend that reseed.
   - `20260806000000_*` pair (`credential_verification_portal` / `restore_auto_confirm_trigger`) — the auto-confirm one changes **email-verification auth behavior**. Confirm the intended live auth state first.
   - `20260831000000_add_categories_to_freelancer_profiles.sql` — adds `category` to `freelancer_profiles`; apply if the live table lacks it.
3. Apply the decided set with `npx supabase db push` (local CLI, linked to prod) — or remove/skip files you don't want by renaming them or applying only the chosen ones.
4. Re-run `npx supabase migration list` until Remote matches Local for every row you intend to keep.
5. **Only then** flip the GitHub variable `SUPABASE_DB_AUTO_PUSH` → `true`. From then on, pushes to `main` apply new migrations automatically (additive, deterministic).

> If you never want auto-migrations, leave the variable `false` — the deploy workflow will then only **dry-run** and print the pending list, and you push migrations manually.

## 5. Day-to-day workflow

- **Add a backend change:** new migration file in `supabase/migrations/` and/or edge function in `supabase/functions/`. Open a PR → CI + Supabase Check dry-run run → merge → deploy workflow applies it.
- **Add a frontend change:** push/merge to `main` → Vercel builds and ships.
- **One change often touches both:** migration + typed helper in `src/lib/supabase.ts` + React page. All in the same PR; Vercel and Supabase each pick up their side.
- **Manual deploy anytime:** repo → **Actions → Supabase Deploy → Run workflow** (deploys functions; applies migrations only if the gate variable is `true`).

## 6. Manual (offline) commands

```bash
npx supabase migration list              # drift check (Local vs Remote)
npx supabase db push                     # apply pending migrations (local CLI, prod)
npx supabase functions deploy --all      # deploy all edge functions
npx supabase functions deploy <name>     # deploy a single function
npx supabase secrets set NAME=value      # set an edge-function secret
```

## 7. Troubleshooting

- **Deploy workflow fails on `db push --dry-run`:** `SUPABASE_DB_PASSWORD` missing/incorrect, or `SUPABASE_PROJECT_REF` wrong. Verify secrets.
- **Functions deploy fails:** an edge function has a Deno compile error. Fix, commit, re-deploy. The failing function is named in the log.
- **PR dry-run never runs / fails on forks:** secrets aren't passed to fork PRs. For a private repo with same-repo PRs this is fine; if you accept forks, change the check to `if: always()`/optional.
- **Want a staging env:** link the second project (`stwfjfbrzzqgshtxoixa`) locally for QA, deploy there first, then to prod. Do not point the prod workflow at it.
