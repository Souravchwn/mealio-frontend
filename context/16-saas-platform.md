# Module 16: SaaS platform (sign-up, recovery, support, console)

Mealio is open to the public: anyone can start a mess, and people join one with an invite code.
This module covers everything that makes that safe to run: account lifecycle, abuse limits,
support, monitoring and the staff console at `/console`.

---

## Sign-up paths

`POST /api/auth/register` takes `mode`:

| mode | Needs | Result |
|------|-------|--------|
| `create` | `mess_name` | New mess + ADMIN member, `Mess.ownerId` set, returns a session and `invite_code`. Limit: 3 per IP per day, and `getPlan(plan).maxOwnedMesses` per person. This is the only way to create a mess (there is no in-app "create another mess"). |
| `join` | `mess_invite_code` | If the mess has `requireJoinApproval` (default on), the member is created with `joinStatus = PENDING`, `isActive = false` and the answer is `{ pending: true, mess_name }`. Otherwise a session. Member cap: `getPlan(plan).maxMembers`. |

Pending members are inactive, so `ensureDailyLogs` never counts their meals. Approval
(`POST /api/members/[id]/join { decision }`) settles logs first, sets `joinedAt` to now, and invalidates the
daily-logs marker. The Members page shows requests at the top; Settings has the approval toggle and
"Make a new code" (`POST /api/mess/invite-code`).

## Login states

`verifyToken()` rejects a token when the member is deleted, not APPROVED, inactive, the password changed after
the token was issued (`passwordChangedAt` vs `iat`), or the mess is deleted or suspended. It also rejects
platform tokens (they carry `aud: mealio-platform`).

`POST /api/auth/login` answers 403 with a `code` the login page turns into a friendly notice:
`PENDING_APPROVAL`, `JOIN_REJECTED`, `ACCOUNT_INACTIVE`, `NO_MESS`, `MESS_DELETED`, `MESS_SUSPENDED`.
Wrong email and wrong password give the same message, and a dummy bcrypt compare keeps timing equal.

## Password recovery

| Route | Purpose |
|-------|---------|
| `GET /api/auth/options` | `{ email_enabled }` |
| `POST /api/auth/forgot` | Emails a 30 minute link when email is set up. Same answer whether or not the email exists. |
| `POST /api/auth/reset` | `{ token, password }` (email link) or `{ email, code, password }` (8-char code). Sets `passwordChangedAt`, which signs out every other device. |
| `POST /api/members/[id]/reset-code` | Mess ADMIN makes a one-time code for a member (not for themselves). |
| `PATCH /api/platform/users/[id] { action: reset_code }` | Staff make a code (for admins locked out). |
| `POST /api/auth/verify-email`, `POST /api/auth/verify-email/resend` | Email verification. |

Codes and link tokens live in `AuthToken` as SHA-256 hashes (`src/lib/tokens.ts`, `src/lib/account-emails.ts`).
Email is optional: `src/lib/email.ts` sends through Resend only when `RESEND_API_KEY` and `EMAIL_FROM` are set.

Pages: `/forgot-password`, `/reset-password`, `/verify-email` (all in `(auth)`).

## Personal data

| Route | Purpose |
|-------|---------|
| `GET /api/me` | JSON download of everything about the member |
| `DELETE /api/me { password }` | Anonymises the member ("Deleted member"), keeps meal and money rows so mess totals stay right. Blocked with `LAST_ADMIN` if others remain and no other admin exists. |
| `POST /api/me/password` | Change password, returns a fresh token |
| `POST /api/mess/delete { confirm_name, password }` | ADMIN soft-deletes the mess (`deletedAt`). Staff can restore it. |

UI: Settings, General tab (`settings/AccountSection.tsx`), and the danger zone on the Mess Settings tab.

## Plans

`src/lib/plans.ts`: FREE (40 members, 2 owned messes), PLUS and PRO are placeholders for later billing.
`Mess.plan` and `Mess.planExpiresAt` exist; staff change the plan in the console. Nothing charges money yet.

## Support

| Route | Purpose |
|-------|---------|
| `POST /api/support/tickets` | Signed in or not. Anonymous senders give name + email and get an `access_key`. |
| `GET /api/support/tickets` | The signed-in member's tickets |
| `GET/POST /api/support/tickets/[id]` | Read or reply. Owner token, or `?key=<access_key>`. |

Pages: `/support` and `/support/[id]` in the `(public)` route group, which also holds `/privacy` and `/terms`
(text in `legal.*` messages, rendered by `LegalDoc.tsx`). The dashboard nav has a "Help & support" item.

## Monitoring

`logSecurityEvent()` (`src/lib/security-events.ts`) writes `SecurityEvent` rows: sign-ins, failures, blocks,
sign-ups, join requests, invite code guesses, rate-limit hits, resets, deletions and console sign-ins.
Severity is INFO, WARN or HIGH. The console Security page shows the feed and the noisiest IPs and emails
over the last 24 hours.

## Platform console (`/[locale]/console`)

Staff only, English only, `noindex`. Separate identity: `PlatformAdmin` table, tokens with audience
`mealio-platform`, 12 hour lifetime, signed with `PLATFORM_JWT_SECRET` (falls back to `JWT_SECRET`).
The browser keeps the console session under its own localStorage keys (`ConsoleAuth.tsx`), never mixed
with the mess session. Every console action is written to `PlatformAuditLog`.

Create an admin on the server: `npm run platform-admin -- --email you@example.com --name "Your Name"`.

| Page | API | What staff can do |
|------|-----|-------------------|
| Dashboard | `GET /api/platform/stats` | Counts, 14 day sign-ups, newest messes, alerts |
| Messes | `GET /api/platform/messes`, `GET/PATCH /api/platform/messes/[id]` | Suspend (with reason), lift, delete, restore, change plan, new invite code, toggle join approval |
| Users | `GET /api/platform/users`, `GET/PATCH /api/platform/users/[id]` | Deactivate, reactivate, verify email, change email, reset code, unlink Telegram, sign out everywhere |
| Support | `GET /api/platform/tickets`, `GET/POST/PATCH /api/platform/tickets/[id]` | Reply (emails the person), set status and priority |
| Security | `GET /api/platform/security-events` | Feed, filters, hot IPs and emails |
| Audit | `GET /api/platform/audit?source=platform\|mess` | Staff actions, or mess audit logs across all messes |

## Tenant isolation test

`npm run test:isolation` (dev server running) creates two throw-away messes, signs in as the admin of mess A
and tries to read or change mess B through every ID-based route. It also checks role boundaries,
platform-token separation, pending sign-in and suspension. It cleans up after itself and exits 1 on any leak.
Run it after adding or changing an API route.

## Security headers

`next.config.ts` sets a Content Security Policy (no third-party scripts; this is the main guard for the
localStorage token), `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, HSTS in production,
and `Cache-Control: no-store` on `/api/*`.

## Session flow

- `/login` and `/register` send signed-in people to the app (register keeps the form open only when the URL carries someone else's invite `?code=`).
- The landing page and every brand link outside the app (support, privacy, terms, auth screens) turn into "Open Mealio" and lead to `/overview` when signed in.
- The dashboard guard sends signed-out visitors to `/login?next=<page>`; login returns them there (only same-language paths are accepted).
- `api.ts` fires `mealio:session-rejected` when the server answers 401 to a request that carried a member token (not for `/api/platform` or `/api/auth/*`). `AuthContext` then clears the session and leaves a flag so the login page explains "You were signed out".
- Languages: `routing.ts` lists `en` and `bn`; both resolve under `/en/...` and `/bn/...`. Keep the two message files on identical keys.
