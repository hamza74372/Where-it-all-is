# Customer test: one month with four real-buyer profiles

Tested branch: `customer-test`  
Product revision: `77b413f` (from `main`)  
Test date: 9 October 2026  
Packaged app: `dist/app.html`, served only from localhost  
Primary device: 390 x 844 WebKit; couple flow also used 1440 x 900 Chromium  
Product code changes: none

## Executive verdict

**Overall: promising and trustworthy for an individual with regular pay, but not yet equally convincing for credit-card-heavy users, freelancers, or couples expecting a shared live budget.**

The core loop is genuinely calming. The large safe-to-spend number reacts in a way that is easy to understand, transaction arithmetic held to the cent in 13 of 13 independent checks for Maya, Tom, and Priya, catch-up after an absence was thoughtful, duplicate imports were safe, and backup/wipe/restore reproduced Maya's headline number exactly.

There are four material buyer concerns:

1. A credit-card user has to leave onboarding, add the card in Accounts, then separately create its payment bill.
2. “No regular pay” works mathematically, but offers no way to plan likely invoices or irregular future income.
3. Partner sharing is a manual encrypted snapshot workflow, not shared budgeting; the Etsy listing must make that explicit.
4. In the Sam/Alex run, the first $12.50 quick entry after setup did not appear in the account balance, although the next three weekly entries did. This needs a focused reproduction before release.

## What was tested

- Read `dist/Start-Here-Letter.pdf` before opening the app.
- Built the customer package with `npm run package`.
- Used the built `dist/app.html` through a local HTTP server; no product source was imported by the harness.
- Preserved browser IndexedDB while advancing the Playwright clock from 6 October through 9 November 2026.
- Exercised USD and GBP, phone and desktop layouts, setup, quick and detailed logging, money in, credit-card spending, transfers, editing, delete/undo, bills, a one-off bill, payday confirmation, long absence catch-up, CSV import, duplicate/overlap import, envelopes, goals, debt, focus mode, partner files, backup, wipe, and restore.
- Generated Tom's five weekly HSBC-style CSV exports under [csv](csv/).
- Captured buyer evidence under [shots](shots/).

This was a checkpoint-based 35-day simulation, not an assertion on every calendar day. Safe-to-spend was checked on all action days and account arithmetic was checked approximately weekly. Dark mode, bill “different amount,” late/skip bill handling, debt-free completion, and an autopay mismatch were not completed; they remain coverage gaps rather than passes.

## Buyer verdicts

### A — Maya, US, ADHD, biweekly pay

**Verdict: buy, with a setup caveat.**

The daily number, quick log, edit, undo, payday amount correction, long-absence catch-up, and backup/restore all felt coherent. The balance matched the hand ledger exactly on 13 and 17 October, and the safe number was identical before and after a complete wipe/restore.

The weak point is first-day setup. Maya's $320 card balance and card minimum are financially important but cannot be captured inside the guided setup. The buyer must understand the Accounts model immediately and then configure a separate card bill. That is too much discovery work for the exact audience this product promises to help.

Evidence: [welcome](shots/001-A-Maya-day-1-welcome.png), [after setup](shots/002-A-Maya-day-1-after-setup.png), [return after ten days](shots/003-A-Maya-day-23-while-away.png), [restored app](shots/004-A-Maya-day-23-restored.png).

### B — Tom, UK, monthly pay, CSV-only

**Verdict: buy.**

Five weekly HSBC-style imports worked. Re-importing the first CSV reported all three rows as already imported and disabled the import action. The manually logged £200 savings transfer was entered before the bank row arrived; the third CSV imported only the other two rows, so the overlap was not double-counted. All five weekly balances matched the hand ledger to the penny.

The process still asks Tom to review/categorise imports, which is reasonable for a local-only app but should be visible in the listing: it is assisted importing, not invisible bank sync.

Evidence: [GBP Today](shots/001-B-Tom-day-1-today-gbp.png), [week 1](shots/002-B-Tom-2026-10-11-week-1-import.png), [transfer-overlap week](shots/004-B-Tom-2026-10-25-week-3-import.png), [week 5](shots/006-B-Tom-2026-11-08-week-5-import.png), [Insights](shots/007-B-Tom-day-34-insights-after-imports.png).

### C — Priya, freelancer with irregular income

**Verdict: conditional; not enough for cash-flow planning on its own.**

“I don't have regular pay” is reassuring and correctly plans to month-end. Three client payments from $600 to $2,400 and varied spending produced exact account balances at five checkpoints. Envelopes, a tax-reserve goal, and the debt view were usable.

The core limitation is conceptual: Priya can record income only after it arrives. There is no lightweight expected-invoice date or confidence-adjusted future-income view, so “safe today” can be needlessly restrictive before a near-certain invoice and overly optimistic if the user mentally counts unpaid invoices. This is the biggest product gap for freelancers.

Evidence: [no regular pay](shots/001-C-Priya-day-1-no-regular-pay.png), [overspent envelope](shots/002-C-Priya-day-17-overspent-envelope.png), [goal](shots/003-C-Priya-day-20-goal-milestone.png), [debt](shots/004-C-Priya-day-30-debt-plan.png).

### D — Sam and Alex, a couple sharing weekly

**Verdict: useful as a privacy-first read-only snapshot; do not position it as couple budgeting.**

Alex's app remained separate, and each of four encrypted share files opened as a read-only partner view. That separation is excellent. The weekly routine is nevertheless repetitive: Sam creates a file, sends it separately from the passphrase, and Alex opens it again. This is appropriate only if the listing sets that expectation.

One anomaly needs focused reproduction: Sam's first $12.50 shared-grocery entry after setup was absent from the account balance. Weeks 2–4 persisted, leaving every later hand check exactly $12.50 high. This was not seen in Maya's quick logs, so the customer test cannot yet establish whether it is a first-use race, a prompt interaction, or harness timing.

Evidence: [week 1 partner view](shots/001-D-Sam-Alex-week-1-partner-view.png), [week 4 partner view](shots/004-D-Sam-Alex-week-4-partner-view.png), [manual sharing evidence](shots/005-D-Sam-Alex-week-4-manual-sharing.png), [desktop focus mode](shots/006-D-Sam-Alex-day-31-focus-mode.png).

## Findings

| ID | Severity | Customer/day | Action | Actual result | Expected | Evidence |
|---|---|---|---|---|---|---|
| CT-01 | High, needs reproduction | Sam/Alex, week 1 | Quick-log “$12.50 shared groceries,” then continue to account/share flow | The first entry was not reflected in the balance; the next three weekly entries were. Later checks stayed $12.50 high. | Every confirmed quick entry persists before navigation and sharing. | [Week 1](shots/001-D-Sam-Alex-week-1-partner-view.png) |
| CT-02 | Medium | Maya, day 1 | Set up with a $320 credit-card balance and minimum payment | Card setup requires More → Accounts, then Bills → Add bill after onboarding. | Capture a card and its payment obligation in guided setup, or offer a direct post-setup task. | [After setup](shots/002-A-Maya-day-1-after-setup.png) |
| CT-03 | Medium | Priya, day 1 | Choose “I don't have regular pay” | The app plans to month-end but has no expected invoice/income scenario. | Let a freelancer add likely incoming money without pretending it is recurring pay. | [No regular pay](shots/001-C-Priya-day-1-no-regular-pay.png) |
| CT-04 | Medium | Sam/Alex, weeks 1–4 | Share with partner every week | Privacy is strong, but each update is a new file plus passphrase/open flow. | Listing and help clearly say “manual read-only snapshot,” not sync. | [Week 4](shots/005-D-Sam-Alex-week-4-manual-sharing.png) |
| CT-05 | Medium, trust/copy | All, before day 1 | Read Start Here guide | It calls the hosted URL the buyer's “personal copy's address.” The URL is an app route; the personal data is local browser storage. | Say that the address opens the app while the buyer's data remains only on their device. | `dist/Start-Here-Letter.pdf` |

No crash, console error, or unexpected external network request was recorded in the final isolated runs.

## Independent money checks

The expected column was calculated independently from the opening balance and confirmed/imported transactions. It did not use the safe-to-spend implementation.

| Customer | Date | Expected account balance | App balance | Result |
|---|---:|---:|---:|---|
| Maya | 13 Oct | $1,089.26 | $1,089.26 | Pass |
| Maya | 17 Oct | $2,884.76 | $2,884.76 | Pass |
| Maya | 28 Oct | Safe before restore: $1,442 | Safe after restore: $1,442 | Pass |
| Tom | 11 Oct | £776.10 | £776.10 | Pass |
| Tom | 18 Oct | £526.55 | £526.55 | Pass |
| Tom | 25 Oct | £277.45 | £277.45 | Pass |
| Tom | 1 Nov | £1,487.45 | £1,487.45 | Pass |
| Tom | 8 Nov | £1,339.85 | £1,339.85 | Pass |
| Priya | 13 Oct | $1,311.70 | $1,311.70 | Pass |
| Priya | 20 Oct | $2,744.50 | $2,744.50 | Pass |
| Priya | 27 Oct | $2,651.75 | $2,651.75 | Pass |
| Priya | 4 Nov | $4,948.65 | $4,948.65 | Pass |
| Priya | 9 Nov | $4,948.65 | $4,948.65 | Pass |
| Sam | 9 Oct | $1,837.50 | $1,850.00 | Mismatch: first $12.50 entry absent |
| Sam | 16 Oct | $1,824.00 | $1,836.50 | Same $12.50 gap |
| Sam | 23 Oct | $1,809.50 | $1,822.00 | Same $12.50 gap |
| Sam | 30 Oct | $1,794.00 | $1,806.50 | Same $12.50 gap |

## What worked especially well

- The safe number is legible and emotionally neutral.
- Confirming a different paycheck amount is straightforward.
- The long-absence flow asks instead of assuming.
- Imported duplicates are explicit and not counted twice.
- A manually entered transfer was linked when its bank row arrived.
- Excluded savings did not inflate safe-to-spend.
- Delete/undo visibly restored the selected Maya entry.
- Backup → full IndexedDB wipe → restore preserved the safe number exactly.
- The partner view is clearly read-only and never contaminates Alex's own budget.
- GBP formatting and month rollover remained coherent.

## Coverage gaps

These should not be read as passing:

- Bill paid late, skipped, or with a different amount.
- Autopay amount mismatch and bill-edit history.
- Dark theme and all appearance accents.
- A goal crossing every 25/50/75/100% milestone.
- Debt paid fully to zero and the final debt-free state.
- A true daily assertion on all 35 calendar days; this run used action-day checks plus weekly hand checks.
- A customer intentionally importing a partially overlapping date range from a different bank format.
- Demo-build 30-entry exhaustion; the test used the full buyer app.

## Missing features, ranked by buyer impact

1. Guided credit-card setup, including the current balance and minimum/full-balance payment choice.
2. Expected irregular income/invoices for freelancers.
3. A first-entry persistence guard or regression test around prompts/navigation immediately after setup.
4. Explicit “manual read-only snapshot” positioning for partner sharing.
5. A direct “bill was a different amount” action when marking paid.
6. A single reconciliation screen that compares today's real bank balance with the app after absence/import.
7. A post-setup checklist tailored to what the buyer skipped: card, savings, backup, first bill, first import.
8. Import feedback that says when a row linked to an existing transfer or bill, not merely how many were imported.
9. A freelancer-oriented month runway view with confirmed versus expected income.
10. A couple-friendly recurring reminder to create a fresh snapshot, if manual sharing remains the product model.

## Top 10 fixes and exact place

1. **Onboarding, after Balance:** ask “Do you also use a credit card?” and deep-link the answer to a compact card/account step.
2. **Onboarding completion card:** add a visible task “Add your card payment” when a card was created.
3. **Today quick log:** keep the input disabled or show a persistent saved check until IndexedDB completion; add a first-entry-after-setup regression test.
4. **Paychecks / no regular pay:** add “Expected money” with amount, likely date, and an option not to include it in safe-to-spend until received.
5. **Bills row → Mark paid:** offer “Full amount,” “Different amount,” and “Not paid/skip this occurrence.”
6. **Import completion:** say “2 imported, 1 linked to your existing savings transfer, 0 duplicated.”
7. **While you were away:** put the real balance reconciliation first and retain the excellent bills/pay review.
8. **More → Share with partner:** add the sentence “This is a manual read-only snapshot; it does not update automatically.”
9. **Etsy listing image/copy for couples:** label the feature “encrypted partner snapshot,” never “shared budget” or “sync.”
10. **Start Here PDF, hosted link paragraph:** replace “personal copy's address” with “the app address; your numbers stay only in this browser unless you export them.”

## Build and scope

- `npm run package`: passed.
- Built app size: **554,005 bytes** (about 541 KiB), below the 600 KB product budget.
- Start Here Letter: 430,660 bytes.
- Final product revision remained `77b413f`.
- `git status --short` showed only `qa/` as untracked before this report was written.
- No file under `src/`, `test/`, `e2e/`, `scripts/`, or `listing/` was changed.
- The reproducible harness and its generated CSV/result evidence live entirely in `qa/customer-test/`.
