# Module 03 — Meals (Today's Meal Toggle + Preferences)

## What This Module Does

Lets members toggle their breakfast/lunch/dinner ON or OFF for today, add guests, and set default meal preferences. The entire system is default-driven: DailyLog rows are auto-created from preferences if they don't exist.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/meals/page.tsx` | Page (client) | Toggle UI |
| `src/app/[locale]/(dashboard)/meals/meals.module.css` | CSS | Toggle page styles |
| `src/app/api/meals/today/route.ts` | API GET | Load (or auto-create) today's meal log |
| `src/app/api/meals/toggle/route.ts` | API POST | Toggle a single meal slot |
| `src/app/api/meals/guest/route.ts` | API POST | Set guest count |
| `src/app/api/members/meal-preferences/route.ts` | API GET+PUT | Read/write per-member meal preferences |
| `src/lib/meal-preferences.ts` | Lib (server-only) | getMemberMealDefaults, getBulkMealDefaults |

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
  guestCount       ← INTEGER
  frozen           ← BOOLEAN (true after month is closed)
  isOverride       ← BOOLEAN (false=cron-generated, true=manually changed)
  overrideType     ← 'USER' | 'ADMIN' | 'SYSTEM' | null
  toggledAt        ← DateTime
}
```

**Key rule:** 0 = meal OFF, 1 = one portion ON, 2+ = extra portions (for family, etc.)

---

## API: GET `/api/meals/today`

**Query params:** `member_id` (optional, defaults to JWT sub), `log_date` (optional YYYY-MM-DD, defaults to today)

**Full server-side flow:**
1. Extract + verify JWT
2. Find mess → get `timezone` from `telegramGroups[0].timezone` (fallback: `Asia/Dhaka`)
3. Determine `today` = `Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())`
4. Try `prisma.mealConfig.findMany` for per-meal cutoffs → if error/empty, fall back to `mess.cutOffTime`
5. Determine `cutoffPassed`:
   - If meal_configs exist: find first config where `now < cutoff` → that's the next upcoming cutoff
   - If all configs passed: `cutoffPassed = true`
6. Try `prisma.dailyLog.findFirst` for today
7. If no log found: call `getMemberMealDefaults(memberId, messId, today)` → create new log
8. Return log + cutoff info

**Response (camelCase after api.ts):**
```typescript
{
  id: string
  memberId: string
  date: string              // YYYY-MM-DD (server-computed in mess timezone — never pass client date)
  breakfastCount: number
  lunchCount: number
  dinnerCount: number
  breakfast: boolean        // breakfastCount > 0 (convenience)
  lunch: boolean
  dinner: boolean
  guestCount: number
  frozen: boolean
  // Backward-compat: next upcoming slot cutoff, or last slot if all passed
  cutOffTime: string
  cutOffPassed: boolean     // true only when ALL slots passed OR day is frozen
  // Per-slot cutoff — use these to lock individual meal cards
  slotCutoffs: {
    breakfast: { cutoffTime: string; cutoffPassed: boolean }
    lunch:     { cutoffTime: string; cutoffPassed: boolean }
    dinner:    { cutoffTime: string; cutoffPassed: boolean }
  }
}
```

**Client usage:**
```typescript
// Always call without a date param — server resolves today in mess timezone
const log = await api.meals.getToday(user.id, token)
```

---

## API: POST `/api/meals/toggle`

**Request body:**
```typescript
{
  member_id?: string      // defaults to JWT sub (admin can specify another member)
  date?: string           // defaults to today in mess timezone
  slot: 'breakfast' | 'lunch' | 'dinner'
  count?: number          // integer; preferred — 0=off, 1=on, 2+=extra
  status?: boolean        // legacy; converted to 0 or defaultCount
}
```

**Server-side flow:**
1. Auth check; role check (MEMBER can only toggle own meals)
2. Resolve timezone from mess
3. **Cutoff check** (only for today):
   - Try `prisma.mealConfig.findFirst({ where: { messId, mealType: SLOT_UPPER[slot] } })`
   - Get `cutoffHHMM` from config (or fallback to `mess.cutOffTime`)
   - If `nowHHMM >= cutoffHHMM`: return 403
4. Find or create log (uses `getMemberMealDefaults` if creating)
5. If log.frozen: return 403
6. Determine `newCount`:
   - If `count` provided: use it directly (`Math.max(0, count)`)
   - If `status: true`: use `getMemberMealDefaults()[${slot}Count]` (restores preference)
   - If `status: false`: set to 0
   - If neither: toggle (0 → defaultCount, >0 → 0)
7. Update log with `isOverride: true, overrideType: 'USER', toggledAt: new Date()`
8. Write audit log via `createAudit()`

**Response:** `{ ok: true, count: newCount }`

**Client usage:**
```typescript
await api.meals.toggleMeal({ memberId: user.id, date, slot: 'lunch', status: true }, token)
// or with explicit count:
await api.meals.toggleMeal({ memberId: user.id, date, slot: 'lunch', count: 2 }, token)
```

---

## API: POST `/api/meals/guest`

**Request body:**
```typescript
{ member_id: string, date: string, guest_count: number }
```

Creates log if missing (from preferences). Updates `guestCount`. Does NOT set `isOverride = true` for guests.

---

## API: GET `/api/members/meal-preferences`

Returns the current user's 6 default preferences (3 meals × 2 day types).

**Response:**
```json
{
  "preferences": [
    { "meal_type": "breakfast", "day_type": "WEEKDAY", "enabled": true, "default_count": 1 },
    { "meal_type": "breakfast", "day_type": "WEEKEND", "enabled": false, "default_count": 1 },
    ...
  ]
}
```

**Missing rows:** Defaults to `enabled: true, defaultCount: 1` — no row means always ON with count 1.

**Defensive fallback:** If `defaultCount` column doesn't exist (pre-migration DB), retries query without that field.

---

## API: PUT `/api/members/meal-preferences`

**Request body:**
```typescript
{
  meal_type: 'breakfast' | 'lunch' | 'dinner'
  day_type: 'WEEKDAY' | 'WEEKEND'
  enabled: boolean
  default_count?: number    // defaults to 1
}
```

**Immediately syncs today's DailyLog** if the changed `day_type` matches today:
```typescript
if (todayDayType === day_type && existingLog && !existingLog.frozen) {
  await prisma.dailyLog.update({
    where: { id: existingLog.id },
    data: { [countField]: enabled ? defaultCount : 0 }
  })
}
```

This means changing a preference instantly updates today's log without a page refresh.

---

## `src/lib/meal-preferences.ts` — Server-Only

### `getDayType(date: string): 'WEEKDAY' | 'WEEKEND'`

```typescript
const dow = new Date(`${date}T12:00:00.000Z`).getUTCDay()
return dow === 0 || dow === 6 ? 'WEEKEND' : 'WEEKDAY'
```
Uses UTC noon to avoid timezone edge cases.

### `getMemberMealDefaults(memberId, messId, date): Promise<MealDefaults>`

Returns `{ breakfastCount, lunchCount, dinnerCount }` for ONE member.

Three-level fallback:
1. Query with `defaultCount` column
2. Catch → retry without `defaultCount` (pre-migration)
3. Catch → return `{ breakfastCount: 1, lunchCount: 1, dinnerCount: 1 }`

Logic: finds `UserMealPreference` rows → for each, sets count = `enabled ? defaultCount : 0`. Missing rows default to `{ count: 1 }` (all-on).

### `getBulkMealDefaults(memberIds, messId, date): Promise<Map<string, MealDefaults>>`

Same but for multiple members. Returns a `Map<memberId, MealDefaults>`.
Used by cron job to generate DailyLogs for all members at midnight.

---

## Preference-Aware Status Chips (NEW)

The meals page loads preferences in parallel with the daily log. For each meal card it shows a small chip below the meal name:

| State | Chip | When |
|-------|------|------|
| `default-off` | "Default Off" (gray) | Preference says OFF and slot IS off (system default) |
| `override-on` | "Override On" (amber) | Preference says OFF but user turned slot ON |
| `override-off` | "Override Off" (amber) | Preference says ON but slot is OFF (user turned it off) |
| *(none)* | No chip | Normal: preference ON and slot ON |

Day type is computed client-side (Sat/Sun = WEEKEND, else WEEKDAY). Slight inaccuracy around midnight is acceptable for display purposes.

The API now also returns `is_override: boolean` on the log (false = cron-generated from preferences, true = manually changed).

**Guest note:** The guest section shows a helper text `"+N guest per active meal"` when `guestCount > 0`, clarifying that guests only count for meals where the member is eating.

---

## Meals Page (`meals/page.tsx`) — UI State

```typescript
// Core state
const [log, setLog] = useState<MealLog | null>(null)
const [loading, setLoading] = useState(true)
const [toggling, setToggling] = useState<string | null>(null)  // slot being toggled
```

**On mount:** calls `api.meals.getToday(user.id, token)` → sets log.

**Toggle optimistic update pattern:**
```typescript
setLog(prev => ({ ...prev!, breakfast: !prev!.breakfast }))  // optimistic
try {
  await api.meals.toggleMeal(...)
} catch {
  setLog(prev => ({ ...prev!, breakfast: prev!.breakfast }))  // revert
  toast.error(...)
}
```

**Cutoff display:**
- If `cutOffPassed = false`: shows "Cut-off in HH:MM" badge
- If `cutOffPassed = true`: shows "Cut-off time has passed" warning; toggles are disabled

---

## `src/types/index.ts` — Relevant Types

```typescript
interface DailyLog {
  id: string
  memberId: string
  date: string
  breakfastCount: number; lunchCount: number; dinnerCount: number
  breakfast: boolean; lunch: boolean; dinner: boolean  // convenience
  guestCount: number
  frozen: boolean
  overrideType?: string | null
}

interface MealToggleRequest {
  memberId: string; date: string
  slot: MealSlot        // 'BREAKFAST' | 'LUNCH' | 'DINNER'
  count?: number        // preferred
  status?: boolean      // legacy
}

interface GuestUpdateRequest {
  memberId: string; date: string; guestCount: number
}
```

---

## i18n Keys

`meals.*`: `title`, `subtitle`, `breakfast`, `lunch`, `dinner`, `on`, `off`, `guestCount`, `addGuest`, `removeGuest`, `cutoffPassed`, `cutoffIn`, `allOn`, `allOff`

`settings.mealPreferences.*`: `title`, `subtitle`, `weekday`, `weekend`, `breakfast`, `lunch`, `dinner`, `saved`

---

## Common Pitfalls

1. **Meal slot names:** The `slot` field in `MealToggleRequest` uses `MealSlot` enum (`'BREAKFAST'`), but the page often uses lowercase strings. The API route accepts lowercase too (`slotLower = slot.toLowerCase()`).
2. **Cutoff is per-slot** — use `slotCutoffs.breakfast/lunch/dinner.cutoffPassed` from `getToday` to lock each card independently. Do NOT use the single `cutOffPassed` boolean for this — it's only `true` when ALL slots have passed. Using the wrong one is what allowed toggles after individual slot cutoffs.
3. **"today" date must come from the server** — never compute it client-side (`new Date().toISOString().slice(0, 10)` is UTC). The server returns `log.date` in mess timezone. Store it as `serverDate` and use that for all toggle/guest API calls.
4. **Guest lock uses dinner cutoff** — the guest increment/decrement is disabled only after the dinner cutoff (last meal). Before that, guests can be added/removed even after breakfast and lunch have locked.
5. **Creating logs:** Both `today/route.ts` and `toggle/route.ts` auto-create logs if missing. They call `getMemberMealDefaults()` to seed the initial counts. Don't assume a log exists.
6. **`isOverride` flag:** The cron sets `isOverride: false`. User/admin toggles set `isOverride: true`. Use this to distinguish auto vs manual changes in the matrix.
