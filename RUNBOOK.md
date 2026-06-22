# Production Runbook

## Preconditions
- Required env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Quality gates must pass: lint, typecheck, test, build
- Confirm Supabase RLS and RPC policies are reviewed before release

## Release Procedure
1. Install deps: `npm ci`
2. Verify: `npm run lint && npm run typecheck && npm run test && npm run build`
3. Deploy static bundle from `dist/`
4. Smoke-check critical routes: `/`, `/login`, `/signup`, `/dashboard`, `/client`

## Incident Response
- Triage user impact and affected surface area
- Check browser console errors and telemetry logs for error boundary events
- Validate Supabase auth health and API latency
- If auth/session failures spike, disable new releases and roll back immediately

## Rollback
1. Redeploy previous known-good artifact
2. Verify health by loading login and one protected dashboard route
3. Confirm new sessions can sign in and existing sessions refresh
4. Announce rollback completion and begin root-cause analysis

## Post-Incident
- Record timeline, customer impact, and permanent fix
- Add or update automated test covering failure mode
