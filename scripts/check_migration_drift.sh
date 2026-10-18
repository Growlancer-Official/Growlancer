#!/usr/bin/env bash
set -euo pipefail
cd "C:/Users/mdmir/Documents/GROWLANCER"

echo "=== 1. Remote schema_migrations (versions present) ==="
REMOTE_LIST=$(npx supabase migration list --linked --project-ref zttwsjehcgaicziqyxpq 2>&1)
echo "$REMOTE_LIST" | grep '`' | awk -F'`' '{print $2}' | sort > /tmp/remote_versions.txt
echo "Remote count: $(wc -l < /tmp/remote_versions.txt)"
echo ""

echo "=== 2. Locally — build fresh DB from scratch ==="
rm -f /tmp/growlancer_fresh_local 2>/dev/null || true
mkdir -p /tmp/growlancer_fresh_local
echo "Creating fresh local DB from all migrations ..."
LOCAL_RESET_OUT=$(npx supabase db reset --no-seed --local 2>&1) || true
echo "$LOCAL_RESET_OUT" | tail -5
echo ""

echo "=== 3. Extract applied versions from FRESH local DB ==="
LOCAL_LIST=$(npx supabase migration list --local 2>&1)
echo "$LOCAL_LIST" | grep '`' | awk -F'`' '{print $2}' | sort > /tmp/local_fresh_versions.txt
echo "Fresh local count: $(wc -l < /tmp/local_fresh_versions.txt)"
echo ""

echo "=== 4. DIFF: remote vs fresh-local (should be IDENTICAL) ==="
echo "--- In remote but NOT in fresh-local (drift remote→local) ---"
comm -23 /tmp/remote_versions.txt /tmp/local_fresh_versions.txt || true
echo ""
echo "--- In fresh-local but NOT in remote (drift local→remote) ---"
comm -13 /tmp/remote_versions.txt /tmp/local_fresh_versions.txt || true
echo ""

echo "=== 5. Compare Versions sets (exit 0 = identical, exit 1 = diff) ==="
 DIFFERENCE=$(comm -3 /tmp/remote_versions.txt /tmp/local_fresh_versions.txt | grep -v '^$')
if [ -z "$DIFFERENCE" ]; then
  echo "✅ REMOTE and FRESH-LOCAL have IDENTICAL migration sets."
else
  echo "❌ MISMATCH found:"
  echo "$DIFFERENCE"
fi
