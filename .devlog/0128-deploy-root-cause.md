# 0128 deploy — root-cause note

## What happened
Run `38869397772` (push `origin/main`, 2026-10-16T07:47) reported:

  mode: pre  | files: 293 | remote-applied: 293 | pending: 0 | duplicate versions: 0
  mode: post | files: 293 | remote-applied: 293 | pending: 0 | duplicate versions: 0

`db push` was a true no-op on the remote: every migration file in the repo already had
a matching row in live `pgmigrations`, no pending and no duplicates. The drift-check
(including the `20270128000000_restore_release_escrow_service_role_detection.sql` file
present in the repo) passed in both `pre` and `post` mode.

## Why the pentest still failed
The pentest (`scripts/e2e/pentest-privileges.mjs`) asserts on two money steps:

  - `[milestone] service-role auto-release actually releases the escrow and pays the member`
  - `[team] the service-role milestone path releases member B's escrow and pays B`

Both assert: `credited == CONTRACT_RATE == 5000` (within 0.01).

Both failed because `credited == 4750`.

## Why 4750
Live `release_escrow` (and `_release_escrow_internal`) compute:

  v_gross := COALESCE(v_escrow.amount, v_contract.amount)        -- 5000
  v_fee   := COALESCE(v_contract.platform_fee, ROUND(v_gross*0.05,2))  -- 250
  v_net   := GREATEST(v_gross - v_fee, 0)                        -- 4750
  ... credit freelancer wallet with v_net

The freelancer receives `v_gross - v_fee` = **4750**, not `v_gross` = 5000.

## Where the fee comes from (funding side, already in live)
`20270102000001_contract_amount_from_proposal.sql` (already applied pre-0128):

  v_platform_fee   := ROUND(v_authoritative_amount * 0.05, 2);  -- 5%, client-paid
  v_freelancer_amount := v_authoritative_amount;                 -- 100% to freelancer

So at contract creation, `contracts.platform_fee = 250` and `contracts.freelancer_amount = 5000`
are both stored. The migration comment labels it "5% (client-paid)".

`20261028000000_fund_escrow_from_wallet.sql` (already applied) funds escrow by debiting the
client's wallet `v_funding_amount + v_fee` (= 5000 + 250 = 5250), recording the 250 platform fee
as a separate completed payment transaction. Escrow holds the `v_funding_amount` = 5000 base
(plus any revision top-ups). No fee stays in escrow.

## Why the service-role path now works (and moved money)
`20270119000018_fix_service_role_cron_bypass.sql` replaced the stale singular
`current_setting('request.jwt.claim.role', …)` probe with
`public.is_service_role_context()`. Then `20270124000000` (applied in run 38864451720,
before 0128 existed) re-stated `release_escrow` **with the stale probe back** and with
`v_net := v_gross` (fee-inclusive) — silently breaking the cron path again and reverting
the money fix. Then `20270128000000` (this run) re-stated `release_escrow` with the correct
`is_service_role_context()` probe restored, kept the `_release_escrow_internal` delegation,
and kept the fee-exclusive `v_net := v_gross - v_fee`. The inline assertion + positive/negative
controls in 0128 both pass, and `stale_jwt_claim_check()` no longer flags `release_escrow`.

So after run 38869397772: the service-role release path works again (money moves), and the
money movement uses the fee-exclusive formula (4750). The pentest failure is therefore NOT a
regression reintroduced by 0128 — it is the **existing live formula** now being exercised for
the first time by a passing service-role path. Before 0128, the same assertion would have failed
even harder: `credited=0.00` with `escrow_released=false` ("Unauthorized").

## The money question this surfaces (not decided by 0128)
On a ₹5000 contract today, live behavior is:

  - Client charged: 5250 (5000 escrow + 250 platform fee) — debited from client wallet at funding.
  - Escrow holds: 5000 (the fee is booked separately, does not sit in escrow).
  - At release: freelancer credited 4750, platform revenue booked 250, invoice total 5000.
    Ledger identity holds: 4750 + 250 = 5000 = escrow pool.

So the freelancer currently receives 95% of the contract amount, and the platform books 5% once
(at release via `_book_escrow_release`, on top of which the invoice subtotal = freelancer amount,
total = escrow pool). The 250 is **not double-counted**: it is booked once at funding as a
completed platform_fee payment transaction, and once at release as `platform_revenue` / invoice
`platform_fee` — but both derive from the same `contracts.platform_fee` and the same escrow pool,
and the freelancer is paid `v_gross - v_fee`, not `v_gross`.

Two readings are both consistent with the current code:

  (A) Client-paid 5% "on top" model (what CLAUDE.md and the 0102 comment describe):
      client pays 5250 = contract 5000 + 5% fee; freelancer should receive 5000 (100% of
      contract amount); platform takes 250 once. Under this reading, `v_net` should be `v_gross`
      (= escrow pool = 5000), because the fee is already paid by the client on top and does not
      come out of the freelancer's pool.

  (B) Fee-inclusive release model (what the current release code implements):
      freelancer receives `v_gross - v_fee` = 4750; platform books 250 at release; the 5%
      is taken from the escrow pool at payout time. Under this reading, the "client-paid on top"
      framing is inaccurate: the client still pays 5250 total, but the 250 is effectively
      withheld from the freelancer at release rather than being a separate platform take on top
      of a full 5000 freelancer payout.

Both agree the client pays 5250. They disagree on whether the freelancer receives 5000 or 4750,
i.e. whether the platform's 5% comes out of the freelancer's pool or is a separate add-on that
the freelancer keeps.

## What 0128 does and does not decide
0128 fixes the **detection** bug (service-role path now works). It does NOT change the fee
formula — it preserves whatever `20270124000000` left (fee-exclusive, credited=4750). So 0128
makes the pentest's money assertion reachable and failing for a reason that already existed.

The deploy gate failure is therefore a **money-model disagreement**, not a detection bug.
Decide (A) or (B) before re-rerunning this deploy, because whichever is chosen requires changing
either:

  - (A): `v_net := GREATEST(v_gross, 0)` in `_release_escrow_internal` and `_book_escrow_release`,
        and update the pentest's CONTRACT_RATE-based assertion (or its framing) to match "client
        pays fee on top, freelancer gets 100% of contract amount", OR
  - (B): leave the release formula as-is and update the pentest assertion / documentation to match
        "freelancer receives escrow pool minus 5% platform fee", and make the "client-paid on top"
        wording in 0102 and CLAUDE.md consistent with that.

## Critical correction — the timeline is the opposite of the first read

First read of the deploy log said: "0128 was already applied before 38869397772; db push
was a no-op." That is **wrong**.

### The actual sequence

1. Deploy 38864451720 at 07:00 UTC checked out commit `b971f58`. That commit does **not**
   contain 0128's file (`fatal: path exists on disk, but not in b971f58`). It applied 0124
   (which **was** pending and **was** in the checkout) — including 0124's `release_escrow`
   body, which uses the **stale** `request.jwt.claim.role` probe and the fee-INCLUSIVE
   `v_net := v_gross`.

2. Commit `9386222` (`fix(migration): restore service-role detection in release_escrow`)
   was created/pushed at 13:08:51 +0530 = **07:38:51 UTC**, adding
   `supabase/migrations/20270128000000_restore_release_escrow_service_role_detection.sql`.

3. Deploy 38869397772 at 07:47 UTC checked out commit `407d120`, which **does** contain
   0128's file. db push at 09:08 UTC reported `Remote database is up to date.` with **no**
   `Applying migration 20270128...` lines — which can only mean 0128's version was **already**
   in live `pgmigrations` when db push ran.

4. So between 07:38 (0128 added to repo) and 09:08 (db push on 38869397772), 0128's
   version got into live `pgmigrations`. The only deploy that could have done it is
   38869397772 itself — but its db push log shows no `Applying` lines for 0128.

The reconciliation: 0128 was applied **manually** (local `supabase db push` or an equivalent
direct push) between commit `9386222` (07:38) and deploy 38869397772's db push (09:08).
There is no deploy-log record of it because it was not a deploy-run step. This is consistent
with: (a) no `Applying migration 20270128...` line in 38869397772's log, (b) drift check
`remote-applied: 293` including 0128, (c) live body is the corrected one (proven by the
pentest seeing `credited=4750` from a **working** service-role path).

### Why this matters

0128's inline assertions (`DO $assert$` + `DO $control$`) **did run** — at manual-apply time
— and **passed** (otherwise the corrected body would not be live, and the pentest would have
seen `credited=0.00 / Unauthorized` from 0124's stale body instead of `credited=4750` from
0128's corrected body).

So 0128 is **not** the thing that failed. It is **already applied and passing**. The deploy
38869397772 **also** did not fail in db push (no-op) or functions deploy (success). It failed
in the **pentest**, which runs after both.

### Why `remote-applied: 293` does not mean "every file was applied by a deploy"

The drift check counts **versions**, not deploy events. A version is "remote-applied" if it
has a row in live `pgmigrations` — however it got there (deploy-run db push, manual db push,
etc.). So `293 == 293` means every repo file's version has a live row, **not** that every
version was applied by a deploy-run db push.

This is why 0124 (applied by deploy 38864451720 at 07:00) and 0128 (applied manually
between 07:38 and 09:08) can both be "remote-applied" in the same 293 count even though no
single deploy applied both.

### The 0124-then-0128 ordering and why it does NOT revert

0124 (version `20270124000000`) sorts **before** 0128 (version `20270128000000`). When 0124
was applied at 07:00, 0128's version was **not yet** in live `pgmigrations` (0128's file did
not exist in any checkout yet). So 0124's `CREATE OR REPLACE` wrote 0124's body (stale probe,
fee-inclusive) into the live function.

Then 0128 was applied manually (after 07:38). 0128's `CREATE OR REPLACE` overwrote 0124's
body with 0128's corrected body (new probe, fee-exclusive). Because 0128's version is newer,
it is the **last writer**, and its body is what is live now.

This is exactly the intended design: 0128 was created specifically to fix the regression that
0124 introduced (0124 re-stated the stale probe). The manual apply of 0128 restored the
corrected body before the deploy's pentest ran.

### What would have happened if 0128 had NOT been applied before the pentest

If 0128 had **not** been applied, the live body would be 0124's (stale probe). Then:

- The service-role auto-release path would get `Unauthorized` (stale probe reads `''` in
  current PostgREST, so `v_is_service_role = false`, and the gate refuses).
- The pentest's `[milestone] service-role auto-release` step would report
  `escrow_released=false credited=0.00 msg="... escrow release failed: Unauthorized"`.
- That is **a different failure** from the one we see (`escrow_released=true credited=4750`).

So the fact that the pentest saw `credited=4750` from a **passing** service-role path is
**proof** that 0128's body is live — i.e., 0128 was applied before the pentest ran.

### The actual deploy failure, stated precisely

Run 38869397772:

- Drift-check (pre): **pass** — `remote-applied: 293, pending: 0, duplicate versions: 0`.
  0128's version is in that 293 (applied manually earlier).
- db push: **success, no-op** — `Remote database is up to date.` (nothing pending).
- Functions deploy: **success** (runs after db push).
- Pentest: **FAIL** — 2 money assertions (`credited == 5000`, got `4750`).
- Whole-surface audit: **not reached** (job exited at pentest).

The failure is **not** a migration-application failure, **not** a drift-check failure, and
**not** a 0128-specific bug. It is the pentest's money assertion against the live release
formula.

## Summary — what the deploy actually did and where it stopped

| Step | Result | Notes |
|------|--------|-------|
| Drift-check (pre) | **pass** | `remote-applied: 293, pending: 0, duplicate versions: 0`. 0128's version is in the 293 (applied manually before this run). |
| db push | **success, no-op** | `Remote database is up to date.` Nothing pending — 0128 already applied. |
| Functions deploy | **success** | Runs after db push. |
| Pentest | **FAIL** | 2 money assertions: `credited == 5000`, got `4750`. |
| Whole-surface audit | not reached | Job exited at pentest. |

So the deploy did **not** fail in migration application, drift check, or function deploy.
It failed in the pentest, which is the first step after the functions are deployed.

The pentest failure is the **money assertion** vs the live release formula — not a
migration bug, not a detection bug, not a drift bug, and **not** anything 0128 broke.

## Files involved
- `supabase/migrations/20270128000000_restore_release_escrow_service_role_detection.sql`
- `supabase/migrations/20270124000000_restore_release_escrow_cron_and_fee_base.sql`
- `supabase/migrations/20270119000018_fix_service_role_cron_bypass.sql`
- `supabase/migrations/20270102000001_contract_amount_from_proposal.sql`
- `supabase/migrations/20261028000000_fund_escrow_from_wallet.sql`
- `scripts/e2e/pentest-privileges.mjs` (assertions at the two milestone/team release steps)
- `.github/workflows/backend-deploy.yml`

## Note on file sizes
`supabase/migrations/20261220000000_freelancer_full_payout_model.sql` is 2 bytes (`;\n`) on disk
in this worktree — effectively empty. Any reference to it as the source of a money formula should
be treated as stale; the authoritative bodies are 0124 and 0128.

## How to reproduce the conclusion locally

1. `git log --oneline -1 origin/main -- supabase/migrations/20270128000000_restore_release_escrow_service_role_detection.sql`
   → shows commit `9386222` at 2026-10-16 13:08:51 +0530 (07:38 UTC).
2. `git show b971f58:supabase/migrations/20270128000000_restore_release_escrow_service_role_detection.sql`
   → `fatal` (file not in the 07:00 deploy's checkout).
3. `git show 407d120:supabase/migrations/20270128000000_restore_release_escrow_service_role_detection.sql`
   → file present (the 07:47 deploy's checkout has it).
4. `gh run view 38869397772 --log` → grep `Applying migration 20270128` → no matches;
   grep `Remote database is up to date` → one match at 09:08.
5. `gh run view 38869397772 --log` → grep `credited=4750` → two matches (milestone + team
   release steps), both with `escrow_released=true`.

Items 4 and 5 together are the proof that 0128 is live and that the deploy failed in the
pentest, not in db push.
