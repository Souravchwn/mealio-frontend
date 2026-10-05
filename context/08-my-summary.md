# Module 08 — My Summary

## What This Module Does

Shows a member's personal financial summary for the current month: meal rate, total meals eaten, amount contributed, meal cost, and balance. Also shows a 7-day calendar strip of meal history.

**Key principle:** All financial data comes from `GET /api/members/me`. The page does zero calculations — it just displays what the backend returns.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/my-summary/page.tsx` | Page (client) | Stats grid + 7-day calendar strip |
| `src/app/[locale]/(dashboard)/my-summary/my-summary.module.css` | CSS | Page styles |
| `src/app/api/members/me/route.ts` | API GET | Full-month personal stats (single source of truth) |

---

## Data Flow

```
page load
  ├── api.members.me(token, yearMonth)
  │     → { mealRate, totalExpense, myMealCount, contributed, mealCost, balance }
  │     → Sets all stats grid values
  │
  └── api.meals.getToday(user.id, token, dateStr) × 7  [parallel]
        → 7-day calendar strip (read-only display, no auto-create for historical dates)
```

**Never call** `api.expenses.getExpenses` or `api.expenses.getMealRate` from this page. Both of those figures come from `members/me`.

---

## API: GET `/api/members/me`

Query `year_month?`. Built entirely from `calculatePeriodSummary(...).forMember(me)`.

```typescript
{
  memberId, yearMonth, startDate, endDate
  mealRate, totalExpense
  guestMealPolicy: 'HOST' | 'SHARED'
  myMealCount: number     // billable: own (+ guest meals when the host pays)
  ownMealCount: number
  guestMealCount: number  // guests × meals I ate
  deposited: number       // cash deposits this period
  carriedForward: number  // from last month (if carry-forward is on)
  contributed: number     // deposited + carriedForward (+ bazaar credit if enabled)
  mealCost: number
  balance: number         // contributed − mealCost (positive = mess owes you)
}
```
Same numbers as the Matrix and Telegram `/balance`.

## `src/lib/api.ts` — Client Method

```typescript
api.members.me(token, yearMonth?)
  // → { memberId, yearMonth, mealRate, totalExpense, myMealCount, contributed, mealCost, balance }
```

---

## 7-Day Calendar Strip

Calls `api.meals.getToday(user.id, token, dateStr)` for each of the last 7 days. These are **read-only display calls** — `today/route.ts` will NOT auto-create a `DailyLog` for historical dates. If no log exists for a past date, it returns zero counts without writing anything.

---

## Common Pitfalls

### 1. New member phantom meal counts (fixed)

**Problem:** `today/route.ts` used to auto-create a `DailyLog` for any date — including historical dates — when none existed. When my-summary fetched 7 past days for a newly registered member, it triggered 6 log creations with default-ON meal counts. The member's meal count and meal cost would appear non-zero immediately after joining.

**Fix 1 — `today/route.ts`:** Only auto-create for `isToday`. Historical/future dates with no log return zero counts without writing:
```typescript
if (!log) {
  if (!isToday) {
    return NextResponse.json({ id: null, breakfast: false, lunch: false, dinner: false, ... })
  }
  // auto-create only for today
}
```

**Fix 2 — `members/me/route.ts`:** Even if phantom logs exist, filter them out:
```typescript
const validMyLogs = myLogs.filter((l) => l.logDate >= joinedAt)
const myMealCount = countMealSlots(validMyLogs)
```

Both fixes are applied. Fix 1 prevents new phantom logs. Fix 2 is a belt-and-suspenders guard for any phantoms already in the DB.

### 2. Summary shows only 7-day data (was broken, now fixed)

The page previously computed `totalSlots` and `contributed` from only the 7-day log fetch — this was wrong for any member who had been active for more than 7 days. **Now:** all monthly stats come from `members/me`, which uses the full month's `DailyLog` rows.

### 3. Slot breakdown not available

`myMealCount` in `members/me` is a total count (breakfastCount + lunchCount + dinnerCount + guestCount summed). There is no per-slot breakdown (X breakfasts, Y lunches) in the API. The `breakfastCount`, `lunchCount`, `dinnerCount` fields in the page's `MonthlySummary` type are kept at 0. If you need slot breakdown, it would require a new endpoint or extending `members/me`.

### 4. The 7-day strip is display-only

The calendar strip shows meal history. It does NOT affect the stats. Do not use `weekLogs` to compute `totalSlots` or `mealCost` — use `summary.totalSlots` from `members/me`.

---

## `MonthlySummary` Type (page-local)

```typescript
interface MonthlySummary {
  breakfastCount: number  // always 0 — slot breakdown not in API
  lunchCount: number      // always 0
  dinnerCount: number     // always 0
  guestMeals: number      // always 0
  totalSlots: number      // from members/me.myMealCount
  mealCost: number        // from members/me.mealCost
  contributed: number     // from members/me.contributed
  balance: number         // from members/me.balance
  mealRate: number        // from members/me.mealRate
}
```

---

## i18n Keys

`mySummary.*`: `title`, `subtitle`, `mealRate`, `totalMeals`, `contributed`, `mealCost`, `balance`, `mealBreakdown`, `breakfast`, `lunch`, `dinner`, `guestMeals`, `times`, `last7Days`, `financialSummary`
