#!/usr/bin/env bash
# ============================================================================
# Growlancer — Local Supabase Backend Deploy
# ----------------------------------------------------------------------------
# Applies ALL pending migrations and deploys ALL edge functions to production
# directly from this machine. This is the REPLACEMENT for the GitHub Actions
# "Supabase Deploy" workflow (which was removed) — backend changes are now
# shipped from here, so the GitHub pipeline only guards the frontend.
#
# Usage:  npm run deploy:backend
# ============================================================================
set -euo pipefail

PROJECT_REF="zttwsjehcgaicziqyxpq"   # Growlancer production project

echo "==> [1/2] Applying pending migrations to production..."
supabase db push --linked

echo "==> [2/2] Deploying all edge functions (no Docker needed, server-side bundling)..."
supabase functions deploy --project-ref "$PROJECT_REF" --use-api

echo ""
echo "==> ✔ Backend deploy complete — migrations applied + edge functions live."
echo "    DB:        https://supabase.com/dashboard/project/$PROJECT_REF"
