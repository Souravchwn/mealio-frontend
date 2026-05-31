# Module 10 — Mess Management (Create + Switch)

## What This Module Does

Allows ADMIN users to create new messes and switch between messes they belong to. A single user can be ADMIN of one mess and MEMBER of another. The active mess is encoded in the JWT.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/mess/create/page.tsx` | Page (client) | Create new mess form |
| `src/app/[locale]/(dashboard)/mess/create/create.module.css` | CSS | Create form styles |
| `src/components/composed/MessSwitcher/MessSwitcher.tsx` | Component (client) | Dropdown in topbar |
| `src/components/composed/MessSwitcher/MessSwitcher.module.css` | CSS | Dropdown styles |
| `src/app/api/mess/route.ts` | API GET+POST | List messes / create mess |
| `src/app/api/mess/[messId]/switch/route.ts` | API GET | Switch active mess → new JWT |
| `src/app/api/mess/settings/route.ts` | API PUT | Update mess settings |

---

## Data Model: Multi-Mess Support

A user can belong to multiple messes via the `MessMembership` table:
```
MessMembership {
  memberId   ← Member.id
  messId     ← Mess.id
  role       ← ADMIN | MANAGER | MEMBER
  isActive   ← boolean
}
```

The active mess is encoded in the JWT as `messId`. All API routes use `payload.messId` to scope queries.

---

## API: GET `/api/mess`

**Returns all messes** the current user belongs to (primary mess from `Member.messId` + all `MessMembership` rows).

**Response:**
```typescript
{
  currentMessId: string
  messes: Array<{
    id, name, inviteCode, cutOffTime, isCurrent: boolean, role: string
  }>
}
```

**Note:** `isCurrent` is derived by comparing `mess.id === payload.messId` from the JWT.

---

## API: POST `/api/mess`

**Creates a new mess** (any authenticated user can create one).

**Request body:**
```typescript
{
  name: string                        // required
  estimated_monthly_budget?: number
  cut_off_time?: string               // HH:MM, defaults to "21:00"
}
```

**Server logic:**
1. Generate unique invite code (format: `MESS-XXXX`, retry up to 5 times on collision)
2. Create `Mess` row
3. Create `MessMembership` row linking current user as `ADMIN`
4. Seed 3 default `MealConfig` rows: BREAKFAST 08:30, LUNCH 13:00, DINNER 21:00
5. Return new mess info including `inviteCode`

**Response:**
```typescript
{ id, name, inviteCode, cutOffTime }
```

**After creation:** The user is still in their OLD mess (JWT unchanged). They need to switch using `MessSwitcher` to start using the new mess.

---

## API: GET `/api/mess/[messId]/switch`

**Switches the active mess** by returning a new JWT with the new `messId`.

**Server logic:**
1. Verify user has access to target mess (via `MessMembership` or primary `Member.messId`)
2. Get the role for this mess
3. Find mess details
4. Sign new JWT: `{ sub: payload.sub, messId, role }` (30d expiry)
5. Return `{ access_token, refresh_token (same), mess: { id, name } }`

**Response type (`MessSwitchResponse`):**
```typescript
{
  accessToken: string
  refreshToken: string
  mess: { id: string, name: string }
}
```

**Client-side after switch:**
```typescript
const res = await api.mess.switchMess(messId, token)
login({ ...user, messId: res.mess.id, messName: res.mess.name }, res.accessToken)
window.location.reload()
```

The full page reload ensures all cached data is cleared.

---

## Create Mess Page (`mess/create/page.tsx`)

### Form State
```typescript
const [name, setName] = useState("")
const [budget, setBudget] = useState("")
const [cutOffTime, setCutOffTime] = useState("21:00")
const [creating, setCreating] = useState(false)
const [created, setCreated] = useState<{ inviteCode: string, name: string } | null>(null)
```

### Two-state UI
1. **Form state** (`created === null`): Shows input fields + submit button
2. **Success state** (`created !== null`): Shows invite code prominently + copy button + "Go to Dashboard" button

### On success
```typescript
const res = await api.mess.create({ name, estimatedMonthlyBudget, cutOffTime }, token)
setCreated({ inviteCode: res.inviteCode, name: res.name })
toast.success(t("createMess.inviteReady"))
```

**Note:** Does NOT auto-switch to the new mess. User can use `MessSwitcher` after.

### Go to Dashboard
```typescript
window.location.href = `/${locale}/overview`
```
Hard navigation (not `router.push`) to ensure auth state is re-read cleanly.

---

## MessSwitcher Component

### Visibility
```typescript
if (user?.role !== "ADMIN" && messes.length < 2) return null
```
- ADMIN: always visible (can create new messes)
- Others: only if they have 2+ messes

### Dropdown structure
```
[Current Mess Name ▼]
  ──────────────────
  SWITCH MESS
  ● Active Mess (disabled)
  ○ Other Mess
  ─────────────────
  + Create New Mess   (ADMIN only)
```

### Switch behavior
1. `api.mess.switchMess(messId, token)` → new token
2. `login({ ...user, messId, messName }, newToken)` → update auth context
3. `window.location.reload()` → full reload

### Close on outside click
```typescript
const wrapperRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  document.addEventListener("mousedown", handleOutsideClick)
  return () => document.removeEventListener("mousedown", handleOutsideClick)
}, [])
```

---

## `src/lib/api.ts` — Client Methods

```typescript
api.mess.list(token)
  → Promise<{ currentMessId, messes: Array<{ id, name, inviteCode, cutOffTime, isCurrent, role }> }>

api.mess.create({ name, estimatedMonthlyBudget?, cutOffTime? }, token)
  → Promise<{ id, name, inviteCode, cutOffTime }>

api.mess.switchMess(messId, token)
  → Promise<MessSwitchResponse>  // { accessToken, refreshToken, mess: { id, name } }
```

---

## i18n Keys

`createMess.*`: `title`, `subtitle`, `name`, `namePlaceholder`, `budget`, `budgetPlaceholder`, `cutoffTime`, `creating`, `create`, `inviteReady`, `inviteLabel`, `goToDashboard`

`messSwitcher.*`: `label`, `switching`, `createNew`

---

## Common Pitfalls

1. **After creating a mess, the user is still in their old mess** — the create API doesn't return a new JWT. They must switch via MessSwitcher or log out and back in. Consider adding auto-switch after creation if this UX is confusing.
2. **Invite code format**: `MESS-XXXX` where X is from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1 to avoid confusion). Uniqueness enforced with up to 5 retry attempts.
3. **`MessMembership` vs `Member.messId`**: A member's "primary" mess is stored in `Member.messId`. Additional messes are in `MessMembership`. Both are checked in `api/mess/route.ts` and `switch/route.ts`.
4. **MealConfig seeding**: When a new mess is created, 3 default `MealConfig` rows are seeded. If this fails (e.g., table doesn't exist yet), the mess creation still succeeds but cutoff times fall back to defaults.
