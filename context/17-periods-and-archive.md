# Module 17: Billing periods, closed months and the archive

The books are shared and must be trustworthy. Two rules carry everything here:

1. **Every money record lands in a real period.** Nothing is stored that no period would count.
2. **A closed month is frozen.** Nobody can change it, and everybody can read it.

---

## Periods

A period is a `MessMonth` row with explicit start and end dates. The admin closes it by hand (`closeMonth()` in `src/lib/financial.ts`, allowed on or after the end date). There is always at most one open period: the current one.

- The label (`yearMonth`) is the month the period starts in, so a mess that starts on the 17th has `2026-06` for 17 Jun to 16 Jul.
- Pages never guess the period from the calendar. They call the API without a month and the server uses the open period.
- `GET /api/mess/period` returns the open period and whether it is overdue (today is past its end). The dashboard shows a banner (`PeriodNotice`, `PeriodContext`): admins get a "Close period" button, members are told the admin has to close it. The Overview shows the period dates under the date.

### Where a record may be dated

`checkDateInOpenPeriod(messId, date)` in `src/lib/period.ts` is the one rule for **bazaar trips, expenses and deposits** (create and date change):

| Date is... | Result |
|------------|--------|
| inside the open period | allowed |
| inside a closed period | refused: "That date is in a closed month and can no longer be changed" |
| after the open period ended | refused: close the period first |
| before the open period began | refused |

Deposits are matched to a period by `LedgerEntry.createdAt`, and `POST /api/contributions` stores the chosen date (midday UTC) there. (Before this rule, the date was ignored and the deposit was stamped "now".)

### Closing

`closeMonth` runs in one transaction: marks the period closed, freezes its daily logs, writes the `DEDUCTION` ledger rows, creates the next period, writes `CARRY_FORWARD` rows (if the mess carries balances) and stores the **snapshot**.

If the next period would already be entirely in the past (the mess stopped using the app for a while), the new period starts at the one that contains today. The skipped periods are not created, nothing in the gap is billed, balances still carry forward. The response has `skipped_periods`.

## Frozen months: the snapshot

`MessMonth.snapshot` (JSON, see `PeriodSnapshot`) holds every figure of the period at close: totals, meal rate, the settings used, and one row per member (own meals, guest meals, billable meals, deposited, bazaar credit, carried forward, cost, balance). It holds member ids only, never names, so deleting an account still removes the person's name from the archive.

`calculatePeriodSummary()` reads the snapshot for any closed period instead of recalculating. This is what stops later setting changes (guest policy, bazaar credit, carry-forward) or members leaving from rewriting history. A period closed before snapshots existed is snapshotted the first time it is read.

Everything else that makes a closed month immutable already existed and is covered by the regression test: day edits, guest changes, no-cook, expense and bazaar edits and voids, deposit voids (only `CONTRIBUTION` rows can be voided, never `DEDUCTION` or `CARRY_FORWARD`), memo photos, back-dated records, closing twice.

## Archive (every member can read it)

| Route | What it returns |
|-------|-----------------|
| `GET /api/archive` | Closed months of the caller's mess, newest first |
| `GET /api/archive/[yearMonth]` | One closed month: totals, every member's figures, every bazaar trip with items and memo photos, every deposit (voided ones marked with the reason), and the day by day meals |

Open to every role. The mess always comes from the token. An open month answers 404. Pages: `/archive` and `/archive/[yearMonth]` (tabs: Members, Bazaar, Deposits, Day by day). The matrix stays admin and manager only; the archive is the read-only view for everyone.

Memo photos in the archive use the existing `GET /api/expenses/sessions/[id]/memos/[memoId]`, which any member of the mess may read.

## Weekend days and meals served

- The matrix shades the mess's own weekend days (`weekend_days` from the API), not a fixed Sunday and Saturday.
- Settings, Mess tab, Cutoff times: each meal has a "Served" switch. A meal switched off counts as 0 for everyone from that moment; past days are settled first and do not change.

## Real data import and reconciliation

- `npm run import:sheet -- <data.json> [--replace]` loads a mess's members, daily meals, bazaar and deposits. It refuses a non-local database unless `--allow-remote`, checks the sheet against its own totals first, and writes random logins to `<data>.credentials.txt` (git-ignored with the data: `scripts/data/*.local.*`).
- `npm run reconcile:sheet -- <data.json>` signs in as every member through the real API and compares each figure with the sheet. Green Home Tower B5, June 2026: 44 of 44 figures match.

## Tests (run after touching any API route)

| Command | Covers |
|---------|--------|
| `npm run test:isolation` | One mess can never read or change another (33 checks) |
| `npm run test:closed` | A closed month cannot be changed and is readable by members (33 checks) |
| `npm run reconcile:sheet -- ...` | The site reproduces the real sheet |
