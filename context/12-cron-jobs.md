# Module 12 — Cron Jobs

## What This Module Does

Four scheduled HTTP endpoints triggered by Vercel Cron (configured in `vercel.json`). All are protected by `Authorization: Bearer <CRON_SECRET>`. They run autonomously to maintain DailyLog rows, handle guest expiry, and send Telegram reminders.

---

## Files

| File | Schedule | Purpose |
|------|----------|---------|
| `src/app/api/cron/generate-daily-meals/route.ts` | 00:05 daily | Create today's DailyLogs from preferences |
| `src/app/api/cron/deactivate-guests/route.ts` | 00:00 daily | Expire guest members |
| `src/app/api/cron/cutoff-warning/route.ts` | Hourly | Telegram reminder before cutoff |
| `src/app/api/cron/month-end-reminder/route.ts` | 20:00 days 28-31 | Remind admin to close month |

---

## Auth Pattern (all cron routes)

```typescript
const auth = req.headers.get('Authorization')
if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ detail: 'Forbidden' }, { status: 403 })
}
```

Vercel automatically injects this header for scheduled cron routes. For manual testing:
```bash
curl https://your-app.vercel.app/api/cron/generate-daily-meals \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Cron 1: `generate-daily-meals` — 00:05 Daily

**Purpose:** The most critical cron. Ensures every active member has a DailyLog for today, seeded from their meal preferences. Without this, members would need to manually create logs before they can toggle meals.

**Server logic:**
1. Get all active messes
2. For each mess, resolve timezone
3. Compute `today` in that timezone
4. Get all active members in the mess
5. Call `getBulkMealDefaults(memberIds, messId, today)` → Map of member → `{ breakfastCount, lunchCount, dinnerCount }`
6. `createMany` with `skipDuplicates: true` — idempotent (safe to run multiple times)
7. Log results: `{ messName, date, created, skipped }`

**Key function:** `getBulkMealDefaults()` from `src/lib/meal-preferences.ts`

```typescript
// Creates one DailyLog per member
await prisma.dailyLog.createMany({
  data: memberIds.map(memberId => ({
    memberId,
    messId,
    logDate: today,
    breakfastCount: defaults.get(memberId)?.breakfastCount ?? 1,
    lunchCount: defaults.get(memberId)?.lunchCount ?? 1,
    dinnerCount: defaults.get(memberId)?.dinnerCount ?? 1,
    guestCount: 0,
    frozen: false,
    isOverride: false,   // ← cron-generated
    overrideType: null,
  })),
  skipDuplicates: true,
})
```

**`isOverride: false`** marks these as auto-generated. If a member later toggles a meal, the toggle route sets `isOverride: true, overrideType: 'USER'`.

---

## Cron 2: `deactivate-guests` — 00:00 Daily

**Purpose:** Automatically expire guest members when their `guestUntil` date passes.

**Server logic:**
1. Get today in UTC
2. Find all members where `isGuest: true AND isActive: true AND guestUntil < today`
3. Set `isActive: false` for all of them
4. Log: `{ deactivated: count }`

---

## Cron 3: `cutoff-warning` — Hourly

**Purpose:** Send a Telegram reminder to all linked members roughly 30 minutes before their meal cutoff.

**Server logic:**
1. Get all active messes with active Telegram groups
2. For each mess, get meal configs
3. For each config: check if current time is within 30 minutes before `cutoffTime`
4. If so: send bulk Telegram message to all linked members
5. Message format: "⏰ Reminder: Cut-off for [Dinner] in ~30 minutes. Toggle now: /meal off"

---

## Cron 4: `month-end-reminder` — 20:00 on Days 28–31

**Purpose:** Remind the admin to close the month before it ends.

**Server logic:**
1. Check today's date (day 28–31 only)
2. Get all active messes
3. Find the mess's admin member
4. If admin has Telegram linked: send DM reminder
5. Message: "📅 Month end approaching. Don't forget to close the month at [app URL]/matrix"

---

## `vercel.json` — Schedule Configuration

```json
{
  "crons": [
    { "path": "/api/cron/generate-daily-meals", "schedule": "5 0 * * *" },
    { "path": "/api/cron/deactivate-guests",    "schedule": "0 0 * * *" },
    { "path": "/api/cron/cutoff-warning",       "schedule": "0 * * * *" },
    { "path": "/api/cron/month-end-reminder",   "schedule": "0 20 28-31 * *" }
  ]
}
```

**All schedules are UTC.** Since the mess timezone is `Asia/Dhaka` (UTC+6), 00:05 UTC = 06:05 Dhaka time. This means the cron runs just after midnight Dhaka time, correctly.

---

## Common Pitfalls

1. **`generate-daily-meals` idempotency** — `skipDuplicates: true` means it's safe to run multiple times per day. The first run creates logs; subsequent runs are no-ops for existing logs. Members who toggle before the cron still get logs created by `today/route.ts` (which also auto-creates on miss).
2. **Timezone accuracy** — the cron uses each mess's timezone (from `telegramGroups[0].timezone`). If no Telegram group is linked, it falls back to `Asia/Dhaka`. This is fine for the target audience but could be wrong for other timezones.
3. **`getBulkMealDefaults` fallback** — if the `user_meal_preferences` table or `default_count` column doesn't exist, falls back to all-1 counts. Safe for pre-migration databases.
4. **Vercel cron timing** — Vercel Free plan runs crons with up to 1-minute delay. Pro plan has 1-second precision. For a mess app, 1-minute delay is acceptable.
5. **Manual triggering** — during development, crons can be triggered manually with:
   ```bash
   curl http://localhost:3000/api/cron/generate-daily-meals \
     -H "Authorization: Bearer YOUR_CRON_SECRET"
   ```
