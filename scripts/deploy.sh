#!/bin/bash
# Deploy to Vercel Production + Auto-alias to growlancer.vercel.app
# Usage: bash scripts/deploy.sh

set -e

echo "🔨 Building project..."
npm run build

echo "🚀 Deploying to Vercel Production..."
DEPLOY_OUTPUT=$(npx vercel --prod --yes 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract the deployment URL from the output
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9.-]+\.vercel\.app' | tail -1)

if [ -n "$DEPLOY_URL" ]; then
  echo "🔗 Aliasing $DEPLOY_URL → growlancer.vercel.app"
  npx vercel alias "$DEPLOY_URL" growlancer.vercel.app 2>&1
  if [ $? -eq 0 ]; then
    echo "✅ Deploy complete! https://growlancer.vercel.app is now live with latest changes."
  else
    echo "⚠️  Alias may have been set already or encountered an issue."
    echo "   Check: https://growlancer.vercel.app"
  fi
else
  echo "❌ Could not extract deployment URL. Manual alias may be needed."
  echo "   Run: npx vercel alias <deployment-url> growlancer.vercel.app"
fi
