# Module 13 — Shared Libraries

## Overview

These files are used across many modules. Read this before modifying any shared utility to understand all callers.

---

## `src/lib/api.ts` — Frontend API Client

The single API surface for all client components. **Never call `fetch()` directly in components** (except for endpoints not yet added here).

### Auto-conversion
- **Requests:** `deepSnake()` converts all keys in request body to `snake_case` before sending
- **Responses:** `deepCamel()` converts all keys in response to `camelCase` before returning

This means you write camelCase everywhere in TypeScript and the API handles the rest.

### Method Groups

```typescript
api.auth.login(data)                              // POST /api/auth/login
api.auth.register(data)                           // POST /api/auth/register

api.meals.getToday(memberId, token, logDate?)      // GET /api/meals/today
api.meals.toggleMeal(data, token)                 // POST /api/meals/toggle
api.meals.updateGuest(data, token)                // POST /api/meals/guest

api.mealPreferences.getAll(token)                 // GET /api/members/meal-preferences
api.mealPreferences.update(data, token)           // PUT /api/members/meal-preferences

api.mealConfigs.list(token)                       // GET /api/mess/meal-configs
api.mealConfigs.update(data, token)               // PUT /api/mess/meal-configs

api.expenses.getExpenses(messId, yearMonth?, token?)   // GET /api/expenses
api.expenses.addExpense(data, token)              // POST /api/expenses
api.expenses.getMealRate(messId, yearMonth?, token?)   // GET /api/expenses/meal-rate

api.members.list(messId, token)                   // GET /api/members
api.members.me(token, yearMonth?)                 // GET /api/members/me

api.mess.list(token)                              // GET /api/mess
api.mess.create(data, token)                      // POST /api/mess
api.mess.switchMess(messId, token)                // GET /api/mess/[messId]/switch

api.cook.getHeadcount(messId, token)              // GET /api/cook/headcount

api.admin.getMatrix(messId, yearMonth?, token?)   // GET /api/admin/matrix
api.admin.closeMonth(data, token)                 // POST /api/admin/close-month
api.admin.editMeal(data, token)                   // PUT /api/admin/meals
api.admin.noCook(data, token)                     // POST /api/admin/no-cook
api.admin.updateMember(memberId, data, token)     // PUT /api/members/[id]
api.admin.getAuditLog({ page?, limit?, action? }, token)  // GET /api/admin/audit → { entries[], total, page, pages }
api.admin.updateExpense(id, data, token)          // PUT /api/expenses/[id]
api.admin.deleteExpense(id, token)                // DELETE /api/expenses/[id]
api.admin.updateSettings(data, token)             // PUT /api/mess/settings
```

### Adding a New API Method

```typescript
// In api.ts:
yourModule: {
  yourMethod: (data: YourRequest, token: string) =>
    fetcher<YourResponse>('/api/your-route', {
      method: 'POST',
      body: data,   // auto-converted to snake_case
      token,
    }),
}

// Add the type to src/types/index.ts
// Add the import at the top of api.ts if needed
```

---

## `src/lib/financial.ts` — Server-Only Financial Logic

**Import only in API routes.** Never import in client components.

### `monthRange(yearMonth: string): { start: Date, end: Date }`

Converts `"2026-04"` to UTC Date objects for Prisma queries.
```typescript
// Input: "2026-04"
// Output: { start: 2026-04-01T00:00:00.000Z, end: 2026-04-30T00:00:00.000Z }
```
Used in almost every API route that queries by month.

### `countMealSlots(logs: MealSlotData[]): number`

```typescript
type MealSlotData = { breakfastCount, lunchCount, dinnerCount, guestCount }
// Returns sum of ALL counts across ALL logs (including guests)
```

This is the denominator for meal rate calculation. Guests count as 1 meal slot each.

### `extractCutoffTime(cutOffTime: Date | null): string`

Converts Prisma `@db.Time` field (stored as 1970-01-01T{HH:MM}Z Date) to `"HH:MM"` string.
Falls back to `DEFAULT_CUTOFF_TIME` ("21:00") if null.

### `isCutoffPassed(cutoffHHMM, checkDate, timezone): boolean`

Returns `false` for any date that's not today. For today, compares current time vs cutoff.
Timezone-aware using `Intl.DateTimeFormat`.

### `calculateMemberBalance(contributed, memberMeals, mealRate): number`

```typescript
return contributed - memberMeals * mealRate
// Positive = overpaid (member gets money back)
// Negative = owes money
```

### `calculateMealRate(messId, yearMonth): Promise<number>`

Async DB query: `totalExpense / totalMealSlots`. Returns 0 if no meals.

### `closeMonth(messId, yearMonth, adminId): Promise<{ mealRate, totalExpense, totalMeals }>`

Atomic Prisma transaction. See Module 08 for full details. **Irreversible.**

---

## `src/lib/meal-preferences.ts` — Server-Only Meal Defaults

**Import only in API routes and cron jobs.**

### `getDayType(date: string): 'WEEKDAY' | 'WEEKEND'`

```typescript
// Input: "2026-04-13" (Monday)
// Output: "WEEKDAY"
// Uses UTC noon (12:00Z) to avoid DST edge cases
```

### `getMemberMealDefaults(memberId, messId, date): Promise<MealDefaults>`

Returns `{ breakfastCount, lunchCount, dinnerCount }` for one member.

**Three-level defensive fallback:**
1. Query `userMealPreference` with `defaultCount` → use `enabled ? defaultCount : 0`
2. If error: retry without `defaultCount` → use `enabled ? 1 : 0`
3. If error: return `{ breakfastCount: 1, lunchCount: 1, dinnerCount: 1 }`

**Missing rows = all ON** (no preference row = member hasn't customized = uses default 1).

### `getBulkMealDefaults(memberIds, messId, date): Promise<Map<string, MealDefaults>>`

Same but for multiple members. Returns `Map<memberId, MealDefaults>`. Used by:
- `cron/generate-daily-meals` — to seed all members' logs
- `admin/no-cook` action "on" — to restore all members' meals
- `NoMealService.enableAllMeals()` — same purpose

---

## `src/lib/auth-utils.ts` — Server-Only JWT Utilities

**Import only in API routes.** See Module 01 for full details.

```typescript
signToken(payload: TokenPayload): Promise<string>
verifyToken(token: string): Promise<TokenPayload | null>
extractToken(req: NextRequest): string | null

interface TokenPayload { sub: string, messId: string, role: string }
```

---

## `src/lib/utils.ts` — Client-Side Utilities

**Safe to import anywhere** (no server-only APIs).

```typescript
formatCurrency(amount: number): string
// → "৳ 1,234.56" (BDT formatting)

formatDate(dateStr, format: 'short'|'long'|'day'): string
// short: "Apr 13"
// long: "April 13, 2026"
// day: "Mon, Apr 13"

getTodayISO(): string
// → "2026-04-13" (client local time)

getCurrentYearMonth(): string
// → "2026-04" (client local time)

getCategoryColor(category: ExpenseCategory): string
// → hex color string for category dot

getCategoryIcon(category: ExpenseCategory): string
// → lucide icon name for category

getTimeOfDay(): 'morning' | 'afternoon' | 'evening'
// Based on client local hour: <12=morning, <17=afternoon, >=17=evening

cn(...classes: (string|false|undefined|null)[]): string
// Class name joiner: cn("a", false, "b") → "a b"

getInitials(name: string): string
// "Sourav Chowhan" → "SC" (up to 2 chars, uppercase)
```

---

## `src/lib/constants.ts`

```typescript
DEFAULT_CUTOFF_TIME = "21:00"          // Dinner cutoff fallback
DEFAULT_LUNCH_CUTOFF_TIME = "10:00"    // Lunch cutoff fallback (deprecated — use meal_configs)
DEFAULT_TIMEZONE = "Asia/Dhaka"        // Fallback when no Telegram group linked
VALID_MEAL_SLOTS = ['breakfast', 'lunch', 'dinner'] as const
MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER'] as const
DEFAULT_MEAL_CONFIGS = [
  { mealType: 'BREAKFAST', cutoffTime: '08:30' },
  { mealType: 'LUNCH',     cutoffTime: '13:00' },
  { mealType: 'DINNER',    cutoffTime: '21:00' },
]
VALID_ROLES = ['ADMIN', 'MANAGER', 'MEMBER', 'GUEST', 'SYSTEM_ADMIN'] as const
```

---

## `src/types/index.ts` — All Types

### Enums
```typescript
Role: 'ADMIN' | 'MANAGER' | 'MEMBER' | 'GUEST'
MealSlot: 'BREAKFAST' | 'LUNCH' | 'DINNER'
ExpenseCategory: 'PROTEIN' | 'CARB' | 'VEGETABLE' | 'SPICE' | 'OIL' | 'UTILITY' | 'OTHER'
MonthStatus: 'OPEN' | 'CLOSED'
```

### Key Interfaces
```typescript
User { id, name, email, role, messId, messName }
DailyLog { id, memberId, date, breakfastCount, lunchCount, dinnerCount, breakfast, lunch, dinner, guestCount, frozen, overrideType? }
MealConfig { id, messId, mealType, enabled, cutoffTime: string, maxCount }
Member { id, messId, name, phone?, telegramUid?, telegramLinked, role, isActive, isGuest, balance }
Expense { id, messId, memberId, memberName?, amount, category, description, date, createdAt }
MonthlySnapshot { id, messId, yearMonth, totalExpense, mealRate, totalMeals, isClosed, closedAt? }
MonthMatrixResponse { messId, messName, yearMonth, mealRate, totalExpense, totalMeals, members: MemberMatrixRow[] }
MemberMatrixRow { memberId, memberName, memberRole, isGuest, days: DayEntry[], totalMeals, totalAmount, balance }
DayEntry { logId, memberId, memberName, date, breakfastCount, lunchCount, dinnerCount, breakfast, lunch, dinner, guestCount, frozen }
MessSwitchResponse { accessToken, refreshToken, mess: { id, name } }
AuthResponse { accessToken, refreshToken, user: User }
HeadcountResponse { messName, date, memberCount, guestCount, totalHeadcount, source }
```

---

## `src/lib/audit.ts` — Audit Logging

```typescript
createAudit({
  messId: string,
  actorId: string,
  action: string,           // 'TOGGLE_MEAL', 'ADD_EXPENSE', 'UPDATE_MEMBER', 'CLOSE_MONTH', etc.
  targetTable: string,      // 'daily_logs', 'expenses', 'members', etc.
  targetId: string,
  oldValue?: unknown,       // JSON-serializable
  newValue?: unknown,       // JSON-serializable
}): Promise<void>
```

Creates an `AuditLog` row. Used by all admin-level operations. Failures are swallowed (audit logging should never break the main operation).

---

## `src/lib/prisma.ts`

```typescript
// Singleton Prisma client with @prisma/adapter-pg
// Server-only. Uses DATABASE_URL (transaction pooler, port 6543)
export const prisma: PrismaClient
```

**Never import in client components.** The adapter-pg pattern is required for Vercel Edge/Serverless compatibility.

---

## `src/lib/rate-limit.ts`

Simple in-memory rate limiter for API routes (not the Telegram bot one).

```typescript
const limiter = rateLimit({ interval: 60_000, uniqueTokenPerInterval: 500 })
await limiter.check(res, 10, 'CACHE_TOKEN')  // 10 requests per minute per token
```

Used in auth routes to prevent brute-force attacks.
