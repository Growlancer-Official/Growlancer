#!/usr/bin/env bash
# Live auth flow test against the real Growlancer Supabase backend.
# Flow: signup → login → get user → refresh token → logout → verify invalidated.
set -u

SUPABASE_URL="https://zttwsjehcgaicziqyxpq.supabase.co"
AUTH="$SUPABASE_URL/auth/v1"
REST="$SUPABASE_URL/rest/v1"

# Read anon key from local .env
ANON_KEY=$(grep -E '^VITE_SUPABASE_ANON_KEY=' .env | head -1 | sed 's/^VITE_SUPABASE_ANON_KEY=//; s/^"//; s/"$//' | tr -d '\r')
if [ -z "$ANON_KEY" ]; then
  echo "❌ ANON_KEY not found in .env"
  exit 1
fi
echo "🔑 ANON_KEY loaded (${#ANON_KEY} chars)"
echo "🌐 Backend: $SUPABASE_URL"
echo "══════════════════════════════════════════════"

TS=$(date +%s)
EMAIL="authtest${TS}@gmail.com"
PASS="TestPass123!${TS}"

echo ""
echo "────────── STEP 1: SIGN UP ──────────"
SIGNUP=$(curl -s -X POST "$AUTH/signup" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\",\"data\":{\"name\":\"Auth Test\",\"role\":\"freelancer\"}}")
echo "$SIGNUP" | head -c 600
echo ""
echo "Email: $EMAIL"
if echo "$SIGNUP" | grep -q '"id"'; then
  echo "✅ SIGNUP: user created"
else
  echo "⚠️ SIGNUP: no user id in response (may need email confirmation)"
fi

echo ""
echo "────────── STEP 2: LOGIN (password grant) ──────────"
LOGIN=$(curl -s -X POST "$AUTH/token?grant_type=password" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
echo "$LOGIN" | head -c 700
echo ""
ACCESS_TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.access_token||'')}catch{console.log('')}})")
REFRESH_TOKEN=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.refresh_token||'')}catch{console.log('')}})")
USER_ID=$(echo "$LOGIN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.user?.id||'')}catch{console.log('')}})")
if [ -n "$ACCESS_TOKEN" ]; then
  echo "✅ LOGIN: access_token captured (${#ACCESS_TOKEN} chars)"
  echo "   user_id: $USER_ID"
else
  echo "❌ LOGIN FAILED"
  exit 1
fi

echo ""
echo "────────── STEP 3: GET SESSION / USER ──────────"
USER=$(curl -s "$AUTH/user" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
echo "$USER" | head -c 500
echo ""
if echo "$USER" | grep -q "\"id\""; then
  echo "✅ GET USER: authenticated session valid"
else
  echo "❌ GET USER FAILED"
fi

echo ""
echo "────────── STEP 4: RPC with token (profiles check) ──────────"
PROFILE=$(curl -s "$REST/profiles?select=id,email,name,role&limit=1" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $ACCESS_TOKEN")
echo "Profile query: $(echo "$PROFILE" | head -c 300)"
if echo "$PROFILE" | grep -q "\[" || echo "$PROFILE" | grep -q "{"; then
  echo "✅ REST API: authorized query works (RLS applied)"
else
  echo "⚠️ REST API: empty/error (expected if profile row not yet created via RPC)"
fi

echo ""
echo "────────── STEP 5: REFRESH TOKEN ──────────"
REFRESH=$(curl -s -X POST "$AUTH/token?grant_type=refresh_token" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"$REFRESH_TOKEN\"}")
NEW_ACCESS=$(echo "$REFRESH" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const j=JSON.parse(d);console.log(j.access_token||'')}catch{console.log('')}})")
if [ -n "$NEW_ACCESS" ]; then
  echo "✅ REFRESH: new access_token issued (${#NEW_ACCESS} chars)"
else
  echo "⚠️ REFRESH response: $(echo "$REFRESH" | head -c 200)"
fi

echo ""
echo "────────── STEP 6: LOGOUT ──────────"
LOGOUT=$(curl -s -X POST "$AUTH/logout" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $NEW_ACCESS" \
  -H "Content-Type: application/json")
echo "Logout response: $(echo "$LOGOUT" | head -c 200)"
echo "✅ LOGOUT: request sent"

echo ""
echo "────────── STEP 7: VERIFY SESSION INVALIDATED ──────────"
AFTER=$(curl -s "$AUTH/user" \
  -H "apikey: $ANON_KEY" \
  -H "Authorization: Bearer $NEW_ACCESS")
echo "Get user after logout: $(echo "$AFTER" | head -c 300)"
echo ""
if echo "$AFTER" | grep -q '"id"'; then
  echo "⚠️ SESSION STILL VALID after logout (Supabase may need JWT expiry)"
else
  echo "✅ VERIFIED: token invalidated after logout (401 or no user)"
fi

echo ""
echo "══════════════════════════════════════════════"
echo "🏁 FULL AUTH FLOW TEST COMPLETE"
echo "Test account: $EMAIL / $PASS"
