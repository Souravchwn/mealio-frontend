# Module 19: Members by name, invites, default meals, guests per meal

Most mess members never sign up. Mealio works like the notebook or Excel sheet they already use:
the admin types names, meals count from defaults, and people join later if they want to.

## Members by name (`POST /api/members`, ADMIN)
- A **name-only member** has `email = NULL` and `passwordHash = NULL`. They count everywhere (meals,
  money, matrix, headcount, archive) but cannot sign in. `GET /api/members` returns `has_account` and
  `invited_at`; the Members page shows "Not joined yet" or "Invited".
- Added members count **from today**, and only meals whose cutoff has not passed yet.
- Same name twice in one mess is refused. The plan's `maxMembers` applies.
- Admin reset codes are refused for name-only members (send an invite instead).

## Default meals
- **Mess default** (`Mess.defaultMeals`, settings `default_meals`, `{ weekday: { breakfast, lunch, dinner }, weekend: {...} }`):
  used by `getBulkMealDefaults()` for any meal a member has no own `UserMealPreference` row for.
  Changing it settles logs first, so it applies from the next day.
- **Per member** (`/api/members/[id]/meal-preferences`, ADMIN or MANAGER): GET, PUT one meal, DELETE = back
  to the mess default. Same rules as a member's own route; both use `src/lib/member-preferences.ts`.
  Each row reports `custom` (false = following the mess default).

## Invites (`POST /api/members/[id]/invite`, ADMIN)
- `AuthToken` purpose `INVITE`, hashed, 14 days, single use. A new invite cancels the old one.
- Returns a link to share anywhere; also emailed when an email is given and Resend is set up.
- Public `GET /api/invite/[token]`: name, mess name and that member's own numbers (meals, paid, balance,
  meal rate). `POST` with email + password takes over the name and signs in. No admin approval: the link
  is the approval. Only one claim can win (`updateMany where passwordHash = null`).

## Join with the code, pick your name
- `GET /api/auth/roster?code=` (public, rate limited): first names of name-only members without a pending claim.
- `POST /api/auth/register` (join) with `claim_member_id` stores a `MemberClaim` (credentials wait there)
  and ALWAYS waits for the admin. `GET /api/members/pending` returns `claims`; `POST /api/members/claims/[id]`
  approves (moves email and password onto the member) or rejects.

## Guests per meal (`src/lib/guests.ts`)
- `DailyLog.guestBreakfast / guestLunch / guestDinner`: a guest for lunch only, dinner only, or both.
  Each meal's guests change until that meal's cutoff (`POST /api/meals/guest { slot, guest_count }`).
- Older days used one `guestCount` = guests at every meal the host ate. `slotGuests()` reads both, so old
  days bill exactly as before. The first per-meal change on a day converts it (`setSlotGuestsData()`).
- A per-meal guest counts even if the host skips that meal. A no-cook day clears guests too.
- Telegram: `/meal guest N` sets the next open meal; `/meal guest dinner 2` a specific one.

## Who can change what (all audited with the actor)
- Members: their own meals, guests and default meals.
- Admin and manager: anyone's meals and guests (Meals page "Meals for" picker), anyone's default meals.
- Admin only: add by name, invite, approve claims, mess default meals.

## Tests
`npm run test:roster` (60 checks).
