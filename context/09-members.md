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

**Query params:** `mess_id`

**Response:**
```typescript
{
  messName: string
  members: Array<{
    id, name, phone: string | null
    role: string
    balance: number       // calculated from current month
    telegramLinked: boolean
    isGuest: boolean
    guestFrom: string | null    // YYYY-MM-DD
    guestUntil: string | null   // YYYY-MM-DD
  }>
}
```

**Server logic:**
1. Get all active members
2. For each member, calculate current month balance from `LedgerEntry` rows (sum of CARRY_FORWARD + DEDUCTION for current yearMonth)
3. Return enriched list

**Balance sign convention:** Positive = overpaid (member gets money back). Negative = owes money.

---

## API: PUT `/api/members/[id]`

**Roles:** ADMIN only.

**Request body:**
```typescript
{
  role?: 'ADMIN' | 'MANAGER' | 'MEMBER' | 'GUEST'
  is_active?: boolean
  guest_from?: string | null   // YYYY-MM-DD
  guest_until?: string | null  // YYYY-MM-DD
}
```

**Server logic:**
1. Auth + role check (must be ADMIN)
2. Prevent admin from demoting themselves
3. Update `Member` row
4. Write audit log: action `'UPDATE_MEMBER'`

---

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

A member with `role: 'GUEST'` or `isGuest: true` is a temporary member. Key behavior:
- `guestFrom` and `guestUntil` date range
- The cron job `deactivate-guests` runs daily at 00:00 and sets `isActive: false` for expired guests
- Guests appear in the matrix with a `(guest)` label
- Guests count toward headcount and meal rate during their active period

---

## i18n Keys

`members.*`: `title`, `subtitle`, `name`, `role`, `balance`, `phone`, `status`, `addMember`, `inviteCode`, `roles.ADMIN/MANAGER/MEMBER/GUEST`

`mySummary.*`: `title`, `subtitle`, `mealRate`, `totalMeals`, `contributed`, `mealCost`, `balance`, `mealBreakdown`, `breakfast`, `lunch`, `dinner`, `guestMeals`, `times`, `last7Days`, `financialSummary`, `telegramStatus`, `telegramLinked`, `telegramNotLinked`

---

## Common Pitfalls

1. **Balance calculation** in `members/route.ts` uses `LedgerEntry` rows — NOT real-time. It reflects the last close-month carry-forward. For live balance, use `api.members.me()` which uses `calculateMealRate()` dynamically.
2. **Self-demotion protection**: the PUT route prevents an admin from changing their own role. If `targetId === payload.sub && role !== currentRole`, return 403.
3. **`isActive: false`** members are excluded from all lists, meals, and calculations. They exist in the DB but are effectively invisible.
4. **Guest deactivation** is automatic via cron — but `is_active` can also be set manually via `PUT /api/members/[id]`.
