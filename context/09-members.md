# Module 09 — Members Page

## What This Module Does

Lists all members of the current mess with their role, balance, Telegram link status, and guest info. ADMIN can change roles, deactivate members, and set guest date ranges. ADMIN only page.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/members/page.tsx` | Page (client) | Member list + role editor |
| `src/app/[locale]/(dashboard)/members/members.module.css` | CSS | Member list styles |
| `src/app/api/members/route.ts` | API GET | List all members in a mess |
| `src/app/api/members/[id]/route.ts` | API PUT | Update member role/status |
| `src/app/api/members/me/route.ts` | API GET | Personal monthly summary |
| `src/app/api/members/meal-preferences/route.ts` | API GET+PUT | Meal preferences (see Module 03) |

---

## API: GET `/api/members`

**Roles:** ADMIN or MANAGER. Query `year_month?` (`mess_id` ignored — always the caller's mess). Returns active members with `mealCount` (billable), `guestMeals`, `contributed`, `balance` from `calculatePeriodSummary`, plus `phone`, `role`, `telegramLinked`, guest dates.

## API: PUT `/api/members/[id]`

**Roles:** ADMIN only; not on yourself. Body `{ role?: 'ADMIN'|'MANAGER'|'MEMBER'|'GUEST', is_active?: boolean, guest_from?, guest_until? }` (`SYSTEM_ADMIN` cannot be assigned).

Order matters for meal counting:
1. `settleDailyLogs` — days so far recorded under the current status
2. Update + audit `ADMIN_MEMBER_UPDATE`
3. Reactivation → `recordInactiveGap` (0 meals for days away)
4. `invalidateDailyLogsMarker`

Deactivation/demotion takes effect on the member's very next request (`verifyToken` re-checks the DB).

## API: GET `/api/members/me`

**Query params:** `year_month` (optional)

Returns the current user's monthly financial summary.

**Response:**
```typescript
{
  memberId: string
  yearMonth: string
  mealRate: number          // from calculateMealRate()
  myMealCount: number       // sum of my meal slots this month
  contributed: number       // sum of my expenses this month
  mealCost: number          // myMealCount × mealRate
  balance: number           // contributed - mealCost
}
```

Used by both **My Summary page** (`/my-summary`) and the **Overview** balance card.

---

## My Summary Page (`/my-summary`)

| File | Purpose |
|------|---------|
| `src/app/[locale]/(dashboard)/my-summary/page.tsx` | Personal stats |
| `src/app/[locale]/(dashboard)/my-summary/my-summary.module.css` | Styles |

**Data loading:**
- `api.members.me(token, yearMonth)` → financial stats
- `api.meals.getToday(user.id, token)` → today's meal status

**What it shows:**
1. Meal Rate badge
2. Stats: Total Meals, Contributed, Meal Cost, Balance
3. Meal Breakdown: count for each slot this month
4. Financial Summary: contributed vs meal cost vs balance

---

## `src/lib/api.ts` — Client Methods

```typescript
api.members.list(messId, token)              → Promise<{ messName, members[] }>
api.members.me(token, yearMonth?)            → Promise<{ memberId, yearMonth, mealRate, myMealCount, contributed, mealCost, balance }>
api.admin.updateMember(memberId, data, token) → Promise<{ ok: boolean }>
```

---

## Guest Member Logic

Guest residents (`role = GUEST`, `isGuest = true`) are **auto-counted only between `guestFrom` and `guestUntil`**. On the first data read after `guestUntil` their last days are recorded and they are deactivated (audit `AUTO_DEACTIVATE_GUEST`). No cron is involved — see `12-daily-meal-counting.md`.

Guests brought by a member for a day (`DailyLog.guestCount`) are different — see the guest policy in `07-settings.md`.

## i18n Keys

`members.*`: `title`, `subtitle`, `name`, `role`, `balance`, `phone`, `status`, `addMember`, `inviteCode`, `roles.ADMIN/MANAGER/MEMBER/GUEST`

`mySummary.*`: `title`, `subtitle`, `mealRate`, `totalMeals`, `contributed`, `mealCost`, `balance`, `mealBreakdown`, `breakfast`, `lunch`, `dinner`, `guestMeals`, `times`, `last7Days`, `financialSummary`, `telegramStatus`, `telegramLinked`, `telegramNotLinked`

---

## Common Pitfalls

1. **Balance** comes from `calculatePeriodSummary` (live, same as Matrix and My Summary).
2. **Self-demotion protection**: the PUT route prevents an admin from changing their own role. If `targetId === payload.sub && role !== currentRole`, return 403.
3. **`isActive: false`** members are excluded from all lists, meals, and calculations. They exist in the DB but are effectively invisible.
4. **Guest deactivation** is automatic on the first read after `guestUntil` — and can be set manually via `PUT /api/members/[id]`.
