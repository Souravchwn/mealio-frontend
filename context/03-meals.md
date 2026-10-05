# Module 03 — Meals (Today's Meal Toggle + Preferences)

## What This Module Does

Lets members toggle their breakfast/lunch/dinner for today or future days, add guests, and set default meal preferences.

The system is **default-driven and automatic**: every active member is counted every day from their default preferences — nobody has to log in or tap anything. Members only act when they want an exception. How the automatic counting works (and why it does not depend on who opens the app) is in **`12-daily-meal-counting.md`** — read it before changing anything here.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/meals/page.tsx` | Page (client) | Toggle UI |
| `src/app/[locale]/(dashboard)/meals/meals.module.css` | CSS | Toggle page styles |
| `src/app/api/meals/today/route.ts` | API GET | Load today's (or a given day's) meal log |
| `src/app/api/meals/toggle/route.ts` | API POST | Change one meal slot |
| `src/app/api/meals/guest/route.ts` | API POST | Set guest count |
| `src/app/api/members/meal-preferences/route.ts` | API GET+PUT | Read/write a member's default meals |
| `src/lib/meal-preferences.ts` | Lib (server-only) | `getDayType`, `getMemberMealDefaults`, `getBulkMealDefaults` |
| `src/lib/meal-access.ts` | Lib (server-only) | Who may change which log, and when |
| `src/lib/daily-logs.ts` | Lib (server-only) | Automatic daily counting (`ensureDailyLogs`, `settleDailyLogs`) |
| `src/lib/mess-settings.ts` | Lib (server-only) | Mess settings served from Redis (cutoffs, weekend, policies) |

---

## Core Data Model: `DailyLog`

```
DailyLog {
  id
  memberId
  messId
  logDate          ← Date (UTC midnight, e.g. 2026-04-13T00:00:00.000Z)
  breakfastCount   ← INTEGER (0=off, 1=normal, 2+=extra)
  lunchCount       ← INTEGER
  dinnerCount      ← INTEGER
  guestCount       ← INTEGER — guests eat every meal the host eats that day
  frozen           ← BOOLEAN (true after month is closed — nothing can change it)
  isOverride       ← BOOLEAN (false = auto from defaults, true = changed by hand)
  overrideType     ← 'USER' | 'ADMIN' | 'SYSTEM' | null
  toggledAt        ← DateTime
}
```

**Key rule:** 0 = meal OFF, 1 = one portion ON, 2+ = extra portions (family, etc.). Never more than the meal's `maxCount`.

`overrideType = 'SYSTEM'` marks days written as 0 for a member who was inactive (see `recordInactiveGap`).

---

## Who may change what (`src/lib/meal-access.ts`)

| Who | Whose log | Which days |
|-----|-----------|-----------|
| MEMBER / GUEST | own only | today (before that meal's cutoff) and up to 60 days ahead |
| ADMIN / MANAGER | anyone in their own mess | any day that is not frozen |

- Past days are read-only for members — nobody can lower last week's meals to cut their bill.
- The target member must be an active member of the caller's mess (`isActiveMemberOfMess`).
- A meal switched off for the whole mess (`meal_configs.enabled = false`) cannot be turned on.
- Counts must be whole numbers `0 … maxCount`; guests `0 … MAX_GUEST_COUNT` (20).

The Telegram bot (`/meal`) applies the same limits — see `11-telegram-bot.md`.

---

## API: GET `/api/meals/today`

**Query params:** `member_id` (optional; only ADMIN/MANAGER may pass someone else), `log_date` (optional YYYY-MM-DD, defaults to today in mess timezone)

**Server-side flow:**
1. `verifyToken` (re-checks the member is active, returns current role)
2. `getMessSettings(messId)` — timezone, per-meal cutoffs, weekend days, guest policy (from Redis)
3. `today` = today in the mess timezone
4. Per-slot cutoff state for today; past/future days are never cut off
5. If today: `ensureDailyLogs(messId)` — makes sure today's log exists for **every** member of the mess
6. Load the log. Today with no log (rare) → create from defaults. Past/future with no log → return zeros, never create phantom rows
7. Return log + cutoff info + `guest_meal_policy` + `day_type`

**Response (camelCase after api.ts):**
```typescript
{
  id: string | null
  memberId: string
  date: string              // YYYY-MM-DD in mess timezone — never compute client-side
  breakfastCount: number; lunchCount: number; dinnerCount: number
  breakfast: boolean; lunch: boolean; dinner: boolean   // count > 0
  guestCount: number
  frozen: boolean
  isOverride: boolean
  cutOffTime: string        // next upcoming slot cutoff, or last slot if all passed
  cutOffPassed: boolean     // true only when ALL slots passed OR day is frozen
  slotCutoffs: {
    breakfast: { cutoffTime: string; cutoffPassed: boolean }
    lunch:     { cutoffTime: string; cutoffPassed: boolean }
    dinner:    { cutoffTime: string; cutoffPassed: boolean }
  }
  guestMealPolicy: 'HOST' | 'SHARED'
  dayType: 'WEEKDAY' | 'WEEKEND'   // per the mess's weekend setting
}
```

---

## API: POST `/api/meals/toggle`

**Request body:**
```typescript
{
  member_id?: string      // defaults to caller; others need ADMIN/MANAGER
  date?: string           // defaults to today in mess timezone
  slot: 'breakfast' | 'lunch' | 'dinner'
  count?: number          // 0 … maxCount
  status?: boolean        // true = restore member's default portions, false = 0
}
```

**Server-side flow:**
1. Auth; `checkMealWriteAccess` (rules above)
2. Today + `now >= slot cutoff` → 403
3. Find or create the log (create uses `getMemberMealDefaults`)
4. Frozen → 403
5. New count: `count` as given; `status:true` / toggle-on → member's default portions (min 1, capped at `maxCount`); off → 0
6. Turning on a mess-disabled meal → 400
7. Update with `isOverride: true, overrideType: 'USER'`; audit `TOGGLE_MEAL` with old and new value

**Response:** `{ ok: true, count }`

---

## API: POST `/api/meals/guest`

**Request body:** `{ member_id?: string, date?: string, guest_count: number }`

- Same access rules as toggle. For members, today's guests lock after the **last enabled meal's** cutoff.
- Creates the log from defaults if missing; frozen → 403; audited.
- **Billing:** guests eat every meal their host eats that day. Under `guestMealPolicy = HOST` (default) those guest meals are charged to the host only; under `SHARED` they are left out of everyone's count and the cost spreads through the meal rate. See `13-shared-libs.md` → `calculatePeriodSummary`.

---

## API: GET `/api/members/meal-preferences`

Returns the caller's 6 defaults (3 meals × WEEKDAY/WEEKEND). Missing rows → `enabled: true, default_count: 1`.

## API: PUT `/api/members/meal-preferences`

**Request body:** `{ meal_type, day_type: 'WEEKDAY' | 'WEEKEND', enabled: boolean, default_count?: 1 … maxCount }`

**A default change is never retroactive:**
1. `settleDailyLogs(messId)` — every day so far is recorded with the OLD defaults first
2. Save the preference (audited as `MEAL_PREFERENCE_UPDATE`)
3. Today's log follows the new default **only** if today is that day type, that meal's cutoff has not passed, the day is not frozen, and the member has not already changed today by hand (`isOverride = false`)

**Response:** `{ ok: true, applied_today: boolean }` — when false, the change starts from the next day.

---

## `src/lib/meal-preferences.ts` — Server-Only

### `getDayType(date, weekendDays = DEFAULT_WEEKEND_DAYS)`
`weekendDays` are JS weekday numbers (0 = Sun … 6 = Sat) from the mess setting `weekendDays` (default `[0, 6]`; Bangladesh messes usually set `[5, 6]` = Fri + Sat). Uses UTC noon to avoid timezone edges.

### `getBulkMealDefaults(memberIds, messId, date)` / `getMemberMealDefaults(memberId, messId, date)`
Member's preference for that day type (`enabled ? defaultCount : 0`; missing row → 1), **then mess rules**: a meal switched off for the mess → 0, counts capped at `maxCount`.

---

## Meals Page (`meals/page.tsx`)

- Loads `getToday` + preferences in parallel. Day type comes from the server (`log.dayType`) — not computed in the browser.
- Each card locks on its own `slotCutoffs.<slot>.cutoffPassed`.
- Status chips compare the slot to today's default: `default-off`, `override-on`, `override-off`.
- Guest section shows who pays: `meals.guestHostPays` or `meals.guestShared` depending on `guestMealPolicy`.
- All calls use `serverDate` (`log.date`), never a browser date.

---

## i18n Keys

`meals.*`: `title`, `subtitle`, `breakfast`, `lunch`, `dinner`, `on`, `off`, `guestCount`, `addGuest`, `removeGuest`, `cutoffPassed`, `cutoffIn`, `allOn`, `allOff`, `guestPortions`, `guestHostPays`, `guestShared`

`settings.mealPreferences.*`: `title`, `subtitle`, `weekday`, `weekend`, `breakfast`, `lunch`, `dinner`, `saved`

---

## Common Pitfalls

1. **Never write a DailyLog from a new code path without the access rules** — use `checkMealWriteAccess` (web) or the `MealService` (bot). Both enforce cutoff, frozen, max count, and mess-disabled meals.
2. **Before changing anything that affects defaults** (preferences, meal configs, weekend days, member status) call `settleDailyLogs(messId)` first — otherwise days not yet recorded get filled with the NEW settings.
3. **Cutoff is per-slot** — use `slotCutoffs.<slot>.cutoffPassed`. `cutOffPassed` is only true when ALL slots have passed.
4. **"today" comes from the server** in the mess timezone. Never `new Date().toISOString().slice(0, 10)` (that is UTC).
5. **Future days** can be planned (logs exist), but the meal rate only counts days up to today.
6. **`isOverride`**: false = auto from defaults, true = changed by hand. A default change never overwrites a hand-changed day.
