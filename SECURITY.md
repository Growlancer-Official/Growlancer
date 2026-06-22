# Security Guidelines

## Secrets Handling
- Never commit `.env` or any secret-bearing file.
- Keep only `.env.example` in source control with placeholder values.
- Use the Supabase public anon key in frontend env vars.
- Never place Supabase `service_role` keys in frontend code or client-side env.

## Auth and Authorization
- Do not use `user_metadata` for authorization decisions.
- Role checks must use server-controlled profile/app metadata plus database policies.
- Restrict signup roles to `freelancer` and `client`; `admin` must be assigned out-of-band.

## Launch Checklist
- Run lint, typecheck, tests, and build before every release.
- Rotate secrets immediately if they are exposed in logs or version control.
- Validate Supabase RLS policies for all exposed tables and RPCs.
