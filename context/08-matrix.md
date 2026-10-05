# Module 08 — Admin Matrix Page

## What This Module Does

Full monthly attendance matrix: every member × every day. Admins can edit individual meal cells, run "No Cook" (all meals off for a day), and close the month (freeze logs + compute balances). ADMIN only.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/matrix/page.tsx` | Page (client) | Matrix table + close month + no-cook |
| `src/app/[locale]/(dashboard)/matrix/matrix.module.css` | CSS | Matrix table styles |
| `src/app/api/admin/matrix/route.ts` | API GET | Full month data (members × days) |
| `src/app/api/admin/meals/route.ts` | API PUT | Edit any member's meal slot |
| `src/app/api/admin/close-month/route.ts` | API POST | Freeze month + compute balances |
| `src/app/api/admin/no-cook/route.ts` | API POST | Toggle all members' meals ON/OFF |
| `src/lib/financial.ts` | Lib (server-only) | `closeMonth()` |

---

## API: GET `/api/admin/matrix`

**Roles:** ADMIN or MANAGER. **Query:** `year_month` (YYYY-MM). The mess is always the caller's own (`mess_id` is ignored).

**Server logic:** `resolvePeriod` → `calculatePeriodSummary` (fills missing days first) → logs for the period → one row per active member with the summary's numbers.

```typescript
{
  messId, messName, yearMonth, startDate, endDate, isClosed
  mealRate, totalExpense
  totalMeals: number          // billable meals (rate denominator)
  totalGuestMeals: number
  guestMealPolicy: 'HOST' | 'SHARED'
  carryForwardBalance: boolean
  members: MemberMatrixRow[]
}
MemberMatrixRow { memberId, memberName, memberRole, isGuest, guestFrom?, guestUntil?, days: DayEntry[],
                  ownMeals, guestMeals, totalMeals /* billable */, totalAmount, contributed, balance }
DayEntry { logId, date, breakfastCount, lunchCount, dinnerCount, breakfast, lunch, dinner,
           guestCount, guestMeals?, frozen }
```
After an admin edit the page refetches, because rate and balances change for everyone.

## API: PUT `/api/admin/meals`

**Roles:** ADMIN only. Body `{ member_id, date, slot, count? | value? }`.
- `count` 0 … maxCount; `value: true` restores the member's default portions (not always 1); `value: false` → 0
- Member must be in the admin's mess; frozen day → 400
- Creates the log from defaults if missing; `isOverride: true, overrideType: 'ADMIN'`; audit `ADMIN_MEAL_OVERRIDE`

## API: POST `/api/admin/close-month`

**Roles:** ADMIN only. Body `{ year_month: 'YYYY-MM', next_manager_id? }` — `mess_id` is ignored (always the admin's own mess); `next_manager_id` must be an active member.

`closeMonth()` (see `13-shared-libs.md`):
- **Only on or after the period's last day** → 400 otherwise (closing early would leave days unbilled)
- Already closed → 409 (checked inside the transaction)
- Freeze logs → `DEDUCTION` per member → next period → `CARRY_FORWARD` (full balance incl. deposits) **only if `carryForwardBalance`** → audit

**⚠️ IRREVERSIBLE.** After closing, nothing dated in that period can change: meals, guests, expenses, sessions, deposits, no-cook (web and Telegram).

## API: POST `/api/admin/no-cook`

**Roles:** ADMIN or MANAGER. Body `{ action: 'on' | 'off', date?, reason? }` (date defaults to today in mess timezone).
- Closed-month date → 400
- `off`: every active member's counts → 0 (`overrideType: 'ADMIN'`)
- `on`: each member back to their own defaults (`isOverride: false`)
- Audit `NO_COOK`; Telegram broadcast to linked members
- Same rules for `/nomeal` and `/mealon` in the bot

## `matrix/page.tsx` — UI State

```typescript
const [matrix, setMatrix] = useState<MonthMatrixResponse | null>(null)
const [yearMonth, setYearMonth] = useState(getCurrentYearMonth())
const [editing, setEditing] = useState<{ memberId: string; date: string; slot: string } | null>(null)
```

**Cell editing optimistic update:**
```typescript
setMatrix(prev => {
  // Find the day entry and update the count + boolean
  const newCount = newValue ? 1 : 0
  // Update DayEntry: breakfastCount = newCount, breakfast = newCount > 0
  return updatedMatrix
})
```

**Close month confirmation:** Shows a confirm dialog (`window.confirm` or custom modal) before calling `api.admin.closeMonth()`.

---

## `src/types/index.ts` — Relevant Types

```typescript
interface MonthMatrixResponse {
  messId, messName, yearMonth
  mealRate: number
  totalExpense: number
  totalMeals: number
  members: MemberMatrixRow[]
}

interface MemberMatrixRow {
  memberId, memberName, memberRole
  isGuest: boolean
  guestFrom?, guestUntil?
  days: DayEntry[]
  totalMeals, totalAmount, balance: number
}

interface DayEntry {
  logId, memberId, memberName, date
  breakfastCount, lunchCount, dinnerCount: number
  breakfast, lunch, dinner: boolean
  guestCount: number
  frozen: boolean
}

interface CloseMonthRequest {
  messId, adminId, yearMonth: string
}
```

---

## `src/lib/api.ts` — Client Methods

```typescript
api.admin.getMatrix(messId, yearMonth?, token?)         → Promise<MonthMatrixResponse>
api.admin.editMeal({ memberId, date, slot, value }, token) → Promise<{ ok, logId }>
api.admin.closeMonth({ messId, adminId, yearMonth }, token) → Promise<unknown>
api.admin.noCook({ action, date?, reason? }, token)    → Promise<{ ok, membersUpdated, telegramNotified }>
```

---

## i18n Keys

`matrix.*`: `title`, `subtitle`, `member`, `totalMeals`, `amount`, `balance`, `closeMonth`, `exportCsv`, `monthClosed`, `confirmClose`, `closeSuccess`, `summary.totalExpense/totalMeals/mealRate/members`

---

## Common Pitfalls

1. **`DayEntry.logId`** is the database ID of the DailyLog. Days are filled automatically up to today; a missing day means the member had not joined yet (or is a guest outside their stay). Handle this when editing cells.
2. **Frozen cells** cannot be edited. Check `DayEntry.frozen` on each cell. `MonthMatrixResponse` does NOT have an `isClosed` field — frozen state is per-log, set by `closeMonth()`. Once a month is closed, every `DayEntry.frozen` in that month will be `true`.
3. **`closeMonth()` creates LedgerEntries in a transaction** — if any step fails, everything rolls back. Common failure: month already closed (throws `"Month is already closed"`).
4. **No-cook broadcast** sends Telegram DMs to all members with `telegramLinked: true`. Members who haven't done `/link` won't receive the notification but their meals are still set to 0.
5. **`overrideType`** is set to `'ADMIN'` for no-cook and admin edits. This distinguishes them from `'USER'` (member self-toggle) `null` (auto-filled from defaults) and `'SYSTEM'` (0-meal day while a member was inactive).
