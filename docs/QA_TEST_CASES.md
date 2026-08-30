# Growlancer — Phase 2: E2E Workflow Test Cases

## Test Case Format
| Field | Description |
|---|---|
| Test ID | Unique identifier |
| Module | Feature area |
| Preconditions | What must be true before test |
| Steps | Exact steps to execute |
| Expected Result | What should happen |
| Status | Pass / Fail / Blocked |

---

## 2.1 Authentication & Account Access

### TC-AUTH-01: Email/Password Signup (Freelancer)
- **Preconditions:** No existing account with test email
- **Steps:**
  1. Navigate to homepage → Click "Sign up"
  2. Enter name, email, password → Select "Freelancer" role
  3. Accept terms → Click "Create Account"
  4. Check email for verification link → Click link
  5. Verify redirected to email-confirm page
  6. Return to original tab → Click "I've verified, continue"
- **Expected:** User lands on /onboarding with role pre-selected as Freelancer
- **Status:** ⬜

### TC-AUTH-02: Email/Password Signup (Client)
- **Preconditions:** No existing account with test email
- **Steps:**
  1. Same as TC-AUTH-01 but select "Client" role
- **Expected:** User lands on /onboarding with role pre-selected as Client
- **Status:** ⬜

### TC-AUTH-03: OAuth Signup — GitHub (Freelancer)
- **Preconditions:** GitHub account not linked to Growlancer
- **Steps:**
  1. Click "Continue with GitHub" on signup
  2. Authorize on GitHub → Redirect back to /auth/callback
  3. Country gate appears → Select "India"
  4. Complete onboarding
- **Expected:** User lands on /dashboard (freelancer)
- **Status:** ⬜

### TC-AUTH-04: OAuth Signup — LinkedIn (Client)
- **Preconditions:** LinkedIn account not linked
- **Steps:**
  1. Click "Continue with LinkedIn" → Authorize
  2. Country gate → Select "India"
  3. Complete onboarding as Client
- **Expected:** User lands on /client
- **Status:** ⬜

### TC-AUTH-05: Email/Password Login
- **Preconditions:** Existing account with verified email
- **Steps:**
  1. Click "Login" → Enter credentials → Submit
- **Expected:** Redirect to role-specific dashboard (/dashboard or /client)
- **Status:** ⬜

### TC-AUTH-06: OTP Login
- **Preconditions:** Existing account
- **Steps:**
  1. Click "Login with OTP" → Enter email → Receive 8-digit code
  2. Enter code → Submit
- **Expected:** Redirect to dashboard
- **Status:** ⬜

### TC-AUTH-07: OAuth Login (Returning User)
- **Preconditions:** Existing account created via GitHub/LinkedIn
- **Steps:**
  1. Click "Continue with GitHub" → Authorize
- **Expected:** Direct to dashboard (no onboarding, no country gate)
- **Status:** ⬜

### TC-AUTH-08: Session Persistence — Browser Refresh
- **Preconditions:** Logged in
- **Steps:**
  1. Navigate to /dashboard/contracts
  2. Refresh browser (F5)
  3. Verify still on /dashboard/contracts
- **Expected:** Session persists, no redirect to login
- **Status:** ⬜

### TC-AUTH-09: Session Persistence — Tab Close & Reopen
- **Preconditions:** Logged in
- **Steps:**
  1. Close browser tab
  2. Open new tab → Navigate to growlancer.vercel.app
- **Expected:** Still authenticated, redirect to dashboard
- **Status:** ⬜

### TC-AUTH-10: Role-Based Access Control
- **Preconditions:** Logged in as Freelancer
- **Steps:**
  1. Navigate to /client (client dashboard URL)
- **Expected:** Redirect to /dashboard (freelancer dashboard)
- **Status:** ⬜

### TC-AUTH-11: Suspended User Blocked
- **Preconditions:** User account suspended in DB
- **Steps:**
  1. Try to login
- **Expected:** Redirect to login with session cleared
- **Status:** ⬜

### TC-AUTH-12: Forgot Password Flow
- **Preconditions:** Existing account
- **Steps:**
  1. Click "Forgot password" → Enter email → Submit
  2. Check email → Click reset link
  3. Enter new password → Submit
- **Expected:** Password updated, redirect to login
- **Status:** ⬜

---

## 2.2 Freelancer Onboarding

### TC-ONB-01: Complete Freelancer Onboarding
- **Preconditions:** Fresh signup, role = freelancer
- **Steps:**
  1. Welcome step → Confirm Freelancer role
  2. Profile step → Enter skills, bio, location
  3. Submit
- **Expected:** onboardingCompleted = true, redirect to /dashboard
- **Status:** ⬜

### TC-ONB-02: Skip Onboarding
- **Preconditions:** Fresh signup
- **Steps:**
  1. Click "Skip for now" on any step
- **Expected:** Redirect to dashboard with empty profile state
- **Status:** ⬜

### TC-ONB-03: Role Switch During Onboarding
- **Preconditions:** OAuth signup (role not yet committed)
- **Steps:**
  1. Welcome step shows "Freelancer" pre-selected
  2. Switch to "Client" → Complete onboarding
- **Expected:** Redirect to /client, profile.role = 'client'
- **Status:** ⬜

---

## 2.3 Client Onboarding

### TC-ONB-04: Complete Client Onboarding
- **Preconditions:** Fresh signup, role = client
- **Steps:**
  1. Welcome step → Confirm Client role
  2. Profile step → Enter company info
  3. Submit
- **Expected:** Redirect to /client
- **Status:** ⬜

---

## 2.4 Project Posting (Client)

### TC-PROJ-01: Post a Project
- **Preconditions:** Logged in as Client, onboarding complete
- **Steps:**
  1. Navigate to /client/post
  2. Enter title, description, budget (₹), skills, category
  3. Click "Post Project"
- **Expected:** Project created, redirect to /client/projects, project visible in feed
- **Status:** ⬜

### TC-PROJ-02: Post Project — Validation
- **Preconditions:** Logged in as Client
- **Steps:**
  1. Navigate to /client/post
  2. Submit empty form
- **Expected:** Validation errors shown, form not submitted
- **Status:** ⬜

---

## 2.5 Freelancer Discovers Projects

### TC-FEED-01: Browse Project Feed
- **Preconditions:** Logged in as Freelancer, skills set
- **Steps:**
  1. Navigate to /dashboard/feed
  2. Verify AI-matched projects appear
  3. Click on a project to view details
- **Expected:** Project details page shows full info
- **Status:** ⬜

### TC-FEED-02: Search Projects
- **Preconditions:** Logged in as Freelancer
- **Steps:**
  1. Use search/filter on project feed
- **Expected:** Projects filtered by skill/category/budget
- **Status:** ⬜

---

## 2.6 Proposal System

### TC-PROP-01: Submit Proposal
- **Preconditions:** Freelancer viewing a project
- **Steps:**
  1. Click "Submit Proposal"
  2. Enter bid amount, cover letter, delivery time
  3. Submit
- **Expected:** Proposal created, status = 'pending', client notified
- **Status:** ⬜

### TC-PROP-02: Client Reviews Proposal
- **Preconditions:** Client has pending proposals
- **Steps:**
  1. Navigate to /client/proposals
  2. View proposal details
  3. Accept or reject
- **Expected:** Status updates, freelancer notified
- **Status:** ⬜

---

## 2.7 Contract & Escrow

### TC-CONT-01: Client Accepts Proposal → Contract Created
- **Preconditions:** Proposal accepted by client
- **Steps:**
  1. Client accepts proposal
- **Expected:** Contract created with status 'pending', freelancer notified
- **Status:** ⬜

### TC-CONT-02: Client Funds Escrow
- **Preconditions:** Active contract, not yet funded
- **Steps:**
  1. Navigate to contract → Click "Fund Escrow"
  2. Complete payment (Razorpay/PayPal/Wallet)
- **Expected:** Escrow funded, contract status = 'active', freelancer notified
- **Status:** ⬜

### TC-CONT-03: Freelancer Delivers Milestone
- **Preconditions:** Active funded contract
- **Steps:**
  1. Navigate to workspace
  2. Submit deliverable for milestone
- **Expected:** Milestone status = 'delivered', client notified
- **Status:** ⬜

### TC-CONT-04: Client Approves Delivery → Payment Released
- **Preconditions:** Milestone delivered
- **Steps:**
  1. Client reviews deliverable in workspace
  2. Click "Approve"
- **Expected:** Escrow released to freelancer wallet, milestone = 'approved'
- **Status:** ⬜

### TC-CONT-05: Auto-Release (Client Non-Response)
- **Preconditions:** Milestone delivered, review window passed
- **Steps:**
  1. Wait for auto-release timer (simulated)
- **Expected:** Escrow auto-releases to freelancer wallet
- **Status:** ⬜

---

## 2.8 Workspace & Communication

### TC-WORK-01: Chat in Workspace
- **Preconditions:** Active contract
- **Steps:**
  1. Navigate to workspace
  2. Send a message
- **Expected:** Message appears in real-time for both parties
- **Status:** ⬜

### TC-WORK-02: Upload Files
- **Preconditions:** Active contract
- **Steps:**
  1. Navigate to workspace → File sharing tab
  2. Upload a file
- **Expected:** File visible to both parties
- **Status:** ⬜

---

## 2.9 Payments & Wallet

### TC-PAY-01: Add Funds to Wallet
- **Preconditions:** Logged in as Client
- **Steps:**
  1. Navigate to /client/payments
  2. Click "Add Funds" → Enter amount → Pay via Razorpay
- **Expected:** Wallet balance updated, transaction recorded
- **Status:** ⬜

### TC-PAY-02: Freelancer Withdraws Earnings
- **Preconditions:** Freelancer with positive wallet balance
- **Steps:**
  1. Navigate to /dashboard/wallet
  2. Click "Withdraw" → Enter amount → Confirm
- **Expected:** Withdrawal request created, funds pending
- **Status:** ⬜

---

## 2.10 Reviews & Reputation

### TC-REV-01: Client Reviews Freelancer
- **Preconditions:** Completed contract
- **Steps:**
  1. Navigate to completed contract
  2. Click "Leave Review"
  3. Rate (1-5 stars), write review, submit
- **Expected:** Review posted, freelancer rating updated
- **Status:** ⬜

---

## 2.11 Services & Packaging

### TC-SVC-01: Freelancer Creates Service
- **Preconditions:** Logged in as Freelancer
- **Steps:**
  1. Navigate to /dashboard/services/create
  2. Enter title, description, category, packages (Basic/Standard/Premium)
  3. Submit
- **Expected:** Service published, visible in /services catalog
- **Status:** ⬜

### TC-SVC-02: Client Purchases Service
- **Preconditions:** Published service exists
- **Steps:**
  1. Navigate to /services → Select a service
  2. Choose package → Click "Buy Now"
  3. Complete payment
- **Expected:** Contract created, escrow funded, freelancer notified
- **Status:** ⬜

---

## 2.12 Disputes

### TC-DISP-01: Freelancer Raises Dispute
- **Preconditions:** Active contract with disagreement
- **Steps:**
  1. Navigate to workspace → Click "Raise Dispute"
  2. Select reason, describe issue, submit
- **Expected:** Dispute created, both parties notified, funds frozen
- **Status:** ⬜

---

## 2.13 Notifications

### TC-NOTIF-01: Real-time Notifications
- **Preconditions:** Logged in
- **Steps:**
  1. Trigger an event (e.g., receive proposal)
  2. Check notification bell
- **Expected:** Notification appears in real-time
- **Status:** ⬜

---

## 2.14 Cross-Cutting Checks

### TC-XCUT-01: Responsive — Mobile Signup
- **Steps:** Complete signup flow on 375px width
- **Expected:** All forms usable, no overflow
- **Status:** ⬜

### TC-XCUT-02: Responsive — Mobile Workspace
- **Steps:** Use workspace chat on mobile
- **Expected:** Chat usable, no clipping
- **Status:** ⬜

### TC-XCUT-03: Browser — Chrome + Safari
- **Steps:** Complete payment flow in both browsers
- **Expected:** Razorpay checkout works in both
- **Status:** ⬜

### TC-XCUT-04: Concurrent Actions
- **Steps:** Open two tabs, try same action (approve milestone) in both
- **Expected:** Second attempt shows error, no double-processing
- **Status:** ⬜

---

## Summary
| Category | Total | Pass | Fail | Blocked |
|---|---|---|---|---|
| Auth & Account | 12 | 0 | 0 | 0 |
| Onboarding | 3 | 0 | 0 | 0 |
| Projects | 2 | 0 | 0 | 0 |
| Proposals | 2 | 0 | 0 | 0 |
| Contracts & Escrow | 5 | 0 | 0 | 0 |
| Workspace | 2 | 0 | 0 | 0 |
| Payments | 2 | 0 | 0 | 0 |
| Reviews | 1 | 0 | 0 | 0 |
| Services | 2 | 0 | 0 | 0 |
| Disputes | 1 | 0 | 0 | 0 |
| Notifications | 1 | 0 | 0 | 0 |
| Cross-Cutting | 4 | 0 | 0 | 0 |
| **TOTAL** | **37** | **0** | **0** | **0** |
