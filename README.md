# Growlancer

AI-powered freelancing marketplace platform.

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, TailwindCSS
- **Backend**: Supabase (Auth, Database, Realtime, Storage)
- **State Management**: Zustand
- **Routing**: React Router DOM
- **Payments**: PayPal (client funding / freelancer payouts—verify Edge Functions + env in each environment)

## Project Structure

```
src/
├── app/           # Application root and routing
├── components/    # Reusable UI components
├── features/      # Feature-based modules
├── hooks/         # Custom React hooks
├── layouts/       # Page layouts
├── lib/           # Utilities and configurations
├── pages/         # Route pages
├── services/      # API and external services
├── styles/        # Global styles and Tailwind
└── types/         # TypeScript type definitions
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your Supabase credentials.

3. Start development server:
   ```bash
   npm run dev
   ```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run build:check` - Typecheck then production build (recommended before release)
- `npm run preview` - Preview production build
- `npm run typecheck` - TypeScript only
- `npm run test` - Vitest + coverage
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues
- `npm run format` - Format code with Prettier

## Realtime (Supabase)

The UI subscribes to `postgres_changes` on workflow tables (messages, contracts, invites, etc.). **Those tables must be part of the `supabase_realtime` publication** on your Supabase project, or browsers will never receive live events.

- Run migrations (includes `*_enable_realtime_workflow_tables.sql`) via `supabase db push` or paste the SQL in the Supabase SQL editor.
- Workflow ↔ table map for engineers: `src/lib/realtimeWorkflow.ts`

## Product status (pre-launch)

The app is a **working React + Supabase codebase** with public marketing pages, auth, freelancer and client dashboard areas, contracts/workspace/payments surfaces, PayPal-related flows, referrals, subscriptions UI, and CI (lint, typecheck, test, build, audit). Treat marketing copy and aggregate numbers as **honest for your stage** (see About page + `public/platform-metrics.json` for non-user metrics you control).

**Next priorities for a clean launch** (typical order):

1. **RLS & data** — Review every table’s policies for anon vs authenticated; add minimal `platform_metrics` or Edge aggregation only when you are ready to expose numbers publicly.
2. **Core path QA** — Run end-to-end checks on: project → proposal → contract → workspace → escrow/PayPal happy paths (and failure/cancel).
3. **Observability** — Set `VITE_SENTRY_DSN` in production; confirm Supabase logs/alerts for Edge Functions (e.g. PayPal).
4. **Legal & trust** — Keep Terms/Privacy/Cookies aligned with what you actually ship; bump dates only when content changes (see legal tooling in repo).

## Platform workflow (target)

1. Client posts project
2. AI matches freelancers
3. Client invites freelancers
4. Freelancer accepts or bids
5. Client hires
6. Contract created
7. Escrow funded (PayPal)
8. Work begins
9. Work delivered
10. Client approves
11. Payment released
12. Review

---

**Note**: Growlancer is **pre-launch**; depth of automation and payment coverage should match what is deployed and tested in your Supabase project—iterate in small vertical slices on the workflow above.
