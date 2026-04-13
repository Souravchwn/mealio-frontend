# Module 01 — Authentication

## What This Module Does

Handles user login, registration, JWT signing/verification, and storing auth state in `localStorage` via React Context. No session cookies — pure JWT.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(auth)/login/page.tsx` | Page (client) | Email + password login form |
| `src/app/[locale]/(auth)/register/page.tsx` | Page (client) | Name, email, phone, password, invite code form |
| `src/app/[locale]/(auth)/auth.module.css` | CSS | Shared auth page styles (split-panel layout) |
| `src/app/api/auth/login/route.ts` | API route | POST — verifies bcrypt, signs JWT, returns token + user |
| `src/app/api/auth/register/route.ts` | API route | POST — creates Member row, signs JWT |
| `src/contexts/AuthContext.tsx` | Context (client) | Stores user + token in localStorage, exposes login/logout |
| `src/lib/auth-utils.ts` | Lib (server-only) | signToken, verifyToken, extractToken |

---

## API Routes

### POST `/api/auth/login`

**Request body (snake_case):**
```json
{ "email": "user@example.com", "password": "plaintext" }
```

**Server logic:**
1. Find Member by email (`prisma.member.findUnique({ where: { email } })`)
2. Verify bcrypt hash (`bcrypt.compare(password, member.passwordHash)`)
3. Find current mess from `member.messId`
4. Call `signToken({ sub: member.id, messId, role: member.role })`
5. Return `{ access_token, refresh_token (same token), user: { id, name, email, role, messId, messName } }`

**Response (camelCase after api.ts conversion):**
```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "user": { "id": "uuid", "name": "Sourav", "email": "...", "role": "ADMIN", "messId": "uuid", "messName": "Bashundhara Mess" }
}
```

**Error cases:** 401 if email not found or password wrong.

---

### POST `/api/auth/register`

**Request body:**
```json
{
  "name": "Sourav",
  "email": "user@example.com",
  "phone": "+8801700000000",
  "password": "plaintext",
  "mess_invite_code": "MESS-ABCD"
}
```

**Server logic:**
1. Find mess by `inviteCode`
2. Check email uniqueness
3. Hash password with bcrypt (10 rounds)
4. Create `Member` row with `messId`, `role: 'MEMBER'`
5. Sign JWT → return same shape as login response

**Error cases:** 400 if invite code not found, 409 if email already taken.

---

## `src/lib/auth-utils.ts`

Server-only. Import ONLY in API routes and server actions.

### `signToken(payload: TokenPayload): Promise<string>`

```typescript
interface TokenPayload {
  sub: string    // member.id
  messId: string
  role: string   // ADMIN | MANAGER | MEMBER | GUEST
}
```

- Uses `jose` `SignJWT` with HS256 algorithm
- Expiry: **30 days**
- Secret: `process.env.JWT_SECRET` (must be 32+ char hex string)

### `verifyToken(token: string): Promise<TokenPayload | null>`

- Returns `null` on any error (expired, tampered, missing secret)
- Always null-check the return value in API routes before using payload

### `extractToken(req: NextRequest): string | null`

- Reads `Authorization: Bearer <token>` header
- Returns null if header missing or malformed

**Standard API route auth pattern:**
```typescript
const token = extractToken(req)
if (!token) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
const payload = await verifyToken(token)
if (!payload) return NextResponse.json({ detail: 'Unauthorized' }, { status: 401 })
// Now use payload.sub (memberId), payload.messId, payload.role
```

---

## `src/contexts/AuthContext.tsx`

Client-side only. Provides:

```typescript
interface AuthContextType {
  user: User | null           // Full user object
  token: string | null        // JWT string
  login(user: User, token: string): void   // Save to state + localStorage
  logout(): void              // Clear state + localStorage
  isAuthenticated: boolean    // user && token both truthy
  isLoading: boolean          // Always false (localStorage hydrated synchronously)
}
```

**State initialization:** Both `user` and `token` are read from `localStorage` synchronously in `useState` initializer. This means there's no hydration flash — auth state is known immediately on mount.

**localStorage keys:**
- `"token"` → JWT string
- `"user"` → JSON-stringified `User` object

**Usage in components:**
```typescript
const { user, token, login, logout, isAuthenticated } = useAuth()
```

**Updating auth after mess switch:**
When `api.mess.switchMess()` returns a new token + mess info, update like:
```typescript
login({ ...user, messId: res.mess.id, messName: res.mess.name }, res.accessToken)
```

---

## `src/types/index.ts` — Relevant Types

```typescript
interface User {
  id: string
  name: string
  email: string
  role: Role         // 'ADMIN' | 'MANAGER' | 'MEMBER' | 'GUEST'
  messId: string
  messName: string
}

interface AuthResponse {
  accessToken: string
  refreshToken: string
  user: User
}

interface LoginRequest {
  email: string
  password: string
}

interface RegisterRequest {
  name: string
  email: string
  phone?: string
  password: string
  messInviteCode: string
}
```

---

## `src/lib/api.ts` — Client Methods

```typescript
api.auth.login(data: LoginRequest)     → Promise<AuthResponse>
api.auth.register(data: RegisterRequest) → Promise<AuthResponse>
```

---

## Auth Guard (Dashboard Layout)

`src/app/[locale]/(dashboard)/layout.tsx` has:
```typescript
useEffect(() => {
  if (!isLoading && !isAuthenticated) {
    router.push(`/${locale}/login`)
  }
}, [isAuthenticated, isLoading])
```

Pages inside `(dashboard)/` are protected. Pages inside `(auth)/` are unprotected.

---

## i18n Keys

`messages/en.json` → `auth.login.*`, `auth.register.*`

Key translations used: `title`, `subtitle`, `email`, `password`, `submit`, `noAccount`, `register`, `success`, `error`, `name`, `phone`, `confirmPassword`, `messCode`, `messCodeHelp`, `hasAccount`, `login`, `passwordMismatch`

---

## Common Pitfalls

1. **Never import `auth-utils.ts` in a client component.** It uses Node.js crypto. If you see `"use client"` at the top of a file, don't import from `auth-utils.ts`.
2. **`isLoading` is always `false`** in this implementation (synchronous localStorage read). Don't add loading spinners waiting for it to flip.
3. **JWT payload has `sub` (not `id`)** for the member ID. In API routes use `payload.sub`. In client code the User object has `id`.
4. **Token expiry is 30 days.** No refresh logic exists — users just get logged out when it expires.
