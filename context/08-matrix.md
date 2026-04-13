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

**Roles:** ADMIN only (returns 403 for others).

**Query params:** `mess_id`, `year_month` (YYYY-MM)

**Server logic:**
1. Get all active members
2. Get all DailyLogs for the month with `monthRange(yearMonth)`
3. Get all Expenses for the month
4. For each member:
   - Build `days[]` from logs (one entry per day in the month)
   - Calculate `totalMeals`, `totalAmount`, `balance`
5. Return full matrix

**Response (camelCase after api.ts):**
```typescript
{
  messId, messName, yearMonth
  mealRate: number
  totalExpense: number
  totalMeals: number
  members: MemberMatrixRow[]
}

interface MemberMatrixRow {
  memberId, memberName, memberRole
  isGuest: boolean
  days: DayEntry[]
  totalMeals: number
  totalAmount: number
  balance: number
}

interface DayEntry {
  logId, memberId, memberName
  date: string              // YYYY-MM-DD
  breakfastCount: number
  lunchCount: number
  dinnerCount: number
  breakfast: boolean        // count > 0
  lunch: boolean
  dinner: boolean
  guestCount: number
  frozen: boolean
}
```

---

## API: PUT `/api/admin/meals`

**Roles:** ADMIN only.

**Request body:**
```typescript
{
  member_id: string
  date: string              // YYYY-MM-DD
  slot: 'breakfast' | 'lunch' | 'dinner'
  count?: number            // integer (preferred)
  value?: boolean           // legacy boolean
}
```

**Server logic:**
1. Find or create DailyLog using `getMemberMealDefaults()` for initial counts
2. If `count` provided: use directly
3. If `value: true`: set to `getMemberMealDefaults()[slotCount]`
4. If `value: false`: set to 0
5. Update log with `isOverride: true, overrideType: 'ADMIN'`
6. Write audit log

**Response:** `{ ok: true, logId: string }`

---

## API: POST `/api/admin/close-month`

**Roles:** ADMIN only.

**Request body:**
```typescript
{ mess_id: string, admin_id: string, year_month: string }
```

Calls `closeMonth(messId, yearMonth, adminId)` from `financial.ts`.

**What `closeMonth()` does (atomic Prisma transaction):**
1. Check month not already closed
2. Get all members, logs, expenses
3. Calculate `mealRate = totalExpense / totalMeals`
4. Upsert `MessMonth` row with `isClosed: true, mealRate, totalExpense`
5. `updateMany` all DailyLogs in range → `frozen: true`
6. Create `LedgerEntry` rows (type `DEDUCTION`) per member: amount = `-(memberMeals × mealRate)`
7. Create `MessMonth` row for NEXT month (if not exists)
8. Create `LedgerEntry` rows (type `CARRY_FORWARD`) for next month with `balance = contributed - mealCost`
9. Write audit log: action `'CLOSE_MONTH'`

**Returns:** `{ mealRate, totalExpense, totalMeals }`

**⚠️ IRREVERSIBLE** — once closed, all logs are frozen and cannot be modified.

---

## API: POST `/api/admin/no-cook`

**Roles:** ADMIN or MANAGER.

**Request body:**
```typescript
{ action: 'on' | 'off', date?: string, reason?: string }
```

**Action `'off'` (No Cook):**
1. Get all active members
2. Set all DailyLog counts to 0 for the date (`breakfastCount: 0, lunchCount: 0, dinnerCount: 0`)
3. `overrideType: 'ADMIN'`
4. Send bulk Telegram notification to all linked members
5. Returns `{ ok, membersUpdated, telegramNotified }`

**Action `'on'` (Restore meals):**
1. Get all active members
2. Call `getBulkMealDefaults()` → get each member's preferences
3. Restore each member's log to their own defaults (not a blanket all-1)
4. `isOverride: false, overrideType: null` (treated as if cron-generated again)
5. Send Telegram notification

---

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

1. **`DayEntry.logId`** is the database ID of the DailyLog. It's `null` for days where no log exists (before cron runs or new member). Handle this when editing cells.
2. **Frozen cells** cannot be edited. Check `DayEntry.frozen` on each cell. `MonthMatrixResponse` does NOT have an `isClosed` field — frozen state is per-log, set by `closeMonth()`. Once a month is closed, every `DayEntry.frozen` in that month will be `true`.
3. **`closeMonth()` creates LedgerEntries in a transaction** — if any step fails, everything rolls back. Common failure: month already closed (throws `"Month is already closed"`).
4. **No-cook broadcast** sends Telegram DMs to all members with `telegramLinked: true`. Members who haven't done `/link` won't receive the notification but their meals are still set to 0.
5. **`overrideType`** is set to `'ADMIN'` for no-cook and admin edits. This distinguishes them from `'USER'` (member self-toggle) and `null`/`'SYSTEM'` (cron).
