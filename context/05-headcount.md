# Module 05 — Headcount (Cook View)

## What This Module Does

Shows the cook **3 separate cards** — one per meal slot (Breakfast / Lunch / Dinner) — each with the live headcount for that meal. After each slot's cutoff time passes the card locks, shows a "Meal Cooked ✓" badge, and the count becomes the final number the cook uses. Auto-refreshes every 30 seconds. Accessible to all roles.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/headcount/page.tsx` | Page (client) | 3 slot cards + refresh |
| `src/app/[locale]/(dashboard)/headcount/headcount.module.css` | CSS | Card layout + responsive styles |
| `src/app/api/cook/headcount/route.ts` | API GET | Per-slot counts + cutoff state |

---

## API: GET `/api/cook/headcount`

**Query params:** none — always the caller's own mess. Calls `ensureDailyLogs` first, so every member has today's row.

**Server-side logic:**
1. Auth check (any role)
2. Resolve today + current time from mess settings (Redis) — timezone and per-meal cutoffs
3. Fetch all active non-guest members
4. Fetch all DailyLogs for today (breakfast/lunch/dinner/guestCount per member)
5. Fetch MealConfigs for cutoff times; fall back to `DEFAULT_MEAL_CONFIGS` if table is empty
6. For each slot (BREAKFAST / LUNCH / DINNER):
   - `memberPortions` = sum of `slotCount` across members (members with no log default to 1 — always ON)
   - `guestPortions` = sum of `guestCount` **only for members whose `slotCount > 0`** (guests eat what their host eats)
   - `cutoff_passed` = `nowHHMM >= cutoffTime` (string comparison works — both zero-padded)
7. Return `slots` object + backward-compat top-level lunch fields

**Response (camelCase after api.ts):**
```typescript
{
  messName: string
  date: string           // YYYY-MM-DD (today in mess timezone)
  // Backward-compat for overview (lunch-based)
  memberCount: number
  guestCount: number
  totalHeadcount: number
  source: "database"
  // Per-slot data
  slots: {
    breakfast: HeadcountSlot
    lunch:     HeadcountSlot
    dinner:    HeadcountSlot
  }
}

interface HeadcountSlot {
  memberCount: number    // sum of slot portions (members with no log = 1)
  guestCount: number     // sum of guests whose host has this slot ON
  total: number          // memberCount + guestCount
  cutoffTime: string     // "HH:MM"
  cutoffPassed: boolean  // true once cutoff has passed for this slot
}
```

---

## Guest Attribution Logic (critical)

`DailyLog.guestCount` is a **per-member, per-day** flat integer — it's not per-slot. A member sets "I have N guests today" on the Meals page.

When computing headcount per slot:
- A member's guests count for a slot **only if that member's slot count > 0**
- If a member has lunch ON but dinner OFF, their 2 guests count for lunch but NOT for dinner
- Members with no log (default ON) have guest count = 0 (no log = no explicit guest entry)

```
Example:
  Member A: lunch=1, dinner=1, guests=2  →  lunch gets +2, dinner gets +2
  Member B: lunch=1, dinner=0, guests=1  →  lunch gets +1, dinner gets +0
  Member C: no log (default ON all)      →  counts as 1 for each slot, 0 guests
```

---

## Cutoff Locking

After a slot's `cutoffTime` is reached (in mess timezone):
- `cutoffPassed = true` is returned in the API
- The card gets a green tint + "Meal Cooked ✓" badge
- The footer changes from "Cutoff at HH:MM" → "Cutoff was HH:MM"
- Count shown is the **final, locked count** the cook should use

Meals toggles on the Meals page are also disabled after each slot's cutoff (enforced server-side by `meals/toggle/route.ts`). So the headcount at cutoff time is always the final number.

After all 3 slots' cutoffs pass (end of day), all 3 cards show "Meal Cooked". The next day the first read writes that day's rows from member preferences and all counts reset.

---

## `headcount/page.tsx` — UI Structure

```
Page
 ├── Header (title + refresh button)
 └── slotsGrid (3-column on desktop, stacked on mobile ≤900px)
      ├── SlotCard: Breakfast  (yellow icon)
      ├── SlotCard: Lunch      (primary blue icon)
      └── SlotCard: Dinner     (purple icon)
          ↳ Each card:
              slotHeader: icon + name + [Meal Cooked badge if cutoffPassed]
              slotTotal:  big gradient number
              slotBreakdown: Members: X | Guests: Y (guests row hidden if 0)
              slotCutoff:  🕐 "Cutoff at HH:MM"  OR  ✓ "Cutoff was HH:MM" (green)
```

**Auto-refresh:** every 30 seconds via `setInterval`. Stale badge appears if last update > 60 s ago.

---

## `src/lib/api.ts` — Client Method

```typescript
api.cook.getHeadcount(messId: string, token: string) → Promise<HeadcountResponse>
```

---

## `src/types/index.ts` — Types

```typescript
interface HeadcountSlot {
  memberCount: number
  guestCount: number
  total: number
  cutoffTime: string     // "HH:MM"
  cutoffPassed: boolean
}

interface HeadcountResponse {
  messName: string
  date: string
  memberCount: number    // backward-compat (lunch)
  guestCount: number     // backward-compat (lunch)
  totalHeadcount: number // backward-compat (lunch)
  source: "database"
  slots: { breakfast: HeadcountSlot; lunch: HeadcountSlot; dinner: HeadcountSlot }
}
```

---

## i18n Keys

`headcount.*`: `title`, `subtitle`, `members`, `guests`, `total`, `lastUpdated`, `preparing`, `people`, `breakfast`, `lunch`, `dinner`, `cutoffAt`, `mealCooked`, `cutoffWas`

---

## Common Pitfalls

1. **Guest count is slot-aware** — always compute `guestPortions` per slot (only members with that slot > 0). Never use a flat `totalGuestCount` across all slots.
2. **Members with no log = 1 portion** — errs on over-preparing. This applies to members who haven't set preferences yet or where the morning cron hasn't run.
3. **`cutoffPassed` uses string comparison** — `"13:00" >= "08:30"` works correctly since times are zero-padded HH:MM. Both sides must come from the mess timezone.
4. **Backward-compat top-level fields** — `memberCount`, `guestCount`, `totalHeadcount` reflect the **lunch** slot. Only the overview page uses these. New code should always use `slots.breakfast/lunch/dinner`.
5. **Guests set on the Meals page** — `POST /api/meals/guest` sets `DailyLog.guestCount` (a flat daily count, not per slot). Per-slot guest distribution happens at read time in the headcount API.
6. **Guest residents** (`isGuest`) appear only when they have a row today (they are auto-counted inside their stay dates).
7. **Billing matches the headcount:** guests eat every meal their host eats, and are billed that way (per the guest policy).
