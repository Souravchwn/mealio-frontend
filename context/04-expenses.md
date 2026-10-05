# Module 04 — Expenses

## What This Module Does

Shows bazaar session history and member contributions. All roles can read. ADMIN and MANAGER can write (sessions: MANAGER+ADMIN; void session: ADMIN only; contributions: ADMIN+MANAGER; void contribution: ADMIN only). The meal rate is computed live from the expense data, **excluding voided sessions**.

**Key principles:**
- Nothing is hard-deleted. All records have an `isVoided` flag. Voided items stay visible in the list but excluded from all financial calculations.
- **All financial calculations happen in the backend only.** The frontend never sums amounts, groups by member, or derives totals from raw lists.
- **`financial.ts` is the single source of truth.** `nonVoidedExpenseWhere`, `calculateMonthStats`, and `calculateMealRate` are the only places voided-exclusion logic lives.
- No route calculates the same thing twice. Routes that need `{ totalExpense, totalMeals, mealRate }` call `calculateMonthStats` once.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/expenses/page.tsx` | Page (client) | Two-tab UI: Bazaar Sessions + Contributions + Magic Calculator FAB |
| `src/app/[locale]/(dashboard)/expenses/expenses.module.css` | CSS | Expense page styles (incl. skeleton, void, calculator) |
| `src/app/api/expenses/route.ts` | API GET+POST | Paginated expense items list / add single item |
| `src/app/api/expenses/[id]/route.ts` | API PUT+DELETE | Edit / delete a single expense item |
| `src/app/api/expenses/sessions/route.ts` | API GET+POST | List sessions (paginated) + `total_expense` + `live_meal_rate` / create session |
| `src/app/api/expenses/sessions/[id]/route.ts` | API GET+PUT+DELETE | Session detail / edit / **soft-void** |
| `src/app/api/expenses/meal-rate/route.ts` | API GET | Current live meal rate (thin wrapper over `calculateMonthStats`) |
| `src/app/api/contributions/route.ts` | API GET+POST | Paginated deposits + `total_contributed` + `member_summary` / add deposit |
| `src/app/api/contributions/[id]/route.ts` | API DELETE | **Soft-void** a contribution (Admin only) |
| `src/lib/financial.ts` | Lib (server-only) | `nonVoidedExpenseWhere`, `calculateMonthStats`, `calculateMealRate`, `countMealSlots`, `closeMonth` |

---

## `src/lib/financial.ts` — Calculation Hierarchy

```
nonVoidedExpenseWhere(messId, start, end)
  └── used by all routes that query Expense rows
      Prisma filter: { OR: [{ sessionId: null }, { session: { isVoided: false } }] }

calculateMonthStats(messId, yearMonth)
  └── single DB call pair: expenses + daily_logs
  └── returns { totalExpense, totalMeals, mealRate } — all voided-excluded
  └── called by: sessions/route GET, members/me GET, matrix GET (via inline expansion)

calculateMealRate(messId, yearMonth)
  └── thin wrapper over calculateMonthStats — for callers that only need the rate
```

**Rule:** If a route needs more than one of `{ totalExpense, totalMeals, mealRate }`, call `calculateMonthStats` once. Never call `calculateMealRate` and then also query expenses separately.

---

## Data Model

### BazaarSession (soft-delete)
A shopping trip. Groups multiple `Expense` items under one session.

```typescript
interface BazaarSessionResponse {
  id: string
  messId: string
  date: string              // YYYY-MM-DD
  yearMonth: string
  shoppers: Array<{ id: string; name: string }>
  note: string | null
  createdByName: string | null
  total: number             // sum of all items (shown even when voided)
  items: Array<{
    id: string
    category: ExpenseCategory
    amount: number
    description: string | null
  }>
  createdAt: string
  isVoided: boolean
  voidReason: string | null
  voidedAt: string | null
}
```

### Contribution (soft-delete)
Cash a member gives to the mess fund. Stored as a `LedgerEntry` with `entryType: 'CONTRIBUTION'`.

```typescript
interface ContributionResponse {
  id: string
  memberId: string
  memberName: string
  amount: number
  note: string | null
  date: string
  recordedByName: string | null
  createdAt: string
  isVoided: boolean
  voidReason: string | null
  voidedAt: string | null
}
```

Voided contributions are excluded from `members/me` balance calculation (`isVoided: false` filter).

---

## Expense Categories

```typescript
enum ExpenseCategory {
  PROTEIN   // meat, fish, eggs
  CARB      // rice, flour, lentils
  VEGETABLE
  SPICE
  OIL
  UTILITY   // gas, electricity
  OTHER
}
```

---

## Role Matrix

| Operation | ADMIN | MANAGER | MEMBER |
|-----------|-------|---------|--------|
| Read sessions | ✅ | ✅ | ✅ |
| Add session | ✅ | ✅ | ❌ |
| Edit session | ✅ | ✅ | ❌ |
| Void session | ✅ | ❌ | ❌ |
| Read contributions | ✅ | ✅ | ✅ |
| Add contribution | ✅ | ✅ | ❌ |
| Void contribution | ✅ | ❌ | ❌ |
| Nav visibility | ✅ | ✅ | ✅ |

---

## API: GET `/api/expenses/sessions`

**Query params:** `mess_id`, `year_month`, `page` (default 1), `limit` (default 20, max 50)

**Response:**
```typescript
{
  sessions: BazaarSessionResponse[]   // includes voided (shown in list)
  total: number
  page: number
  pages: number
  liveMealRate: number                // from calculateMonthStats — excludes voided
  totalExpense: number                // from calculateMonthStats — excludes voided
}
```

---

## API: GET `/api/expenses`

**Query params:** `mess_id`, `year_month`, `page` (default 1), `limit` (default 20, max 50)

**Response:**
```typescript
{
  expenses: ExpenseResponse[]   // excludes items from voided sessions
  total: number
  page: number
  pages: number
}
```

Each `ExpenseResponse` includes `live_meal_rate` from `calculateMealRate`.

---

## API: GET `/api/contributions`

**Query params:** `year_month`, `page` (default 1), `limit` (default 20, max 20)

**Response:**
```typescript
{
  contributions: ContributionResponse[]   // includes voided (shown in list)
  total: number
  page: number
  pages: number
  total_contributed: number               // DB aggregate: non-voided only — backend owns this
  member_summary: Array<{                 // grouped by member, non-voided only — backend owns this
    member_id: string
    member_name: string
    total: number
    count: number
  }>
}
```

**Frontend rule:** Never compute `totalContributed` or `memberSummary` in the frontend. Use `res.totalContributed` and `res.memberSummary` directly.

---

## API: DELETE `/api/expenses/sessions/[id]` — Soft Void

**Roles:** ADMIN only.  
**Body:** `{ reason: string }` — required, min 1 char.

Sets `isVoided=true`, `voidReason`, `voidedAt`, `voidedBy` on the session. Expense rows are NOT deleted. Audit: `VOID_BAZAAR_SESSION`.

**Error cases:** 400 if reason missing; 400 if already voided; 404 if not found.

---

## API: DELETE `/api/contributions/[id]` — Soft Void

**Roles:** ADMIN only.  
**Body:** `{ reason: string }` — required.

Sets void flags on the `LedgerEntry`. Audit: `VOID_CONTRIBUTION`. Member balance recalculates automatically (next call to `members/me` excludes voided entries).

---

## Financial Impact

- **Meal rate** = `totalNonVoidedExpenses / totalMealSlots` — computed in `calculateMonthStats` via `nonVoidedExpenseWhere`
- **Member balance** = `expenseContributions + nonVoidedCashContributions − mealCost` — computed in `members/me`
- **Month closing** (`closeMonth`) also excludes voided sessions via `nonVoidedExpenseWhere`
- **Stats on expenses page**: `mealRate` + `totalExpense` come from `loadSessions` (sessions endpoint); `totalContrib` comes from `loadContributions` (contributions endpoint's `total_contributed`)
- **Stats on overview page**: `mealRate` + `totalExpense` + `balance` all come from `members/me` — one call covers three stats

---

## `src/lib/api.ts` — Client Methods

```typescript
api.expenses.getExpenses({ messId, yearMonth?, page?, limit? }, token)
  // → { expenses[], total, page, pages }

api.expenses.getMealRate(messId, yearMonth?, token?)
  // → { messId, yearMonth, mealRate }

api.expenses.sessions.list({ messId?, yearMonth?, page?, limit? }, token)
  // → { sessions[], total, page, pages, liveMealRate, totalExpense }

api.expenses.sessions.create(data: BazaarSessionRequest, token)
api.expenses.sessions.void(id, reason, token)      // soft-void

api.contributions.list({ yearMonth?, page?, limit? }, token)
  // → { contributions[], total, page, pages, totalContributed, memberSummary[] }

api.contributions.add(data: ContributionRequest, token)
api.contributions.void(id, reason, token)           // soft-void
```

---

## Frontend State Rules

**expenses/page.tsx:**
- `mealRate`, `totalExpense` → set from `loadSessions` (`res.liveMealRate`, `res.totalExpense`)
- `totalContrib` → set from `loadContributions` (`res.totalContributed`) — NOT a useMemo
- `memberContribSummary` → set from `loadContributions` (`res.memberSummary`) — NOT a useMemo
- After add/void on contributions tab → always call `loadContributions(1)` to keep backend totals fresh
- `whatIfNewRate` — the only useMemo allowed; it's interactive calculator UI, not financial data

**overview/page.tsx:**
- `mealRate`, `monthExpense`, `balance` → all from `api.members.me` (one call)
- `recentExpenses` → from `api.expenses.getExpenses({ limit: 5 })` (first page only)
- No `getMealRate` call; no frontend expense summing

---

## Skeleton Loading

All loading states use pulse skeletons, never "Loading..." text:
- Stats cards: `skeletonValue` (28px height, 88px wide)
- Session list: 4 `skeletonSessionRow` (date + tag shape on left, amount on right)
- Contribution list: 4 `contribRow` with `skeletonIcon` + `skeletonText` + `skeletonAmt`

CSS: `.skeleton` base class + modifier classes in `expenses.module.css`.

---

## Void Modal

State: `voidModal: { type, id, label } | null`, `voidReason: string`, `voidSubmitting: boolean`

Flow: trash button → `openVoidModal(type, id, label)` → overlay appears with reason input → confirm → `handleVoidConfirm()` → API call → `loadContributions(1)` or optimistic session update → toast.

The modal input has `autoFocus` and supports Enter key to confirm.

---

## UI Architecture

The page has two tabs + a floating Magic Calculator (bottom-right FAB):

**Bazaar Sessions tab:**
- Session cards with expand/collapse to show items. Paginated at 20/page.
- Voided sessions shown with `sessionRowVoided` (red tint), `voidedBadge`, strikethrough amount, and void reason in expanded view.

**Contributions tab:**
- Member deposit list with collapsible member summary card.
- Summary + total come from backend `member_summary` / `total_contributed` — no frontend grouping.
- Paginated at 20/page.
- Voided contributions shown with red icon, strikethrough amount, inline reason.

**Magic Calculator FAB:**
- Smart mode: live stats (meal rate, total expense, total deposited — all from state), what-if expense calculator, per-member breakdown.
- `whatIfNewRate` is the only derived value computed in the frontend (interactive UI only).
- Manual mode: standard 4-function numpad.

---

## i18n Keys

`expenses.*`: `title`, `subtitle`, `addSession`, `addContribution`, `amount`, `category`, `description`, `date`, `mealRate`, `totalExpense`, `addedBy`, `noSessions`, `noContributions`, `sessionsTab`, `contributionsTab`, `shoppers`, `items`, `item`, `note`, `addItem`, `removeItem`, `member`, `sessionDate`, `contributionNote`, `recordedBy`, `categories.*`

`calculator.*`: `title`, `smart`, `manual`, `mealRate`, `totalExpense`, `totalDeposited`, `whatIf`, `whatIfPlaceholder`, `newRate`, `rateChange`, `memberDeposits`, `perMeal`, `noData`, `noDeposits`

Void modal strings are hardcoded in English (not i18n keys).

---

## Common Pitfalls

1. **Session items are `Expense` rows** with `sessionId` set. `nonVoidedExpenseWhere` filters by `session.isVoided: false` via Prisma relation filter.
2. **CONTRIBUTION entries are in `LedgerEntry`**, not `Expense`. They do NOT affect meal rate, only member balance.
3. **Never compute totals in the frontend.** `totalContrib` and `memberSummary` come from the API. If you add a new aggregate, add it to the API response, not a useMemo.
4. **`calculateMonthStats` vs `calculateMealRate`**: use `calculateMonthStats` whenever you need more than just the rate. Never call `calculateMealRate` and then also aggregate expenses separately.
5. **After any write on contributions** (add or void): call `loadContributions(1)` to reload from page 1. This keeps `totalContrib` and `memberSummary` accurate.
6. **`yearMonth` consistency** — `BazaarSession.yearMonth` and each `Expense.yearMonth` must match.
7. **Void is irreversible** — there is no un-void API. The modal warns the user before confirming.
