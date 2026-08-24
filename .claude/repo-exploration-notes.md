# Growlancer Repo Exploration Notes
**Generated:** 2026-08-24
**Purpose:** Internal mental model for future sessions

---

## Repository Structure

### Frontend (React/Vite)
- **Pages:** ~85 pages total across `src/pages/`, `src/pages/dashboard/`, `src/pages/admin/`, `src/pages/auth/`
- **Key areas:**
  - Client: `ClientProjectsPage`, `ClientContractsPage`, `ClientProposalsPage`, `ClientPaymentsPage`, `ClientWorkspacePage`, `ClientTeamProjectsPage`
  - Freelancer: `dashboard/ContractsPage`, `dashboard/ProposalsPage`, `dashboard/WalletPage`, `dashboard/WorkspacePage`
  - Admin: `AdminContractsPage`, `AdminDisputesPage`, `AdminFinancePage`, `AdminPaymentsPage`, `AdminWithdrawalsPage`, `AdminUsersPage`
  - Auth: `OtpLoginPage`, `MagicLinkPage`, `VerifyEmailPage`, `ForgotPasswordPage`, `ResetPasswordPage`

### Services Layer (`src/lib/`)
- ~70 service files
- **Core business logic:**
  - `payments.ts` - Payment config (Razorpay primary, PayPal disabled until live creds)
  - `razorpay.ts` - Frontend Razorpay service
  - `withdrawal.ts` - Wallet + payout methods (PayPal + RazorpayX)
  - `refundService.ts` - Refund/cancellation RPC wrappers
  - `disputeService.ts` - Dispute data access
  - `aiMatching.ts` - Category-based matching engine (NO is_pro/subscription bias)
  - `subscriptionHelpers.ts` - Pro subscription (₹299/month, single plan)
  - `teamProjects.ts` - Multi-freelancer independent contracts

### Edge Functions (`supabase/functions/`)
- **33 edge functions** including:
  - `razorpay` - Order creation, payment verification, refunds, fund accounts
  - `razorpay-webhook` - Payment event handling
  - `razorpay-payout-webhook` - Withdrawal status updates
  - `paypal` / `paypal-webhook` - PayPal integration (disabled in UI)
  - `milestone-auto-release` - Cron for delivered milestone auto-release
  - `subscription-billing-cron` - Recurring subscription billing
  - `withdrawal` - Withdrawal processing with balance validation
  - `ai-matching` - Server-side matching with semantic boost

### Migrations (`supabase/migrations/`)
- **~200 migration files** (chronological)
- Key recent migrations:
  - `20260610110000_escrow_rpcs.sql` - Core escrow functions (fund_escrow, release_escrow)
  - `20260921000000_refund_dispute_system.sql` - Full refund/cancellation/dispute system
  - `20261220000000_freelancer_full_payout_model.sql` - Client pays 5% fee, freelancer gets 100%
  - `20261221000000_fix_profiles_pii_leak.sql` - PII protection
  - `20261229000000_team_projects.sql` - Team projects feature

---

## Core Money Flow

### 1. Contract Creation
```
Client accepts proposal → create_contract_with_escrow RPC
  - Validates auth.uid() === p_client_id
  - Creates contract (status: 'pending')
  - Creates escrow row (status: 'pending')
  - Sets freelancer_amount = amount (100%, client pays 5% on top)
```

### 2. Escrow Funding (Razorpay)
```
Client pays → razorpay edge function (create_order)
  - Amount = contract.amount + 5% platform fee (server-side compute)
  - Client NEVER sends amount in request body
  - Milestone selection: amount from DB, not client

Payment success → verify_payment
  - Signature verification (Web Crypto HMAC-SHA256)
  - Idempotency guard (status check)
  - Calls fund_escrow RPC
  - Updates contract → 'active', escrow → 'funded'
```

### 3. Milestone Delivery & Release
```
Freelancer delivers → milestone.status = 'delivered', delivered_at set
Auto-release cron (hourly) →
  - Finds delivered milestones where now - delivered_at >= auto_release_hours
  - Calls auto_release_milestone RPC (SECURITY DEFINER)
  - Re-validates elapsed window in SQL (defense in depth)
  - Releases escrow to freelancer wallet

Manual release → release_escrow RPC
  - Client ownership verified
  - Escrow must be 'funded'
  - Freelancer gets 100% of escrow pool (including extra revisions)
```

### 4. Refund/Cancellation
```
Case 1 (before work): Client cancels → auto_approved → 100% refund
Case 2 (freelancer decline): Freelancer declines → auto_approved → 100% refund
Case 3 (after work start): Client cancels → pending_freelancer
  - Freelancer accepts → refund remaining escrow
  - Freelancer rejects → dispute auto-created

Refund execution: pg_cron → process_pending_refunds → razorpay edge function
  - Creates Razorpay refund via API
  - Reverses escrow
  - Records in refunds table
```

### 5. Dispute Resolution
```
Admin decides → admin_decide_dispute RPC
  - Verifies caller is admin (profiles.role = 'admin')
  - client_refund → refund to client payment method
  - freelancer_release → release escrow to freelancer wallet
  - split → partial refund + partial release
  - dismiss → contract resumes
```

### 6. Wallet Balance Updates
```
ONLY via SECURITY DEFINER RPCs:
  - update_wallet_balance (service_role only)
  - release_escrow (authenticated client, ownership verified)
  - hold_wallet_funds (authenticated user, frozen check)
  - admin_decide_dispute (admin only)

NO user-facing UPDATE RLS on wallets table
```

### 7. Withdrawal Flow
```
Freelancer requests → withdrawal edge function
  - Validates wallet balance (server-side)
  - Holds funds (balance → pending_balance)
  - Checks is_frozen (fraud guard)
  - Creates RazorpayX payout OR PayPal payout
  - Records in withdrawals table

Payout webhook → razorpay-payout-webhook
  - Updates withdrawal status
  - Releases funds to freelancer OR rolls back on failure
```

---

## Security Patterns (VERIFIED IN CODE)

### 1. Financial RPCs - Server-Side Amount Derivation ✅
- `create_order` in razorpay edge function reads amount from DB (contract.amount, subscription plan price, service package price)
- Client NEVER sends amount - only IDs/references
- Milestone amounts read from `contracts.milestones` JSONB, not client body

### 2. No User-Facing UPDATE RLS on Financial Tables ✅
- `wallets`: No UPDATE policy for authenticated/anon
- `escrow`: No UPDATE policy for authenticated/anon
- `contracts`: UPDATE policy only for cancellation fields (not amount/status)
- `transactions`: INSERT only via service_role
- All mutations via SECURITY DEFINER RPCs

### 3. Webhooks Fail-Closed ✅
- `razorpay-webhook`: Rejects if RAZORPAY_WEBHOOK_SECRET missing/invalid
- `paypal-webhook`: Rejects if PAYPAL_WEBHOOK_ID missing/invalid
- Signature verification before processing

### 4. Admin Actions - Server-Side Role Check ✅
- `admin_decide_dispute`: Checks `profiles.role = 'admin'`
- `freeze_contract`: Checks `profiles.role = 'admin'`
- `adminWithdrawal` edge function: Checks admin role

### 5. Cron Edge Functions - CRON_SECRET Verification ✅
- `milestone-auto-release`: Checks CRON_SECRET bearer token
- `subscription-billing-cron`: Checks CRON_SECRET
- `execute_refund` action in razorpay: Checks CRON_SECRET
- Fallback to DB `cron_settings.cron_secret` for rotation safety

### 6. No Client-Sent user_id in Financial Operations ✅
- All edge functions use `auth.getUser()` to get caller ID
- Ownership verified via DB query (contract.client_id, wallet.user_id)
- Request body contains resource IDs, not user_id

### 7. SECURITY DEFINER RPCs with search_path = '' ✅
- All financial RPCs use `SET search_path = ''` or `SET search_path = public`
- Prevents search-path attacks

### 8. Idempotency Guards ✅
- `verify_payment`: Checks order.status before processing
- `execute_refund`: Checks existing refunds before creating new
- `create_contract_with_escrow`: Returns existing contract if proposal already hired

### 9. Row-Level Locking for Balance Changes ✅
- `hold_wallet_funds`: `SELECT ... FOR UPDATE` on wallets
- `release_escrow`: `SELECT ... FOR UPDATE` on contracts and escrow
- `fund_escrow`: `SELECT ... FOR UPDATE` on contracts

---

## Business Model Constraints (VERIFIED IN CODE)

### 1. Platform Commission: 5% Flat ✅
- `create_contract_with_escrow`: `v_platform_fee := ROUND(p_amount * 0.05, 2)`
- `release_escrow`: `v_fee := ROUND(v_gross * 0.05, 2)`
- `_book_escrow_release`: Same 5% calculation
- Razorpay order creation: `amount + Math.round(amount * 0.05)`

### 2. Freelancer Subscription: ₹299/month, Single Plan ✅
- `subscription_plans` table has single row with `price: 299`
- No yearly/team plan UI in `ProSubscriptionPage.tsx`
- `subscriptionHelpers.ts` references single plan

### 3. Packaging Free for All ✅
- Services have `packages` JSONB (Basic/Standard/Premium)
- No subscription check in service creation/access
- `CreateServicePage.tsx` allows all freelancers to create packages

### 4. Ranking/Matching - Merit-Based Only ✅
- `aiMatching.ts`: Score calculation uses category, skills, experience, budget, availability
- `is_pro` is queried but NOT used in score calculation
- Weight: category(45%) + skills(20%) + exp(15%) + budget(12%) + availability(8%)
- NO `is_pro` or subscription status in sort/filter

### 5. Client AI Features - No Paywall ✅
- `ClientAIAssistantPage.tsx` accessible to all clients
- Rate limiting via backend (fair-use protection)
- No subscription check

### 6. Team Projects - Independent Contracts ✅
- Each role has separate contract with own escrow/milestones
- `teamProjects.ts` creates independent contracts
- 5% commission per individual contract
- No separate "team fee"

---

## UI/UX Patterns

### Existing Component Library
- **Toast:** `Toast.tsx` (not native alert)
- **Confirmation:** `ConfirmModal.tsx` (not window.confirm)
- **Modals:** Modal components in `src/components/`
- **Tailwind CSS:** Standard utility classes
- **Error handling:** Always console.error + user-facing toast

### Page Structure
- Dashboard pages use consistent layout pattern
- Admin pages use `AdminDashboard.tsx` layout
- Real-time subscriptions via `supabase.channel()` pattern

---

## Pending Items (from CLAUDE.md)

⚠️ Currency-consistency prep (multi-currency future)
⚠️ Team-project freelancer notification/accept-step

---

## Key Files to Reference

### Security-Critical
- `supabase/migrations/20260921000000_refund_dispute_system.sql`
- `supabase/migrations/20261220000000_freelancer_full_payout_model.sql`
- `supabase/functions/razorpay/index.ts`
- `supabase/functions/milestone-auto-release/index.ts`

### Business Logic
- `src/lib/aiMatching.ts`
- `src/lib/refundService.ts`
- `src/lib/withdrawal.ts`
- `src/lib/subscriptionHelpers.ts`

### Frontend Patterns
- `src/pages/dashboard/WalletPage.tsx`
- `src/pages/ClientWorkspacePage.tsx`
- `src/components/Toast.tsx`
- `src/components/ConfirmModal.tsx`
