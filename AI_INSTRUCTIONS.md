# Growlancer Permanent AI Development Instructions

These instructions apply to every future task in this repository.
Never ignore them.

================================================

## PROJECT

- **Project Name:** Growlancer
- **Type:** AI Powered Freelancing Marketplace
- **Stage:** Early Stage Startup
- **Primary Country:** India
- **Backend:** Supabase
- **Frontend:** React + TypeScript + Vite
- **Deployment:** Vercel
- **Payments:** Razorpay (India), PayPal (International)

================================================

## GENERAL RULES

- Read the entire related file before modifying anything
- Understand how it connects to the rest of the application
- Never modify code blindly
- Never remove functionality unless specifically requested
- Never rewrite working code unnecessarily
- Prefer improving existing code over replacing it
- Always preserve: architecture consistency, folder structure, naming conventions, TypeScript types, responsive behavior, accessibility

================================================

## QUALITY

- Write production-quality code only
- No placeholders, no fake data, no dummy implementations
- No TODOs unless absolutely necessary
- No console.log left in production
- No duplicated logic
- Reuse existing utilities whenever possible
- Keep code modular and components reusable
- Follow SOLID principles whenever possible

================================================

## SECURITY

- Never expose secrets, hardcode API keys, or expose service role keys
- Never bypass authentication or authorization
- Never disable RLS
- Never expose database IDs unnecessarily
- Never trust frontend validation — always validate on server
- Use secure UUIDs
- Prevent brute-force attacks
- Protect against XSS, SQL Injection, CSRF

================================================

## LEGAL & ETHICAL

- Growlancer is currently an early-stage startup
- Never generate fake: certifications, company seals, legal claims, ISO/SOC/Govt approvals, trademark registrations
- Only use information that actually exists
- Design everything so future legal assets can be added without code changes

================================================

## STARTUP MODE

- India-first startup
- Udyam Registered
- Not yet incorporated as a Private Limited company
- Do not design as if enterprise certifications already exist
- Keep everything honest and scalable

================================================

## DESIGN

- Use: White, Black, Growlancer Green
- Modern, Minimal, Professional, Enterprise style
- Avoid unnecessary gradients and flashy animations
- Use subtle animations
- Keep interfaces clean

================================================

## DATABASE

- Never delete tables without explicit instruction
- Never delete migrations
- Prefer migrations over manual schema edits
- Maintain referential integrity, RLS, and indexes

================================================

## ADMIN PANEL

- Admin actions should always be logged
- Support future scalability
- Every destructive action should require confirmation
- Prefer soft delete where appropriate

================================================

## CERTIFICATES

- Certificates and LORs must always be verifiable
- Support QR regeneration, version history, audit logs
- Support credential revocation and replacement
- Never expose sensitive user information publicly

================================================

## PERFORMANCE

- Avoid unnecessary re-renders
- Lazy load heavy pages
- Optimize images and queries
- Keep bundle size reasonable

================================================

## ERROR HANDLING

- Never fail silently
- Always return meaningful errors
- Display user-friendly messages
- Log unexpected failures

================================================

## WHEN MODIFYING CODE

**Before coding:** Explain what will change
**After coding:** Summarize — files modified, why they changed, potential side effects, testing performed

================================================

## WHEN UNSURE

- Never guess
- Inspect the repository
- Trace dependencies
- If information is missing, leave a clear review note instead of inventing functionality

================================================

## GOAL

Every modification should move Growlancer closer to a secure, scalable, maintainable, production-ready software platform suitable for long-term growth.

If a requested change could introduce a security, legal, data integrity, or architectural risk, explain the risk first and then propose the safest implementation instead of making the change blindly.
