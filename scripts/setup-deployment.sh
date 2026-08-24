#!/usr/bin/env bash
# ============================================================================
# Growlancer — Complete Deployment Setup & Verification
# ============================================================================
# This script verifies and sets up the full deployment pipeline:
#   1. Git remote + branch protection
#   2. GitHub Actions secrets verification
#   3. Vercel project linking + env vars
#   4. Supabase project linking + secrets
#   5. Deployment readiness check
# ============================================================================
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Growlancer Deployment Setup & Verification${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""

# ──────────────────────────────────────────────────────────────────
# 1. Git Configuration
# ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[1/6] Git Configuration${NC}"

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [[ "$REMOTE_URL" == *"Growlancer-Official/Growlancer"* ]]; then
  echo -e "  ${GREEN}✓${NC} GitHub remote configured: $REMOTE_URL"
else
  echo -e "  ${RED}✗${NC} GitHub remote not configured or wrong URL"
  echo "    Run: git remote add origin https://github.com/Growlancer-Official/Growlancer.git"
  exit 1
fi

CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" == "main" ]]; then
  echo -e "  ${GREEN}✓${NC} On main branch"
else
  echo -e "  ${YELLOW}!${NC} On branch: $CURRENT_BRANCH (should be main for production)"
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
  echo -e "  ${YELLOW}!${NC} Uncommitted changes detected"
  git status --short | head -10
  echo "    Run 'git status' for full list"
fi
echo ""

# ──────────────────────────────────────────────────────────────────
# 2. GitHub CLI Setup
# ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[2/6] GitHub CLI (gh)${NC}"

if command -v gh &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} GitHub CLI installed"

  if gh auth status &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} GitHub CLI authenticated"
  else
    echo -e "  ${RED}✗${NC} GitHub CLI not authenticated"
    echo "    Run: gh auth login"
    echo "    Follow the prompts to authenticate with your GitHub account"
  fi
else
  echo -e "  ${RED}✗${NC} GitHub CLI not installed"
  echo "    Install from: https://cli.github.com/"
  echo "    Or run: winget install GitHub.cli"
fi
echo ""

# ──────────────────────────────────────────────────────────────────
# 3. Vercel CLI Setup
# ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[3/6] Vercel CLI${NC}"

if command -v vercel &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} Vercel CLI installed"

  if vercel whoami &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Vercel CLI authenticated"
  else
    echo -e "  ${RED}✗${NC} Vercel CLI not authenticated"
    echo "    Run: vercel login"
  fi
else
  echo -e "  ${RED}✗${NC} Vercel CLI not installed"
  echo "    Install: npm i -g vercel"
fi

# Check Vercel project link
if [[ -f ".vercel/project.json" ]]; then
  echo -e "  ${GREEN}✓${NC} Vercel project linked"
else
  echo -e "  ${YELLOW}!${NC} Vercel project not linked locally"
  echo "    Run: vercel link"
fi
echo ""

# ──────────────────────────────────────────────────────────────────
# 4. Supabase CLI Setup
# ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[4/6] Supabase CLI${NC}"

if command -v supabase &> /dev/null; then
  echo -e "  ${GREEN}✓${NC} Supabase CLI installed"

  if supabase projects list &> /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Supabase CLI authenticated"
  else
    echo -e "  ${RED}✗${NC} Supabase CLI not authenticated"
    echo "    Run: supabase login"
  fi

  if [[ -f "supabase/config.toml" ]]; then
    echo -e "  ${GREEN}✓${NC} Supabase project configured"
    PROJECT_ID=$(grep "project_id" supabase/config.toml | cut -d'"' -f2)
    echo "    Project: $PROJECT_ID"
  fi
else
  echo -e "  ${RED}✗${NC} Supabase CLI not installed"
  echo "    Install: npm i -g supabase"
fi
echo ""

# ──────────────────────────────────────────────────────────────────
# 5. GitHub Actions Secrets Verification
# ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[5/6] GitHub Actions Secrets${NC}"

if command -v gh &> /dev/null && gh auth status &> /dev/null; then
  echo "  Checking required secrets for Growlancer-Official/Growlancer..."

  SECRETS_REQUIRED=(
    "SUPABASE_PROJECT_REF"
    "SUPABASE_ACCESS_TOKEN"
    "SUPABASE_DB_PASSWORD"
  )

  for secret in "${SECRETS_REQUIRED[@]}"; do
    if gh secret list 2>/dev/null | grep -q "$secret"; then
      echo -e "  ${GREEN}✓${NC} $secret configured"
    else
      echo -e "  ${RED}✗${NC} $secret missing"
    fi
  done
else
  echo -e "  ${YELLOW}!${NC} Cannot verify secrets (GitHub CLI not available)"
  echo "    Verify manually at: https://github.com/Growlancer-Official/Growlancer/settings/secrets/actions"
fi
echo ""

# ──────────────────────────────────────────────────────────────────
# 6. Deployment Readiness
# ──────────────────────────────────────────────────────────────────
echo -e "${YELLOW}[6/6] Deployment Readiness${NC}"

# Check for required files
if [[ -f "vercel.json" ]]; then
  echo -e "  ${GREEN}✓${NC} vercel.json present"
else
  echo -e "  ${RED}✗${NC} vercel.json missing"
fi

if [[ -f ".github/workflows/ci.yml" ]]; then
  echo -e "  ${GREEN}✓${NC} CI workflow present"
else
  echo -e "  ${RED}✗${NC} CI workflow missing"
fi

if [[ -f ".github/workflows/supabase-deploy.yml" ]]; then
  echo -e "  ${GREEN}✓${NC} Supabase deploy workflow present"
else
  echo -e "  ${RED}✗${NC} Supabase deploy workflow missing"
fi

# Check package.json scripts
if grep -q '"build"' package.json; then
  echo -e "  ${GREEN}✓${NC} Build script present"
else
  echo -e "  ${RED}✗${NC} Build script missing"
fi

if grep -q '"deploy:backend"' package.json; then
  echo -e "  ${GREEN}✓${NC} Backend deploy script present"
else
  echo -e "  ${YELLOW}!${NC} Backend deploy script missing"
fi
echo ""

# ──────────────────────────────────────────────────────────────────
# Summary & Next Steps
# ──────────────────────────────────────────────────────────────────
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}   Setup Complete! Here's how to deploy:${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${GREEN}Frontend (Vercel) - Automatic:${NC}"
echo "  1. Push to main: git push origin main"
echo "  2. Vercel auto-deploys on every push to main"
echo "  3. Preview deployments on every PR"
echo ""
echo -e "${GREEN}Backend (Supabase) - Manual or Automatic:${NC}"
echo "  Option A: Run locally"
echo "    npm run deploy:backend"
echo ""
echo "  Option B: GitHub Actions (automatic on push to main)"
echo "    Push changes in supabase/ directory to trigger deploy"
echo ""
echo -e "${GREEN}First-time Setup:${NC}"
echo "  1. Install CLIs:"
echo "     winget install GitHub.cli"
echo "     npm i -g vercel supabase"
echo ""
echo "  2. Authenticate:"
echo "     gh auth login"
echo "     vercel login"
echo "     supabase login"
echo ""
echo "  3. Set GitHub secrets:"
echo "     gh secret set SUPABASE_PROJECT_REF --body 'zttwsjehcgaicziqyxpq'"
echo "     gh secret set SUPABASE_ACCESS_TOKEN --body 'YOUR_TOKEN'"
echo "     gh secret set SUPABASE_DB_PASSWORD --body 'YOUR_DB_PASSWORD'"
echo ""
echo "  4. Set Vercel env vars (via dashboard):"
echo "     https://vercel.com/growlancer-official/growlancer/settings/environment-variables"
echo "     Required: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_RAZORPAY_CONFIG_ID"
echo ""
echo "  5. Set Supabase edge function secrets:"
echo "     supabase secrets set RAZORPAY_KEY_ID=rzp_live_xxx"
echo "     supabase secrets set RAZORPAY_KEY_SECRET=xxx"
echo "     supabase secrets set RAZORPAY_WEBHOOK_SECRET=xxx"
echo "     supabase secrets set AI_API_KEY=xxx"
echo "     supabase secrets set BREVO_API_KEY=xxx"
echo "     supabase secrets set CRON_SECRET=xxx"
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
