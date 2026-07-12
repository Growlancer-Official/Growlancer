# GitHub Actions — Growlancer CI/CD Pipeline

## Pipeline Overview

Har push to `main` ya `master` branch triggers the **full pipeline**:

```
push → main/master
  │
  ├── 1️⃣ Quality Check (Lint + Typecheck)
  │
  ├── 2️⃣ Deploy Frontend → Vercel Production (prebuilt)
  │     └── Auto-alias to growlancer.vercel.app
  │
  └── 3️⃣ Deploy Edge Functions → Supabase (23 functions)
```

**PR checks:** Lint + typecheck only (no deploy)
**Manual trigger (`workflow_dispatch`):** Full pipeline + DB migrations

## Required GitHub Secrets

Ye secrets **GitHub repo → Settings → Secrets and variables → Actions** me add karne hain:

### Vercel Secrets
| Secret | Value | Kaise Milega |
|---|---|---|
| `VERCEL_TOKEN` | `xxx...` | Vercel Dashboard → Settings → Tokens → Create Token |

### Supabase Secrets
| Secret | Value | Kaise Milega |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | `sbp_xxx...` | Supabase Dashboard → Settings → API → Access Tokens → Generate |
| `SUPABASE_DB_PASSWORD` | `xxx...` | Project password (set during project creation) |

### App Secrets
| Secret | Value | Kaise Milega |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://zttwsjehcgaicziqyxpq.supabase.co` | `.env` file ya Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | `.env` file ya Supabase Dashboard → Settings → API |
| `VITE_SENTRY_DSN` | `https://...` | Sentry Dashboard → Settings → Client Keys (DSN) — Optional |

> **Note:** `VERCEL_ORG_ID` aur `VERCEL_PROJECT_ID` ki zaroorat nahi — Vercel CLI auto-detect karta hai linked project.

## Steps to Enable

### 1. Vercel Token banao
https://vercel.com/account/tokens → "Create Token"

### 2. Supabase Access Token banao
Supabase Dashboard → Settings → API → Access Tokens → "Generate New Token"

### 3. GitHub Secrets me daalo
Repo → Settings → Secrets and variables → Actions → New repository secret

**Zaroori secrets:**
- `VERCEL_TOKEN`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 4. Push karo main pe
Auto-deploy start ho jayega! 🚀

### 5. Manual run
GitHub → Actions → "Growlancer CI/CD" → Run workflow
- Isme DB migrations bhi apply hote hain (sirf manual trigger pe)

## Verify

After setup, push karo aur check karo:
- GitHub Actions tab me workflow running dikhega
- Success ke baad https://growlancer.vercel.app pe latest code live hoga
- Edge functions bhi update ho jayenge

## Workflow Structure

```yaml
Jobs:
  quality          → Lint + TypeScript check (always runs)
  deploy-frontend   → Build + Vercel deploy (push/manual only)
  deploy-edge-fn    → Deploy 23 Supabase edge functions (push/manual only)
  deploy-db         → DB migrations (manual only — safety)
  notify            → Failure notification (if any job fails)
```

> **DB Migrations:** Sirf manual trigger pe hote hain taake accidental schema changes na ho.
> Chahiye to push pe bhi enable kar sakte hain — `if:` condition hata do.
