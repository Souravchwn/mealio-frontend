# Module 04 — Expenses

## What This Module Does

Lets ADMIN and MANAGER log, edit, and delete bazaar expenses by category. Computes a live meal rate = total_expenses / total_meal_slots. Only ADMIN/MANAGER can see this page (nav is filtered in layout).

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/expenses/page.tsx` | Page (client) | Add/list/edit/delete expenses + meal rate display |
| `src/app/[locale]/(dashboard)/expenses/expenses.module.css` | CSS | Expense page styles |
| `src/app/api/expenses/route.ts` | API GET+POST | List expenses / add expense |
| `src/app/api/expenses/[id]/route.ts` | API PUT+DELETE | Edit / delete a single expense |
| `src/app/api/expenses/meal-rate/route.ts` | API GET | Current live meal rate |
| `src/lib/financial.ts` | Lib (server-only) | `calculateMealRate`, `countMealSlots` |

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

Each category has a color (from `utils.getCategoryColor()`) and icon for the UI dot indicators.

---

## API: GET `/api/expenses`

**Query params:** `mess_id`, `year_month` (YYYY-MM, optional — defaults to current month)

**Response:** Array of `ExpenseResponse` objects:
```typescript
{
  id: string
  messId: string
  memberId: string
  memberName: string
  amount: number
  category: ExpenseCategory
  description: string | null
  date: string          // YYYY-MM-DD
  createdAt: string
  liveMealRate: number  // computed at query time
}
```

**Note:** `addedBy` in DB → `memberId` in response. Member name is joined from the Member table.

---

## API: POST `/api/expenses`

**Roles:** ADMIN or MANAGER only (checked in route).

**Request body:**
```typescript
{
  mess_id: string
  member_id?: string     // who added it (defaults to JWT sub)
  amount: number
  category: ExpenseCategory
  description: string
  date: string           // YYYY-MM-DD
}
```

**Server logic:**
1. Auth + role check
2. Parse `expenseDate` and `yearMonth` from `date` field
3. Create `Expense` row
4. Write audit log: action `'ADD_EXPENSE'`

---

## API: PUT `/api/expenses/[id]`

**Roles:** ADMIN or MANAGER.

**Request body (all optional):**
```typescript
{ amount?, category?, description?, date? }
```

Updates only provided fields. Writes audit log with old vs new values.

---

## API: DELETE `/api/expenses/[id]`

**Roles:** ADMIN or MANAGER.

Soft-delete (actually hard-delete in current implementation). Writes audit log.

---

## API: GET `/api/expenses/meal-rate`

**Query params:** `mess_id`, `year_month`

Calls `calculateMealRate(messId, yearMonth)` from `financial.ts`.

**Response:** `{ messId, yearMonth, mealRate: number }`

---

## `src/lib/financial.ts` — Key Functions Used Here

### `calculateMealRate(messId, yearMonth): Promise<number>`

```typescript
// Gets all expenses and all daily logs for the month
const totalExpense = sum(expenses.amount)
const totalSlots = countMealSlots(logs)  // sum of all counts across all members
return totalSlots === 0 ? 0 : totalExpense / totalSlots
```

### `countMealSlots(logs): number`

```typescript
return logs.reduce(
  (sum, log) => sum + log.breakfastCount + log.lunchCount + log.dinnerCount + log.guestCount,
  0
)
```

**Important:** Guest count is included in meal rate calculation (guests eat too).

### `monthRange(yearMonth): { start: Date, end: Date }`

Converts `"2026-04"` to `{ start: 2026-04-01T00:00:00Z, end: 2026-04-30T00:00:00Z }` for Prisma `where` clauses.

---

## `src/lib/api.ts` — Client Methods

```typescript
api.expenses.getExpenses(messId, yearMonth?, token?)  → Promise<ExpenseResponse[]>
api.expenses.addExpense(data: ExpenseRequest, token)  → Promise<ExpenseResponse>
api.expenses.getMealRate(messId, yearMonth?, token?)  → Promise<{ messId, yearMonth, mealRate }>
api.admin.updateExpense(id, data, token)              → Promise<{ ok: boolean }>
api.admin.deleteExpense(id, token)                    → Promise<{ ok: boolean }>
```

---

## `src/types/index.ts` — Relevant Types

```typescript
interface ExpenseRequest {
  messId: string
  memberId?: string
  amount: number
  category: ExpenseCategory
  description: string
  date: string
}

interface ExpenseResponse {
  id, messId, memberId, memberName
  amount: number
  category: ExpenseCategory
  description: string | null
  date: string
  createdAt: string
  liveMealRate: number
}
```

---

## i18n Keys

`expenses.*`: `title`, `subtitle`, `addExpense`, `amount`, `category`, `description`, `date`, `mealRate`, `totalExpense`, `addedBy`, `noExpenses`, `categories.PROTEIN/CARB/VEGETABLE/SPICE/OIL/UTILITY/OTHER`

---

## Common Pitfalls

1. **`liveMealRate`** in `ExpenseResponse` is computed per-query — it reflects all expenses up to that point, not a cached value. It's expensive to compute but always fresh.
2. **`yearMonth`** is derived from the `date` field on `Expense`. When listing by month, Prisma filters on `expenseDate` using `monthRange(yearMonth)`. Both must be consistent.
3. **Role check**: this page is NOT in the nav for MEMBER role. If a MEMBER tries to access it directly, they get an empty page or 403 from the API. Add role checks on the page itself if needed.
4. **`addedBy` field**: In the DB it's `added_by` (foreign key to Member.id). In the API response it becomes `memberId` and `memberName` is joined separately.
