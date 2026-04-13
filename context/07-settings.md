# Module 07 — Settings Page

## What This Module Does

Single page with multiple sections gated by role. All users see meal preferences. ADMIN+MANAGER see mess settings. ADMIN-only sees the invite code card, Telegram linking, and danger zone.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/settings/page.tsx` | Page (client) | All settings sections |
| `src/app/[locale]/(dashboard)/settings/settings.module.css` | CSS | Settings styles |
| `src/app/api/mess/settings/route.ts` | API PUT | Update mess name, cutoff time, budget |
| `src/app/api/members/meal-preferences/route.ts` | API GET+PUT | Per-member meal preferences (see Module 03) |
| `src/app/api/admin/telegram-group/route.ts` | API GET+POST | Get/link Telegram group (ADMIN only) |
| `src/app/api/mess/meal-configs/route.ts` | API GET+PUT | Per-meal cutoff configs (Admin/Manager) |

---

## Page Sections (top to bottom)

### Section 1 — Meal Preferences (ALL users)

**State:**
```typescript
type PrefKey = `${'breakfast'|'lunch'|'dinner'}_${'WEEKDAY'|'WEEKEND'}`
const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>(defaultPrefs())
const [updatingPref, setUpdatingPref] = useState<PrefKey | null>(null)
```

**On mount:** `api.mealPreferences.getAll(token)` → builds `PrefMap`.

**On toggle:**
1. Optimistically update `prefs` state
2. Call `api.mealPreferences.update({ mealType, dayType, enabled }, token)`
3. On error: revert optimistic state + `toast.error()`

**Renders:** 2×3 grid (WEEKDAY + WEEKEND × Breakfast/Lunch/Dinner). Each is a button styled `.prefOn` or `.prefOff`.

---

### Section 2 — Mess Settings (ADMIN + MANAGER)

```typescript
const isAdmin = user?.role === "ADMIN" || user?.role === "MANAGER"
```

**State:** `name`, `cutOffTime`, `budget`, `saving`

**On mount:** `api.mess.list(token)` → finds `isCurrent` mess → populates form fields.

**On save:** `api.admin.updateSettings({ name, cutOffTime }, token)` → PUT `/api/mess/settings`

**Fields:** Mess Name (text), Dinner Cut-off Time (time input), Estimated Monthly Budget (number, optional)

---

### Section 3 — Invite Code Card (ADMIN only)

```typescript
const isOwner = user?.role === "ADMIN"
```

Only shown when `isOwner && inviteCode` (inviteCode comes from `api.mess.list()` in Section 2 loading).

**Renders:** Large monospace invite code (`styles.inviteCodeText`) + Copy button.

**Copy handler:**
```typescript
async function handleCopyInvite() {
  await navigator.clipboard.writeText(inviteCode)
  setCopied(true)
  setTimeout(() => setCopied(false), 2000)
}
```

---

### Section 4 — Telegram Group (ADMIN only)

**State:** `linkedGroup`, `tgChatId`, `tgChatName`, `tgTimezone`, `linkingTg`

**On mount:** `GET /api/admin/telegram-group` → `setLinkedGroup(data.group)`

**If linked:** shows green badge with group name.

**Form fields:** Chat ID (required, e.g. `-100123456789`), Group Name (optional), Timezone (default `Asia/Dhaka`)

**On submit:** `POST /api/admin/telegram-group` with `{ chat_id, chat_name, timezone }` → updates `linkedGroup` state on success.

---

### Section 5 — Danger Zone (ADMIN + MANAGER)

Delete Mess button — currently **disabled** with "(contact support)" label. No functionality implemented.

---

## API: PUT `/api/mess/settings`

**Roles:** ADMIN or MANAGER.

**Request body:**
```typescript
{ name?, cut_off_time?, estimated_monthly_budget? }
```

Updates `Mess` row. `cutOffTime` is stored as a `@db.Time` column — converted from `"HH:MM"` string to `new Date("1970-01-01THH:MM:00.000Z")`.

---

## API: GET `/api/admin/telegram-group`

**Roles:** ADMIN only.

**Returns:**
```typescript
{ group: { chatId: string, chatName: string, timezone: string } | null }
```

Queries `prisma.telegramGroup.findFirst({ where: { messId, isActive: true } })`.

---

## API: POST `/api/admin/telegram-group`

**Roles:** ADMIN only.

**Request body:**
```typescript
{ chat_id: string, chat_name?: string, timezone?: string }
```

Calls `groupRepo.register(chatId, chatName, messId, timezone)` from `GroupRepository`. This creates or updates the `TelegramGroup` row.

---

## API: GET `/api/mess/meal-configs`

Returns per-meal cutoff configs for the current mess. Falls back to defaults if table/data is missing.

**Response:**
```json
{
  "meal_configs": [
    { "id": "...", "meal_type": "BREAKFAST", "enabled": true, "cutoff_time": "08:30", "max_count": 10 },
    { "id": "...", "meal_type": "LUNCH",     "enabled": true, "cutoff_time": "13:00", "max_count": 10 },
    { "id": "...", "meal_type": "DINNER",    "enabled": true, "cutoff_time": "21:00", "max_count": 10 }
  ]
}
```

---

## API: PUT `/api/mess/meal-configs`

**Roles:** ADMIN or MANAGER.

**Request body:**
```typescript
{ meal_type: string, cutoff_time?: string, enabled?: boolean, max_count?: number }
```

Upserts a single `MealConfig` row using `messId_mealType` unique constraint.

---

## `src/lib/api.ts` — Client Methods

```typescript
api.mealPreferences.getAll(token)
api.mealPreferences.update({ mealType, dayType, enabled, defaultCount? }, token)
api.admin.updateSettings({ name?, cutOffTime?, estimatedMonthlyBudget? }, token)
api.mealConfigs.list(token)
api.mealConfigs.update({ mealType, cutoffTime?, enabled?, maxCount? }, token)
```

Note: Telegram group linking uses raw `fetch()` directly in the component (not via `api.ts`) because the endpoint is not yet in the API client.

---

## CSS Classes

| Class | Usage |
|-------|-------|
| `.prefToggle` | Preference button base |
| `.prefOn` | Green border + bg when enabled |
| `.prefOff` | Gray border + bg when disabled |
| `.inviteCodeDisplay` | Container for monospace code |
| `.inviteCodeText` | Large monospace code in primary color |
| `.telegramLinkedBadge` | Green badge showing linked group |
| `.codeRow` | Flex row for code input + copy button (used in form) |
| `.sectionTitle` | Card section heading (lg, weight 700) |
| `.dangerCard` | Card with red left border |

---

## i18n Keys

`settings.*`: `title`, `subtitle`, `messName`, `cutoffTime`, `cutoffHelp`, `inviteCode`, `saveChanges`, `dangerZone`, `deleteMess`

`settings.mealPreferences.*`: `title`, `subtitle`, `weekday`, `weekend`, `breakfast`, `lunch`, `dinner`, `saved`

`settings.inviteCard.*`: `title`, `description`, `copy`, `copied`

`settings.telegramGroup.*`: `title`, `description`, `chatId`, `chatIdHelp`, `chatName`, `timezone`, `link`, `linking`, `linked`, `unlinked`

---

## Common Pitfalls

1. **`isAdmin` vs `isOwner`**: `isAdmin = ADMIN || MANAGER` (for mess settings + danger zone). `isOwner = ADMIN only` (for invite code + Telegram). Don't mix them.
2. **`inviteCode` comes from `api.mess.list()`** — it's loaded in the same `useEffect` as the mess settings. If the mess list call fails, the invite card won't show (it checks `inviteCode && isOwner`).
3. **Telegram linking uses raw fetch** — not `api.admin.*`. If you add it to `api.ts`, update the component to use it.
4. **Preference sync** — when a preference is saved via PUT, the API immediately syncs today's DailyLog. This is server-side only; the frontend doesn't need to reload today's meal state after a preference change.
