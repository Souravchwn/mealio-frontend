# Module 10 — Mess Switching

## What This Module Does

Lets a person who belongs to more than one mess switch between them. The active mess is encoded in the JWT.

A mess is created **only at sign-up** (`POST /api/auth/register`, mode `create`, see `16-saas-platform.md`).
The old in-app "Create new mess" page and `POST /api/mess` were removed: the creator only got a
`MessMembership` in the new mess, not a `Member` row, so their meal logs were billed there while they were
missing from the member list and the matrix, and the totals stopped adding up.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/components/composed/MessSwitcher/MessSwitcher.tsx` | Component (client) | Dropdown in topbar |
| `src/components/composed/MessSwitcher/MessSwitcher.module.css` | CSS | Dropdown styles |
| `src/app/api/mess/route.ts` | API GET | List messes |
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

```typescript
{
  currentMessId: string
  messes: Array<{ id, name, inviteCode, cutOffTime, isCurrent: boolean, role: string }>
}
```

`inviteCode` is only returned to ADMIN and MANAGER. `isCurrent` compares `mess.id === payload.messId`.

---

## API: GET `/api/mess/[messId]/switch`

1. Verify the user has access to the target mess (`MessMembership` or primary `Member.messId`)
2. Get the role for this mess
3. Sign a new JWT: `{ sub, messId, role }`
4. Return `{ access_token, refresh_token (same), mess: { id, name } }`

Client side after a switch:
```typescript
const res = await api.mess.switchMess(messId, token)
login({ ...user, messId: res.mess.id, messName: res.mess.name }, res.accessToken)
window.location.reload()
```

---

## MessSwitcher Component

Renders only when the person belongs to 2 or more messes (`if (messes.length < 2) return null`).

```
[Current Mess Name ▼]
  SWITCH MESS
  ● Active Mess (disabled)
  ○ Other Mess
```

---

## i18n Keys

`messSwitcher.*`: `label`, `switching`

---

## Common Pitfalls

1. **`MessMembership` vs `Member.messId`**: a member's primary mess is `Member.messId`; extra messes are `MessMembership`. Both are checked in `api/mess/route.ts` and `switch/route.ts`.
2. **Invite code format**: `MESS-XXXX` from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no I, O, 0, 1).
