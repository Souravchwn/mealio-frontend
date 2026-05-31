# Module 05 — Headcount (Cook View)

## What This Module Does

Displays a single large number: today's total lunch headcount for the cook. Accessible to all roles. Simple read-only page that auto-refreshes.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/headcount/page.tsx` | Page (client) | Big number display + breakdown |
| `src/app/[locale]/(dashboard)/headcount/headcount.module.css` | CSS | Cook view styles |
| `src/app/api/cook/headcount/route.ts` | API GET | Compute today's lunch headcount |

---

## API: GET `/api/cook/headcount`

**Query params:** `mess_id` (optional, uses JWT messId)

**Server-side logic:**
1. Auth check (any role)
2. Resolve today using mess timezone (`telegramGroups[0].timezone` or `Asia/Dhaka`)
3. Find all active members in the mess
4. Find all DailyLog rows for today
5. For each member:
   - If they have a log: use `lunchCount`
   - If no log: treat as `1` (default ON — new members haven't opted out yet)
6. Sum all member `lunchCount` values → `memberCount`
7. Sum all `guestCount` values → `guestCount`
8. Return `{ memberCount, guestCount, totalHeadcount: memberCount + guestCount }`

**Response:**
```typescript
{
  messName: string
  date: string              // YYYY-MM-DD (today in mess timezone)
  memberCount: number       // sum of lunchCounts for all members
  guestCount: number        // sum of guestCounts
  totalHeadcount: number    // memberCount + guestCount
  source: "database"
}
```

**Key design decision:** Members with NO log are counted as `lunchCount = 1` (default ON). This means the cook sees the correct count even if the morning cron hasn't run yet or for new members.

---

## `src/lib/api.ts` — Client Method

```typescript
api.cook.getHeadcount(messId: string, token: string) → Promise<HeadcountResponse>
```

---

## `src/types/index.ts`

```typescript
interface HeadcountResponse {
  messName: string
  date: string
  memberCount: number
  guestCount: number
  totalHeadcount: number
  source: "database"
}
```

---

## i18n Keys

`headcount.*`: `title`, `subtitle`, `members`, `guests`, `total`, `lastUpdated`, `preparing`, `people`

---

## Common Pitfalls

1. **Only lunch is counted** — not breakfast or dinner. The headcount is specifically for the cook to know how many lunch portions to prepare.
2. **Members with no log = 1 portion** — this is intentional. It errs on the side of over-preparing food rather than under.
3. **Guest count** comes from `DailyLog.guestCount` per member. A member can add guests for themselves via the Meals page or `/meal guest N` Telegram command.
