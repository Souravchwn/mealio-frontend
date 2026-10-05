# Module 12 — Daily Meal Counting (no cron jobs)

## The rule

> Every active member is counted **every day** from their default meal settings, unless a meal is switched off — automatically, without anyone logging in. Members (or the manager) only act for exceptions.

There are **no cron jobs** and no `vercel.json` schedule. The daily rows are written on demand, but the result is the same as a job that ran at midnight with the settings of that day.

---

## Files

| File | Purpose |
|------|---------|
| `src/lib/daily-logs.ts` | `ensureDailyLogs`, `settleDailyLogs`, `recordInactiveGap`, `invalidateDailyLogsMarker`, daily cleanup |
| `src/lib/meal-preferences.ts` | A member's defaults for a date (preferences + mess rules + weekend days) |
| `src/lib/mess-settings.ts` | Mess settings from Redis: timezone, per-meal enabled/cutoff/max, weekend days, policies |
| `src/lib/financial.ts` | `calculatePeriodSummary` — counts meals, rate, balances (calls `ensureDailyLogs` first) |

---

## How a day gets counted

```
                    anything reads meal data          anything changes a default
             (any page, headcount, bot command,      (preference, meal on/off, weekend,
              meal rate, balances, close month)        member status / guest dates)
                              │                                    │
                              ▼                                    ▼
                      ensureDailyLogs(messId)  ◄──────────  settleDailyLogs(messId)
                              │                              (then the change is saved)
        for each day of the open period, up to today (mess timezone):
          for each active member (and guest resident inside their stay dates),
          joined on or before that day, with NO row yet:
              write a row = member defaults for that day
              (preference for WEEKDAY/WEEKEND → 0 if the meal is off for the mess → cap at maxCount)
                              │
                              ▼
          deactivate guest residents whose stay ended  →  Redis marker for today
```

- **Not tied to logins.** Any read for the mess fills in *every* member's missing days, including members who never open the app. Whoever looks first, the rows are identical.
- **Never retroactive.** Every action that changes a default calls `settleDailyLogs` first, so all days up to today are written with the settings that were in force. The new setting only affects days after that.
- **Idempotent.** `createMany(..., skipDuplicates)`; a row that exists (auto or hand-changed) is never overwritten by the fill.
- **Cheap.** After the first run of the day a Redis key `mealio:mess:<id>:logs-ensured:<date>` makes later calls a single GET. Without Redis it just runs each time.

### Membership changes (`PUT /api/members/[id]`)
1. `settleDailyLogs` — record days so far under the old status
2. Save the change
3. Reactivated member → `recordInactiveGap` writes **0-meal rows** (`overrideType: 'SYSTEM'`) for the days they were away in this period, so the fill never charges them for that time
4. `invalidateDailyLogsMarker` — today's fill runs again

### New members (`POST /api/auth/register`)
Counted from their `joinedAt` day. The marker is cleared so they are included today.

### Guest residents (`isGuest = true`)
Counted only between `guestFrom` and `guestUntil` (each optional). On the first fill after `guestUntil`, their last days are written and then they are deactivated (audit `AUTO_DEACTIVATE_GUEST`).

---

## Cutoff times

No timer is needed. When someone tries to change a meal, the server compares "now" in the mess timezone with that meal's cutoff (`settings.meals.<MEAL>.cutoffTime`):

| Where | Rule |
|-------|------|
| Web toggle, bot `/meal` | Today's slot locks at its cutoff (everyone) |
| Guest count (members) | Today's guests lock after the last enabled meal's cutoff |
| Default change | Applies to today only if that meal's cutoff has not passed |
| Past days | Members: read-only. Admin/Manager: editable unless frozen |

---

## What gets counted in the meal rate

`calculatePeriodSummary` (see `13-shared-libs.md`):
- Open period → only days **up to today** (planned future days don't move the rate early)
- Logs dated before a member joined are ignored (for them AND the total)
- Guest meals = `guestCount × meals the host ate`; charged to the host (`HOST`) or spread (`SHARED`)

## Closing a month

- Only on or after the period's last day (`PeriodNotFinishedError` otherwise) — closing early would leave the remaining days unbilled.
- Freezes all logs; frozen days can't be changed by toggle, guest, admin edit, no-cook (web or bot).
- Carry-forward follows the `carryForwardBalance` setting.

---

## Daily housekeeping (no scheduler)

`purgeOldRecordsOncePerDay()` runs inside the first fill of the day (Redis `SET NX` across all instances; ~1 % of calls without Redis): deletes processed Telegram update ids older than 30 days and used/expired link codes older than a day.

## Removed with the crons
- Telegram cutoff warning (hourly) and month-end reminder. Nothing replaces them.

---

## Mismanagement risks — status

| # | Risk | Status |
|---|------|--------|
| 1 | Days not yet recorded were filled with **new** defaults after a preference change (turning off breakfast on the 20th erased breakfast on the 1st–19th) | Fixed — `settleDailyLogs` before every default/config/member change |
| 2 | Changing a default after the cutoff rewrote today's already-eaten meal, and overwrote hand-made changes | Fixed — today only before that meal's cutoff and only if `isOverride = false` |
| 3 | Meals switched off for the whole mess were still auto-counted from member preferences | Fixed — mess rules applied in `getBulkMealDefaults` |
| 4 | `default_count` / counts unbounded (e.g. lunch × 50) | Fixed — capped at `maxCount` (web, bot, preferences) |
| 5 | Weekend hard-coded to Sat + Sun (Bangladesh weekend is Fri + Sat) — wrong defaults on 2 days a week | Fixed — mess setting `weekendDays`, also used by the meals page |
| 6 | Guest residents never auto-counted → ate free unless they tapped | Fixed — counted inside their stay dates |
| 7 | Deactivated member's unrecorded days lost; reactivated member charged for days away | Fixed — settle before, `recordInactiveGap` after |
| 8 | Telegram toggle on a day with no row created ALL meals ON (ignored defaults); `/meal` status said "all ON by default" | Fixed — bot calls `ensureDailyLogs` first |
| 9 | `/nomeal` / `/mealon` / web no-cook could change closed (frozen) months; bot actions not audited | Fixed — closed-period check + `NO_COOK` audit |
| 10 | Members could change past days (lower old meals to reduce the bill) | Fixed — members: today (before cutoff) and future only |
| 11 | Future planned meals counted in the current meal rate | Fixed — open period counts up to today only |
| 12 | Month could be closed before its last day → remaining days never billed | Fixed — close only on/after the end date |
| 13 | Guest meals counted once per day but cooked for every meal the host ate | Fixed — `guestCount × host meals`, billed per guest policy |
| 14 | Admin "turn on" set 1 portion even if the member's default is 2 | Fixed — restores the member's default |
| 15 | **Members of a second mess** (via `MessMembership`) are not auto-counted there — only in their primary mess (`Member.messId`) | **Open** — decide whether secondary-mess members eat there by default |
| 16 | Changing `guestMealPolicy` or `bazaarCountsAsDeposit` mid-month re-prices the **whole open month** (it is a billing rule, not a daily default) | **By design** — change it at the start of a month |
| 17 | Changing the mess timezone mid-day can shift which date counts as "today" once | **Accepted** — rare admin action |
