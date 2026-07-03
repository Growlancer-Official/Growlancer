# GitHub Actions — Auto Deploy to Vercel

Har push to `master` branch automatically deploys to **https://growlancer.vercel.app**.

## Required GitHub Secrets

Ye 4 secrets **GitHub repo → Settings → Secrets and variables → Actions** me add karne hain:

| Secret | Value | Kaise Milega |
|---|---|---|
| `VERCEL_TOKEN` | `xxx...` | Vercel Dashboard → Settings → Tokens → Create Token |
| `VERCEL_ORG_ID` | `team_iLKX3SP9BgKNytQXE0wimBqG` | `.vercel/project.json` me `orgId` field |
| `VERCEL_PROJECT_ID` | `prj_efmbGyzV9QxRXr4An7wlojDd1hcy` | `.vercel/project.json` me `projectId` field |
| `VITE_SUPABASE_URL` | `https://zttwsjehcgaicziqyxpq.supabase.co` | Project ke `.env` file se |
| `VITE_SUPABASE_ANON_KEY` | `eyJhbGciOi...` | Project ke `.env` file se |

## Steps to Enable

1. **Vercel Token banao**: https://vercel.com/account/tokens → "Create Token"
2. **GitHub Secrets me daalo**: Repo → Settings → Secrets and variables → Actions → New repository secret
3. **Push karo master pe**: Auto-deploy start ho jayega
4. **Manual bhi run kar sakte ho**: GitHub → Actions → "Deploy to Vercel Production" → Run workflow

## Verify

After setup, push karo aur check karo:
- GitHub Actions tab me workflow running dikhega
- Success ke baad https://growlancer.vercel.app pe latest code live hoga
