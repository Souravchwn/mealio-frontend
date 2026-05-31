# Module 15 — Admin Audit Log

## What This Module Does

Immutable, paginated log of all admin actions in the mess. ADMIN only. Read-only UI with action-type filters and an expandable diff panel to compare old vs new values.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/audit/page.tsx` | Page (client) | Paginated audit list + filters |
| `src/app/[locale]/(dashboard)/audit/audit.module.css` | CSS | Audit page styles |
| `src/app/api/admin/audit/route.ts` | API GET | Returns paginated audit entries (ADMIN only) |

---

## API: GET `/api/admin/audit`

**Roles:** ADMIN only (403 for MANAGER/MEMBER).

**Query params:**
| Param | Default | Notes |
|-------|---------|-------|
| `page` | 1 | Page number (1-based) |
| `limit` | 30 | Results per page (capped at 100) |
| `action` | (all) | Optional filter: exact action string, e.g. `TOGGLE_MEAL` |

**Server logic:**
1. Auth + role check (ADMIN only)
2. Build `where` clause: `{ messId }` + optional `action` filter
3. `Promise.all`: count total rows + fetch page of entries
4. Join `actor` (Member name) on each entry
5. Return `snake_case` response

**Response (camelCase after api.ts):**
```typescript
{
  entries: AuditEntry[]
  total: number     // total records matching the filter
  page: number      // current page
  pages: number     // total pages = Math.ceil(total / limit)
}

type AuditEntry = {
  id: string
  actorName: string      // actor.name, falls back to "System"
  action: string         // e.g. "TOGGLE_MEAL", "CLOSE_MONTH"
  targetTable: string | null  // e.g. "daily_logs", "expenses"
  targetId: string | null
  oldValue: Record<string, unknown> | null
  newValue: Record<string, unknown> | null
  createdAt: string      // ISO 8601
}
```

**Important:** The actual API uses `actor_name` (snake_case) in the raw response. `api.ts` auto-converts to `actorName` (camelCase).

---

## Action Types

The following `action` values are used across the codebase:

| Action | Set by | Meaning |
|--------|--------|---------|
| `TOGGLE_MEAL` | `meals/toggle/route.ts` | Member toggled own meal |
| `ADMIN_MEAL_OVERRIDE` | `admin/meals/route.ts` | Admin edited a member's meal |
| `ADD_EXPENSE` | `expenses/route.ts` | New expense added |
| `ADMIN_EXPENSE_EDIT` | `expenses/[id]/route.ts` | Expense updated |
| `ADMIN_EXPENSE_DELETE` | `expenses/[id]/route.ts` | Expense deleted |
| `ADMIN_MEMBER_UPDATE` | `members/[id]/route.ts` | Member role/status changed |
| `ADMIN_SETTINGS_UPDATE` | `mess/settings/route.ts` | Mess settings changed |
| `CLOSE_MONTH` | `financial.ts closeMonth()` | Month frozen |
| `NO_COOK` | `admin/no-cook/route.ts` | All meals set to 0 |
| `MEAL_RESTORE` | `admin/no-cook/route.ts` | Meals restored from preferences |

**Filter buttons in the UI** map to these action values:
```typescript
const ACTION_FILTERS = [
  { value: "",                      label: "All Actions" },
  { value: "TOGGLE_MEAL",           label: "Meal Toggles" },
  { value: "ADMIN_MEAL_OVERRIDE",   label: "Meal Overrides" },
  { value: "ADMIN_EXPENSE_EDIT",    label: "Expense Edits" },
  { value: "ADMIN_EXPENSE_DELETE",  label: "Expense Deletes" },
  { value: "ADMIN_MEMBER_UPDATE",   label: "Member Updates" },
  { value: "ADMIN_SETTINGS_UPDATE", label: "Settings Changes" },
  { value: "CLOSE_MONTH",           label: "Month Close" },
]
```

---

## `audit/page.tsx` — UI State

```typescript
const [entries, setEntries] = useState<AuditEntry[]>([])
const [total, setTotal] = useState(0)
const [page, setPage] = useState(1)
const [pages, setPages] = useState(1)
const [actionFilter, setActionFilter] = useState("")   // "" = all
const [loading, setLoading] = useState(true)
const [expanded, setExpanded] = useState<string | null>(null)  // expanded entry id
```

**Data loading:** `useCallback(fetchAudit, [token, page, actionFilter])` — re-fires when either pagination or filter changes.

**Filter reset:** Changing `actionFilter` resets `page` back to 1 via a separate `useEffect`.

**Pagination:** Renders Prev/Next buttons only when `pages > 1`.

**Expandable diff panel:** Click any row to toggle. Shows `oldValue` (red bg) and `newValue` (green bg) as formatted JSON `<pre>`.

---

## `src/lib/api.ts` — Client Method

```typescript
api.admin.getAuditLog(
  { page?: number, limit?: number, action?: string },
  token: string
) → Promise<{ entries: AuditEntry[], total: number, page: number, pages: number }>
```

---

## Icon + Color Mapping (client-side helpers)

```typescript
// Icon by action keyword:
if (action.includes("MEAL"))     → <Utensils />
if (action.includes("EXPENSE"))  → <DollarSign />
if (action.includes("MEMBER"))   → <Users />
else                             → <FileText />

// Tag color by action keyword:
if (action.includes("DELETE"))            → tagDanger (red)
if (action.includes("OVERRIDE"|"EDIT"))   → tagWarning (orange)
if (action.includes("CLOSE"))             → tagInfo (blue)
else                                      → tagDefault (gray)
```

---

## CSS Classes

| Class | Usage |
|-------|-------|
| `.auditCard` | Row container (clickable) |
| `.auditCardExpanded` | Active row (bottom border) |
| `.actionIcon` | Icon badge (circle, colored) |
| `.actionTag` | Action label pill |
| `.tagDanger` | Red — delete operations |
| `.tagWarning` | Orange — edit/override operations |
| `.tagInfo` | Blue — close month |
| `.tagDefault` | Gray — all others |
| `.diffPanel` | Expandable old/new value section |
| `.diffBlock` | Label + code block pair |
| `.diffOld` | Old value `<pre>` (red-tinted bg) |
| `.diffNew` | New value `<pre>` (green-tinted bg) |
| `.diffCode` | Monospace pre |
| `.spinning` | CSS rotation animation (refresh button while loading) |
| `.pagination` | Flex row for Prev/Page X of Y/Next |

---

## i18n Keys

`audit.*`: `title`, `subtitle`, `oldValue`, `newValue`

**Note:** Action filter labels are hardcoded in English in the component (not i18n keys). Date formatting uses `toLocaleString("en-US")` directly.

---

## `createAudit()` — Writing Audit Entries

All audit entries are written by `createAudit()` from `src/lib/audit.ts`. Call it AFTER the main DB operation succeeds. Failures are swallowed — audit logging must never break the main operation.

```typescript
await createAudit({
  messId: payload.messId,
  actorId: payload.sub,
  action: 'ADMIN_EXPENSE_EDIT',
  targetTable: 'expenses',
  targetId: expenseId,
  oldValue: { amount: 500 },   // JSON-serializable snapshot
  newValue: { amount: 750 },
})
```

**The `actor` relation** in the DB: `AuditLog.actorId` (FK → `Member.id`). The API selects `actor: { select: { name: true } }` to join the member name in a single query. Falls back to `"System"` if actor is null.

---

## Common Pitfalls

1. **`AuditTrail` vs `AuditEntry`** — `src/types/index.ts` has an `AuditTrail` interface (legacy, with `adminId`, `entityType`, `reason` fields). The actual audit page uses a local `AuditEntry` type matching the real API response. Don't confuse them.
2. **`pages` field** — the API returns both `total` (raw count) and `pages` (total page count). Always use `pages` for pagination logic, not `Math.ceil(total / limit)` in the client.
3. **Action string matching** — the `actionLabel()` helper strips `"ADMIN_"` prefix and converts underscores to spaces. If you add new action types, this renders them correctly automatically.
4. **`oldValue` / `newValue`** can be `null` if the operation had no meaningful diff (e.g., `TOGGLE_MEAL` may only store the new state, not both). Always null-check before rendering the diff panel.
5. **Limit cap** — the route caps `limit` at 100. The page uses `limit: 20` per call. Don't try to paginate fewer or more without adjusting both.
