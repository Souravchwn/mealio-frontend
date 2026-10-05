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

**`calculatePeriodSummary(messId, period)` is the ONE place meal counts, meal rate and balances are calculated.** Matrix, Members, My Summary, Overview, expense stats, Telegram `/rate` + `/balance` and month closing all use it.

### `calculatePeriodSummary(messId, period): Promise<PeriodSummary>`
1. `ensureDailyLogs(messId)` — fills missing days first (see `12-daily-meal-counting.md`)
2. Reads settings (guest policy, bazaar credit) from Redis
3. Meals: open period → logs up to **today** only; closed → whole period. Logs dated before a member joined are ignored (member AND total)
4. Per member: `ownMeals`, `guestMeals` (= `guestCount × meals the host ate`), `billableMeals` (= own + guest under `HOST`, own only under `SHARED`)
5. `mealRate = totalExpense (non-voided) / Σ billableMeals`
6. `deposited` = non-voided `CONTRIBUTION` entries created in the period; `carriedForward` = `CARRY_FORWARD` entries for this period; `bazaarCredit` = expenses the member recorded, **only** if `bazaarCountsAsDeposit`
7. `contributed = deposited + bazaarCredit + carriedForward`; `mealCost = billableMeals × mealRate`; `balance = contributed − mealCost`

Returns `{ guestMealPolicy, bazaarCountsAsDeposit, totalExpense, totalMeals, totalGuestMeals, mealRate, members: Map, forMember(id) }`. Under either policy the members' meal costs add up to the total expense.

### Helpers
| Function | Purpose |
|----------|---------|
| `ownMeals(log)` / `guestMeals(log)` | One day's own / guest portions |
| `countMealSlots(logs, policy)` | Billable meals for a set of logs |
| `nonVoidedExpenseWhere(messId, start, end)` | Prisma filter excluding voided bazaar sessions |
| `endOfPeriodExclusive(end)` | Use for timestamp columns so the last day is included |
| `calculateMonthStats(messId, yearMonth \| null)` / `calculateMealRate(...)` | Thin wrappers over the summary |
| `extractCutoffTime`, `isCutoffPassed` | Cutoff helpers |
| `monthRange(yearMonth)` | Legacy calendar month — migration only |

### `closeMonth(messId, yearMonth, adminId, nextManagerId?)`
- Throws `PeriodNotFinishedError` before the period's last day (mess timezone), `MonthAlreadyClosedError` if closed (guarded inside the transaction, so two clicks can't close twice)
- Transaction: close period (rate, total) → freeze logs → `DEDUCTION` per member with meals → create next period → `CARRY_FORWARD` = full balance per member **only if `carryForwardBalance`** → audit `CLOSE_MONTH`

## `src/lib/mess-settings.ts` — Mess Settings (Redis)

`getMessSettings(messId)` reads Redis key `mealio:mess:<id>:settings:v3`; on a miss loads Postgres and writes Redis (24 h TTL). **After any settings write call `refreshMessSettings(messId)`.** Bump the key version when the shape changes.

```ts
MessSettings {
  messId, name, timezone            // timezone = active Telegram group's, else DEFAULT_TIMEZONE
  cutOffTime, monthStartDay, estimatedMonthlyBudget
  guestMealPolicy: 'HOST' | 'SHARED'
  bazaarCountsAsDeposit: boolean
  carryForwardBalance: boolean
  weekendDays: number[]             // 0 = Sun … 6 = Sat
  meals: { BREAKFAST|LUNCH|DINNER: { enabled, cutoffTime, maxCount } }
}
```
Also: `todayIn(tz)`, `nowHHMMIn(tz)`, `isValidTimezone(tz)`, `parseWeekendDays(raw)`.

## `src/lib/daily-logs.ts` — Automatic Daily Counting

| Function | Purpose |
|----------|---------|
| `ensureDailyLogs(messId)` | Write missing days (open period, up to today) from defaults for active members + guest residents in their stay; then deactivate expired guests; daily cleanup. Redis marker per day |
| `settleDailyLogs(messId)` | Call BEFORE changing preferences, meal configs, weekend days, member status — keeps changes non-retroactive |
| `recordInactiveGap(messId, memberId)` | On reactivation: 0-meal rows for days away |
| `invalidateDailyLogsMarker(messId)` | After membership changes |

## `src/lib/meal-access.ts` — Meal Write Rules

`checkMealWriteAccess(payload, settings, memberId, date)` → members: own log, today/future (≤ 60 days); ADMIN/MANAGER: anyone in their mess. `isActiveMemberOfMess`, `isPrivileged`.

## `src/lib/redis.ts`

Upstash client from `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; `getRedis()` returns null when unset. `redisGet/redisSet/redisDel` never throw.

## `src/lib/meal-preferences.ts` — Server-Only Meal Defaults

| Function | Purpose |
|----------|---------|
| `getDayType(date, weekendDays?)` | WEEKDAY/WEEKEND using the mess's `weekendDays` |
| `getBulkMealDefaults(memberIds, messId, date)` | Preference for that day type, then mess rules: meal off for the mess → 0, cap at `maxCount` |
| `getMemberMealDefaults(memberId, messId, date)` | Same for one member |

## `src/lib/auth-utils.ts` — Server-Only JWT Utilities

| Function | Purpose |
|----------|---------|
| `signToken({ sub, messId, role })` | HS256, 30-day expiry |
| `verifyToken(token)` | Verifies signature **and** re-checks the member in the DB: inactive or removed from the mess → null; returns the CURRENT role (demotions apply immediately) |
| `extractToken(req)` | Bearer token from `Authorization` |
| `clientIp(req)` | `x-real-ip`, else the LAST `x-forwarded-for` entry (not spoofable behind a proxy) |

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

## `src/app/globals.css` — Global Design System

**Affects the entire app.** Contains:
- CSS custom properties (design tokens): colors, spacing, typography, shadows, transitions, z-index, layout widths
- Dark mode overrides under `[data-theme="dark"]`
- Reset (`*, body, a, button, input, img, ul`)
- Utility classes: `.sr-only`, `.focus-ring`, `.glass`, `.gradient-text`
- Global animation keyframes: `fadeIn`, `fadeInUp`, `fadeInDown`, `slideInLeft`, `slideInRight`, `scaleIn`, `pulse`, `shimmer`, `spin`, `countUp`, `float`, `gradientShift`
- Animation utility classes: `.animate-fadeIn`, `.animate-fadeInUp`, `.animate-scaleIn`, `.animate-pulse`, `.animate-spin`, `.animate-float`
- Stagger delay helpers: `.stagger-1` through `.stagger-6`
- `prefers-reduced-motion` override (disables all animations)

### Scrollbar (global)
```css
/* Webkit (Chrome, Safari, Edge) */
::-webkit-scrollbar        { width: 5px; height: 5px; }
::-webkit-scrollbar-track  { background: transparent; }
::-webkit-scrollbar-thumb  { background: linear-gradient(to bottom, --color-primary, #a855f7); border-radius: full; }
::-webkit-scrollbar-corner { background: transparent; }

/* Firefox */
* { scrollbar-width: thin; scrollbar-color: --color-primary transparent; }
```

### Key CSS Variables (light defaults)
| Token | Value | Purpose |
|-------|-------|---------|
| `--color-primary` | `#6366f1` | Indigo — brand primary |
| `--color-accent` | `#f59e0b` | Amber — secondary accent |
| `--color-success` | `#10b981` | Green |
| `--color-danger` | `#ef4444` | Red |
| `--color-bg` | `#f8fafc` | Page background |
| `--color-bg-card` | `#ffffff` | Card / surface |
| `--color-bg-subtle` | `#f1f5f9` | Alternate section bg |
| `--color-text` | `#0f172a` | Primary text |
| `--color-text-secondary` | `#64748b` | Secondary text |
| `--color-text-muted` | `#94a3b8` | Muted / placeholder |
| `--color-border` | `#e2e8f0` | Default border |
| `--sidebar-width` | `260px` | Dashboard sidebar |
| `--topbar-height` | `64px` | Dashboard topbar |
| `--max-content-width` | `1280px` | Page max-width cap |

> **When adding new global tokens:** add to both `:root` and `[data-theme="dark"]` blocks.

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

`checkRateLimit(name, key, max, windowMs)` — Redis fixed window shared by all instances; in-memory fallback. `checkLoginRateLimit(ip, email)` — 10 / 15 min per IP and per email. Registration: 10 / hour per IP. Telegram link codes: 10 / hour per member.

