# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.  
**Read the relevant module section before making any changes.**

---

## Commands

```bash
npm run dev       # Start development server (http://localhost:3000)
npm run build     # Production build (also runs TypeScript check)
npm run lint      # Run ESLint
npm run seed -- --yes   # Seed demo data (dev DB only — public passwords)
npm run platform-admin -- --email you@x.com --name "Name"   # Create/reset a /console staff admin
npm run test:isolation  # Tenant isolation test (needs npm run dev running)
npm run test:closed     # Closed-month integrity test (needs npm run dev running)
npm run test:telegram   # /link and /linkgroup abuse tests (needs npm run dev running)
npm run test:roster     # Members by name, invites, claims, default meals, guests per meal (needs npm run dev)
npm run telegram:setup -- https://public-url   # Connect the bot locally; in production use /console, Telegram
npm run env:production  # Create .env.deploy.local with fresh secrets (see DEPLOY.md)
npm run import:sheet -- scripts/data/<file>.local.json   # Load a mess's real sheet (local DB only)
npm run reconcile:sheet -- scripts/data/<file>.local.json # Compare the site with that sheet
npx prisma generate   # Regenerate Prisma client after schema changes
npx prisma studio     # Open Prisma GUI to inspect database
```

There is no unit test suite. `npm run test:isolation` is an integration test against the running dev server: run it, and `npm run test:closed`, after adding or changing any API route.

## Environment

Copy `.env.local.example` to `.env.local` and fill in the values. Key variables:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Supabase Postgres via transaction pooler (port 6543) — runtime |
| `DIRECT_URL` | Supabase Postgres via session pooler (port 5432) — Prisma CLI only |
| `JWT_SECRET` | 32+ char hex string for signing JWTs |
| `TELEGRAM_BOT_TOKEN` | From @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | **Required** — webhook rejects all updates without it |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis — settings cache, rate limits (optional locally) |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | Bot username shown on the Telegram link screen |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` or `bn` |
| `NEXT_PUBLIC_USE_MOCK_DATA` | `false` in production |
| `PLATFORM_JWT_SECRET` | Optional separate secret for /console sessions (falls back to `JWT_SECRET`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | Optional email (reset links, verification). Without them, resets use admin or console codes |

## Database

- **ORM:** Prisma v7 with `@prisma/adapter-pg` (driver adapter pattern)
- **Schema:** `prisma/schema.prisma` — all models use `@map()` for snake_case DB columns
- **CLI config:** `prisma.config.ts` — uses `DIRECT_URL` for CLI operations
- **Runtime client:** `src/lib/prisma.ts` — singleton with `DATABASE_URL`
- **Seed script:** `scripts/seed-demo.mjs` (excluded from TS build via `tsconfig.json`)
- **Migration SQL:** `MIGRATION.sql` — idempotent SQL for Supabase SQL Editor

> **After any schema change:** Run `npx prisma generate` to regenerate the client.  
> **To push schema to DB:** `$env:DIRECT_URL="..."; npx prisma db push --accept-data-loss`

---

## Architecture Overview

**Framework:** Next.js 16 (App Router, Turbopack) + TypeScript + CSS Modules + `next-intl` for i18n  
**Backend:** All API logic in Next.js API routes (`src/app/api/`) → Prisma → Supabase Postgres  
**Auth:** JWT (jose) stored in localStorage via `AuthContext`  
**Styling:** CSS Modules + CSS custom properties (no Tailwind)  
**Icons:** lucide-react  
**Toasts:** sonner  
**Theming:** next-themes (`data-theme` on `<html>`, CSS variables in `globals.css`)

### Key Architectural Patterns

1. **snake_case ↔ camelCase:** API routes return `snake_case`. The client `src/lib/api.ts` auto-converts.
2. **Role-based access:** `ADMIN` > `MANAGER` > `MEMBER` > `GUEST`. Checked in both layout nav and API routes.
3. **Default-driven meals:** `ensureDailyLogs()` (`src/lib/daily-logs.ts`) lazily creates missing `DailyLog` rows from `UserMealPreference` the first time the mess's data is read each day. There are no cron jobs.
4. **`isOverride` flag:** `false` = auto-generated from preferences; `true` = manually changed.
5. **Settings via Redis:** read mess settings with `getMessSettings(messId)` (`src/lib/mess-settings.ts`). Postgres is the durable store; Redis serves reads. After ANY settings write call `refreshMessSettings(messId)`.
6. **One money calculation:** every meal count, meal rate and balance comes from `calculatePeriodSummary()` in `src/lib/financial.ts`. Never re-implement it in a route.
7. **Never trust a mess id from the request.** Always use `payload.messId` from `verifyToken()`. `verifyToken()` re-checks the member in the DB and returns their CURRENT role.

---

## Project Structure

```
src/
├── app/
│   ├── [locale]/
│   │   ├── page.tsx                    # Landing page (public)
│   │   ├── layout.tsx                  # Root locale layout (providers, fonts)
│   │   ├── (auth)/                     # Auth pages (unauthenticated)
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── (dashboard)/               # Protected pages
│   │       ├── layout.tsx              # Sidebar + topbar + bottom nav + auth guard
│   │       ├── overview/page.tsx
│   │       ├── meals/page.tsx
│   │       ├── expenses/page.tsx
│   │       ├── headcount/page.tsx
│   │       ├── my-summary/page.tsx
│   │       ├── matrix/page.tsx         # Admin only
│   │       ├── members/page.tsx        # Admin only
│   │       ├── audit/page.tsx          # Admin only
│   │       └── settings/page.tsx       # All users (prefs) + Admin (mess config)
│   └── api/                            # API routes (see Module details below)
├── components/
│   ├── ui/                             # Primitives: Button, Card
│   └── composed/                       # Complex: ThemeToggle, LocaleSwitcher, MessSwitcher
├── contexts/
│   └── AuthContext.tsx                 # user, token, login(), logout(), isAuthenticated
├── lib/
│   ├── api.ts                          # Client-side API surface (auto camelCase/snake_case)
│   ├── prisma.ts                       # Server-only Prisma singleton
│   ├── financial.ts                    # Server-only: monthRange, countMealSlots, calculateMealRate, closeMonth
│   ├── auth-utils.ts                   # Server-only: signToken, verifyToken, extractToken
│   ├── meal-preferences.ts            # Server-only: getMemberMealDefaults, getBulkMealDefaults
│   ├── audit.ts                        # Server-only: createAudit() helper
│   ├── constants.ts                    # DEFAULT_CUTOFF_TIME, DEFAULT_TIMEZONE, etc.
│   ├── utils.ts                        # Client: cn(), formatCurrency(), getTimeOfDay(), etc.
│   ├── rate-limit.ts                   # Simple rate limiter for API routes
│   └── telegram/                       # Telegram bot (see Module 10)
├── types/index.ts                      # All TypeScript interfaces and enums
├── i18n/                               # next-intl config (request.ts, routing.ts)
└── middleware.ts                       # Locale redirect middleware (deprecated, will become proxy)
messages/
├── en.json                             # English translations
└── bn.json                             # Bengali translations
```

---

## MODULES — Page-by-Page Reference

Each module below lists: **what it does**, **which files to touch**, **which API routes it uses**, and **what shared dependencies it has**. When working on a module, read that section first.

---

### MODULE 1: Landing Page

**Route:** `/{locale}` (public, no auth required)

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/page.tsx` |
| Styles | `src/app/[locale]/landing.module.css` |
| Layout | `src/app/[locale]/layout.tsx` |

**What it does:** Marketing landing page with hero, features, pricing sections. Links to `/login` and `/register`.

**Dependencies:** None (no API calls, no auth).

**i18n keys:** `landing.*` in `messages/en.json`

---

### MODULE 2: Authentication (Login + Register)

**Routes:** `/{locale}/login`, `/{locale}/register`

| Layer | Files |
|-------|-------|
| Pages | `src/app/[locale]/(auth)/login/page.tsx`, `src/app/[locale]/(auth)/register/page.tsx` |
| Shared styles | `src/app/[locale]/(auth)/auth.module.css` |
| API routes | `src/app/api/auth/login/route.ts`, `src/app/api/auth/register/route.ts` |
| Context | `src/contexts/AuthContext.tsx` |
| Client API | `api.auth.login()`, `api.auth.register()` in `src/lib/api.ts` |
| Server utils | `src/lib/auth-utils.ts` (signToken, verifyToken) |

**What it does:**
- **Login:** Email + password → verifies bcrypt hash → signs JWT with `{ sub, messId, role, messName }` → returns `accessToken` + `user`
- **Register:** Name, email, phone, password, mess invite code → creates Member → signs JWT
- **AuthContext:** Stores `user` + `token` in `localStorage`. Provides `login()`, `logout()`, `isAuthenticated`, `isLoading`.

**Key types:** `LoginRequest`, `RegisterRequest`, `AuthResponse`, `User` in `src/types/index.ts`

**i18n keys:** `login.*`, `register.*`

---

### MODULE 3: Dashboard Layout & Navigation

**Route:** Wraps all `/{locale}/(dashboard)/*` pages

| Layer | Files |
|-------|-------|
| Layout | `src/app/[locale]/(dashboard)/layout.tsx` |
| Styles | `src/app/[locale]/(dashboard)/dashboard.module.css` |
| Components | `MessSwitcher`, `ThemeToggle`, `LocaleSwitcher` in `src/components/composed/` |

**What it does:**
- **Sidebar** (desktop): Logo, mess name, nav items filtered by role, user card with logout
- **Topbar:** Hamburger menu, page title, MessSwitcher, ThemeToggle, notification bell
- **Bottom nav** (mobile): First 5 nav items from filtered main list
- **Auth guard:** Redirects to `/{locale}/login` if `!isAuthenticated`

**Nav items by role:**

| Item | Route | ADMIN | MANAGER | MEMBER |
|------|-------|-------|---------|--------|
| Overview | `/overview` | ✅ | ✅ | ✅ |
| Meals | `/meals` | ✅ | ✅ | ✅ |
| Expenses | `/expenses` | ✅ | ✅ | ✅ |
| Headcount | `/headcount` | ✅ | ✅ | ✅ |
| My Summary | `/my-summary` | ✅ | ✅ | ✅ |
| Deposits | `/deposits` | ✅ | ✅ | ❌ |
| Matrix | `/matrix` | ✅ | ❌ | ❌ |
| Members | `/members` | ✅ | ❌ | ❌ |
| Audit | `/audit` | ✅ | ❌ | ❌ |
| Settings | `/settings` | ✅ | ✅ | ✅ |
| Help & support | `/support` | ✅ | ✅ | ✅ |
| Archive | `/archive` | ✅ | ✅ | ✅ |

**i18n keys:** `nav.*`

---

### MODULE 4: Overview Page

**Route:** `/{locale}/overview`

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/overview/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/overview/overview.module.css` |

**API calls on mount (all parallel via `Promise.allSettled`):**
- `api.expenses.getMealRate(messId, yearMonth, token)` → stat card
- `api.expenses.getExpenses(messId, yearMonth, token)` → recent expenses list
- `api.cook.getHeadcount(messId, token)` → headcount stat
- `api.meals.getToday(memberId, token)` → today's meal toggles
- `api.members.me(token, yearMonth)` → balance stat

**What it renders:**
1. **Greeting** with time-of-day (morning/afternoon/evening)
2. **Stats grid:** Meal Rate, Balance, Month Expense, Headcount
3. **Today's Meals:** Quick preview showing breakfast/lunch/dinner ON/OFF
4. **Quick Actions:** Links to meals, expenses, matrix, headcount
5. **Recent Expenses:** Last 5 expenses with category dots and amounts

**Dependencies:** `useAuth()`, `api.*`, `formatCurrency()`, `getTimeOfDay()`, `getCategoryColor()`

**i18n keys:** `overview.*`, `common.*`

---

### MODULE 5: Meals Page (Today's Meal Toggle)

**Route:** `/{locale}/meals`

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/meals/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/meals/meals.module.css` |
| API routes | `src/app/api/meals/today/route.ts`, `src/app/api/meals/toggle/route.ts`, `src/app/api/meals/guest/route.ts` |
| Server utils | `src/lib/meal-preferences.ts` |

**API calls:**
- `GET api.meals.getToday(memberId, token, date)` → loads or creates today's log
- `POST api.meals.toggleMeal({ memberId, date, slot, status })` → toggle a meal
- `POST api.meals.updateGuest({ memberId, date, guestCount })` → set guest count

**What it renders:**
1. **Header** with cutoff countdown badge (active/expired)
2. **Bulk actions:** "All On" / "All Off" buttons
3. **Three meal cards** (Breakfast/Lunch/Dinner) — large clickable cards with toggle switches
4. **Guest section** — increment/decrement guest count

**Server-side logic in `today/route.ts`:**
- Resolves timezone from mess → telegramGroups
- If no log exists, auto-creates from `getMemberMealDefaults()`
- Per-meal cutoff: queries `mealConfig` table, falls back to legacy `cutOffTime`

**Key types:** `MealSlot`, `MealToggleRequest`, `GuestUpdateRequest`

**i18n keys:** `meals.*`

---

### MODULE 6: Expenses Page

**Route:** `/{locale}/expenses` (all roles — MEMBER can view)

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/expenses/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/expenses/expenses.module.css` |
| API routes | `src/app/api/expenses/sessions/route.ts`, `src/app/api/expenses/sessions/[id]/route.ts`, `src/app/api/expenses/meal-rate/route.ts`, `src/app/api/contributions/route.ts` |
| Server utils | `src/lib/financial.ts` (`calculateMealRate`) |

**Two tabs:**

**Bazaar Sessions tab:**
- `GET api.expenses.sessions.list({ messId, yearMonth, page, limit }, token)` → paginated sessions with `liveMealRate`
- `POST api.expenses.sessions.create(data, token)` → add session (Admin/Manager only)
- `DELETE api.expenses.sessions.delete(id, token)` → delete (Admin only)

**Contributions tab (cash deposits from members):**
- `GET api.contributions.list({ yearMonth, page: 1, limit: 100 }, token)` → full month list (100 limit for summary accuracy)
- `POST api.contributions.add({ memberId, amount, date, note }, token)` → record deposit (Admin/Manager only)
- Creates `LedgerEntry` with `entryType = 'CONTRIBUTION'` — flows directly into member balance

**Member summary card:** Collapsible section above the contributions list showing total deposited per member (computed from loaded contributions via `useMemo`).

**Magic Calculator (floating FAB):**
- Fixed bottom-right, animated pill button with pulsing glow
- Smart mode: live meal rate, total expense, total deposited, what-if expense calculator (new rate = (total + x) / totalMeals), per-member deposit breakdown
- Manual mode: standard numpad calculator (4-function with ±, %)
- `totalMeals` derived as `totalExpense / mealRate` (no extra API call)
- i18n keys: `calculator.*`

**Memo photos:** a trip can be `ITEMIZED` or `MEMO_TOTAL` (photo of the paper memo + one total); photos are stored in `BazaarMemo`, see `context/04-expenses.md`.

**Dropdowns:** never use a native `<select>`. Use `src/components/ui/Select/Select.tsx`.

**Key types:** `ExpenseCategory`, `BazaarSessionResponse`, `ContributionResponse`, `BazaarSessionRequest`, `ContributionRequest`

**i18n keys:** `expenses.*`, `calculator.*`

---

### MODULE 7: Headcount Page (Cook View)

**Route:** `/{locale}/headcount`

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/headcount/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/headcount/headcount.module.css` |
| API route | `src/app/api/cook/headcount/route.ts` |

**API calls:**
- `GET api.cook.getHeadcount(messId, token)` → { messName, date, memberCount, guestCount, totalHeadcount }

**Server-side logic:** Resolves today using mess timezone. Members without a log = default ON (count 1). Sums `lunchCount` across all members + `guestCount`.

**Key types:** `HeadcountResponse`

**i18n keys:** `headcount.*`

---

### MODULE 8: My Summary Page

**Route:** `/{locale}/my-summary`

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/my-summary/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/my-summary/my-summary.module.css` |

**API calls:**
- `GET api.members.me(token, yearMonth)` → { mealRate, myMealCount, contributed, mealCost, balance }
- `GET api.meals.getToday(memberId, token)` → today's meals

**What it renders:** Personal monthly stats — meals eaten, amount contributed, balance (positive = overpaid, negative = owes).

**i18n keys:** `mySummary.*`

---

### MODULE 9: Settings Page

**Route:** `/{locale}/settings`

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/settings/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/settings/settings.module.css` |
| API routes | `src/app/api/mess/settings/route.ts`, `src/app/api/members/meal-preferences/route.ts`, `src/app/api/admin/telegram-group/route.ts`, `src/app/api/mess/meal-configs/route.ts` |

**Sections (top to bottom):**

1. **Meal Preferences** (all users) — 6 toggles: breakfast/lunch/dinner × weekday/weekend
   - `GET api.mealPreferences.getAll(token)`
   - `PUT api.mealPreferences.update({ mealType, dayType, enabled }, token)`

2. **Mess Settings** (Admin/Manager) — name, cutoff time, budget
   - `PUT api.admin.updateSettings({ name, cutOffTime }, token)`

3. **Invite Code Card** (Admin only) — large monospace code + copy button
   - Data loaded from `api.mess.list(token)`

4. **Telegram Group** (Admin only) — link a Telegram group with chatId, chatName, timezone
   - `GET /api/admin/telegram-group` → current linked group
   - `POST /api/admin/telegram-group` → link/update group

5. **Danger Zone** (Admin/Manager) — delete mess (disabled, contact support)

**i18n keys:** `settings.*`

---

### MODULE 10: Admin — Matrix Page

**Route:** `/{locale}/matrix` (Admin only)

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/matrix/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/matrix/matrix.module.css` |
| API routes | `src/app/api/admin/matrix/route.ts`, `src/app/api/admin/meals/route.ts`, `src/app/api/admin/close-month/route.ts`, `src/app/api/admin/no-cook/route.ts` |
| Server utils | `src/lib/financial.ts` (`closeMonth`) |

**API calls:**
- `GET api.admin.getMatrix(messId, yearMonth, token)` → full month data (members × days)
- `PUT api.admin.editMeal({ memberId, date, slot, value }, token)` → edit any member's meal
- `POST api.admin.closeMonth({ messId, adminId, yearMonth }, token)` → freeze month
- `POST api.admin.noCook({ action, date, reason }, token)` → toggle all meals off/on

**Key types:** `MonthMatrixResponse`, `MemberMatrixRow`, `DayEntry`, `CloseMonthRequest`

**i18n keys:** `matrix.*`

---

### MODULE 11: Admin — Members Page

**Route:** `/{locale}/members` (Admin only)

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/members/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/members/members.module.css` |
| API routes | `src/app/api/members/route.ts`, `src/app/api/members/[id]/route.ts` |

**API calls:**
- `GET api.members.list(messId, token)` → { messName, members[] }
- `PUT api.admin.updateMember(memberId, { role, isActive, guestFrom, guestUntil }, token)`

**i18n keys:** `members.*`

---

### MODULE 12: Admin — Audit Log Page

**Route:** `/{locale}/audit` (Admin only)

| Layer | Files |
|-------|-------|
| Page | `src/app/[locale]/(dashboard)/audit/page.tsx` |
| Styles | `src/app/[locale]/(dashboard)/audit/audit.module.css` |
| API route | `src/app/api/admin/audit/route.ts` |

**API calls:**
- `GET api.admin.getAuditLog({ page, limit, action }, token)` → paginated audit entries

**i18n keys:** `audit.*`

---

### MODULE 13: Mess Switching

A mess is created only at sign-up (`POST /api/auth/register`, mode `create`). There is no in-app "create another mess": the creator would only hold a `MessMembership` there, not a `Member` row, so their meal logs would be billed in a mess they are not a member of.

| Layer | Files |
|-------|-------|
| Component | `src/components/composed/MessSwitcher/MessSwitcher.tsx` + `.module.css` |
| API routes | `src/app/api/mess/route.ts` (GET list), `src/app/api/mess/[messId]/switch/route.ts` |

- `GET api.mess.list(token)` lists the person's messes; `GET api.mess.switchMess(messId, token)` returns a new JWT for another mess.
- MessSwitcher renders only when the person belongs to 2 or more messes.

**i18n keys:** `messSwitcher.*`

---

### MODULE 14: Telegram Bot

**No frontend page** — this is a server-side webhook handler.

| Layer | Files |
|-------|-------|
| Webhook | `src/app/api/telegram/webhook/route.ts` |
| Composition root | `src/lib/telegram/index.ts` (`handleWebhookUpdate()`) |
| Dispatcher | `src/lib/telegram/commands/dispatcher.ts` |
| Handlers | `src/lib/telegram/commands/handlers/` (one file per command) |
| Services | `src/lib/telegram/services/` (meal.service.ts, nomeal.service.ts) |
| Repositories | `src/lib/telegram/repositories/` (meal, preference, member) |
| DTOs | `src/lib/telegram/dto/` |
| Infra | `src/lib/telegram/infrastructure/` |

**Bot commands:** `/mealio` (opens the personal Mini App; connects the group when a linked admin sends it), `/link <code>`, `/start <code>` (one-tap link), `/linkgroup <code>` (older fallback), `/meal`, `/nomeal`, `/mealon`, `/announce`, `/status`, `/rate`, `/balance`, `/start`

**Account linking:** the member gets a one-time code in web Settings → My Telegram (`POST /api/members/telegram-link`) and sends `/link <code>` to the bot. Phone-number linking was removed (anyone knowing a phone number could take over the account).

**Time-based targeting for `/meal on` / `/meal off`:**
- Before `lunchCutoffTime` (default 10:00) → targets LUNCH
- After `lunchCutoffTime`, before `cutOffTime` (default 21:00) → targets DINNER
- After `cutOffTime` → command rejected

**Self-setup:** when a linked admin adds the bot to a group it connects itself (`my_chat_member`, `services/group-presence.service.ts`). The **Mini App** (`/[locale]/tg`, `GET /api/tg/home`) is read-only and identifies people only by Telegram's signed `initData` (`webapp-auth.ts`). Today's meals and headcount logic live in `src/lib/today.ts`, shared with `/api/meals/today` and `/api/cook/headcount`. Full reference: `context/18-telegram-mini-app.md`.

See `TELEGRAM_SETUP.md` for full documentation.

---

### MODULE 15: Daily Logs (no cron jobs)

There are **no cron jobs**. `ensureDailyLogs(messId)` in `src/lib/daily-logs.ts` runs on demand
(from `calculatePeriodSummary`, headcount and meals/today) and:

1. Deactivates guest members whose `guestUntil` has passed.
2. Creates missing `DailyLog` rows for the open period up to today (never before a member's `joinedAt`), using `getBulkMealDefaults()`.

A Redis marker (`mealio:mess:<id>:logs-ensured:<date>`) makes repeat calls on the same day a single GET.
Call `invalidateDailyLogsMarker(messId)` after membership changes.
Before changing anything that affects defaults (preferences, meal configs, weekend days, member status) call `settleDailyLogs(messId)` so the change is never retroactive.
Full flow and the risk list: `context/12-daily-meal-counting.md`.

The old Telegram cutoff warning and month-end reminder were removed with the crons.

### MODULE 16: SaaS platform (sign-up, recovery, support, console)

Full reference: `context/16-saas-platform.md`. Key points:

- Sign-up has two modes: `create` (new mess, caller becomes ADMIN and `Mess.ownerId`) and `join` (invite code). Joins wait for admin approval when `requireJoinApproval` is on (default): `joinStatus = PENDING`, `isActive = false`.
- Limits come from `src/lib/plans.ts` (`getPlan(mess.plan)`). Everyone is FREE for now.
- Password recovery: email link when Resend is configured, otherwise an 8-char one-time code from the mess admin (Members page) or staff (console).
- `verifyToken()` rejects deleted, pending or inactive members, tokens older than `passwordChangedAt`, and deleted or suspended messes.
- Log notable auth and abuse events with `logSecurityEvent()`. Log staff actions with `platformAudit()`.
- Public pages (`/support`, `/privacy`, `/terms`) live in the `(public)` route group.
- `/console` is the staff portal: separate `PlatformAdmin` login (`requirePlatformAdmin(req)` in API routes), English only. Never accept a mess token there, and never accept a platform token in mess routes.

### MODULE 17: Periods, closed months and the archive

Full reference: `context/17-periods-and-archive.md`. Rules that must not be broken:

- Money records (bazaar, expenses, deposits) must be dated inside the OPEN period: use `checkDateInOpenPeriod()` from `src/lib/period.ts`, never only `isDateInClosedPeriod()`.
- Pages ask for the current period by sending no month. Never use the calendar month (`getCurrentYearMonth()`) to pick a period.
- A closed period is frozen: `closeMonth()` stores `MessMonth.snapshot` and `calculatePeriodSummary()` reads it for closed periods. Never recalculate a closed month from current settings.
- The archive (`/api/archive`, `/archive`) is open to every member and read-only. It must show only closed months and must never include member names that were anonymised.
- Real mess data lives in `scripts/data/*.local.*` (git-ignored). Never commit it.

### MODULE 18: Members by name, invites and guests per meal

Full reference: `context/19-members-by-name-and-guests.md`. Rules:

- A member can exist with **only a name** (`email` and `passwordHash` NULL). Never assume a member has an email or a password.
- Meals without an own preference follow the mess default (`settings.defaultMeals`). Per-member defaults go through `src/lib/member-preferences.ts`.
- Guests are **per meal**. Read and write them only through `src/lib/guests.ts` (`slotGuests`, `setSlotGuestsData`, `GUEST_SELECT`). Any query that feeds money or headcount must select `GUEST_SELECT`.
- Admins and managers may change anyone's meals and guests; every change is audited with the actor.

### Billing rules (mess settings)

| Setting | Values | Effect |
|---------|--------|--------|
| `guestMealPolicy` | `HOST` (default) / `SHARED` | Guests are set per meal (older days: every meal the host ate). `HOST` adds them to the host's count; `SHARED` leaves them out of everyone's count so the cost spreads via the meal rate. |
| `bazaarCountsAsDeposit` | `false` (default) / `true` | When true, bazaar expenses are credited to the member who recorded them. Leave false when shopping uses deposited money (otherwise it is double counted). |
| `carryForwardBalance` | `true` (default) / `false` | Whether closing a month carries each member's balance into the next month. |
| `weekendDays` | `[0, 6]` (default) | Which weekdays use members' WEEKEND defaults (0 = Sun … 6 = Sat). |

Balance = deposits (`CONTRIBUTION`) + carry-forward + bazaar credit − billable meals × meal rate.
---

## Shared Dependencies Reference

### `src/lib/api.ts` — Client API Surface

All frontend pages use this. Methods are grouped: `api.auth.*`, `api.meals.*`, `api.expenses.*`, `api.members.*`, `api.cook.*`, `api.mess.*`, `api.mealPreferences.*`, `api.mealConfigs.*`, `api.admin.*`.

Auto-converts request bodies to `snake_case` and responses to `camelCase`.

### `src/lib/financial.ts` — Server-Only Financial Logic

| Function | Used By |
|----------|---------|
| `monthRange(yearMonth)` | Almost all API routes |
| `countMealSlots(logs)` | Meal rate calculation, member balance |
| `calculateMealRate(messId, yearMonth)` | Expenses API, overview |
| `calculateMemberBalance(contributed, meals, rate)` | Members, my-summary |
| `closeMonth(messId, yearMonth, adminId)` | Matrix close-month API |
| `extractCutoffTime(cutOffTime)` | Meals today |
| `isCutoffPassed(cutoffHHMM, date, tz)` | Meals toggle |

### `src/lib/meal-preferences.ts` — Server-Only Meal Defaults

| Function | Used By |
|----------|---------|
| `getMemberMealDefaults(memberId, messId, date)` | meals/today, meals/toggle |
| `getBulkMealDefaults(memberIds, messId, date)` | daily-logs.ts (`ensureDailyLogs`) |
| `getDayType(date)` | Both above |

### `src/types/index.ts` — All Types

Contains: `Role`, `MealSlot`, `ExpenseCategory`, `MonthStatus` (enums) + all entity interfaces + all API request/response types.

### `src/lib/constants.ts` — Shared Constants

```
DEFAULT_CUTOFF_TIME = "21:00"
DEFAULT_LUNCH_CUTOFF_TIME = "10:00"
DEFAULT_TIMEZONE = "Asia/Dhaka"
```

---

## Coding Conventions

1. **CSS Modules only.** Every page has a `.module.css` file. Use CSS custom properties from `globals.css`.
2. **No Tailwind.** Do not add Tailwind classes.
3. **`"use client"` directive** on all dashboard pages (they use hooks).
4. **i18n:** Use `useTranslations("namespace")` in client components. Keys in `messages/en.json` and `messages/bn.json`.
5. **Toasts:** `import { toast } from "sonner"` — already mounted in locale layout.
6. **Icons:** `import { IconName } from "lucide-react"`.
7. **API client:** Always use `src/lib/api.ts` from frontend. Never call `fetch()` directly (except for endpoints not yet in the API client).
8. **Auth:** Always destructure `{ user, token } = useAuth()` and pass `token` to API calls.
9. **Error handling:** Wrap API calls in try/catch, show `toast.error()` on failure.
10. **Prisma:** Server-only. Import from `src/lib/prisma.ts`. Never import Prisma in client components.
11. **Audit logging:** Use `createAudit()` from `src/lib/audit.ts` for admin operations.
12. **scripts/ directory:** Excluded from TypeScript build (`tsconfig.json`). Standalone CLI scripts.
13. **API error handling — strict rule:** Raw DB/Prisma error messages must NEVER reach the frontend. Every API route must follow this pattern:
    - **Validation errors (400):** Return a clear, user-facing `{ detail: "..." }` explaining what input was wrong.
    - **Business rule violations (400/403/404):** Return a meaningful `{ detail: "..." }` (e.g. "Member not found", "Inactive member").
    - **Unexpected errors (500):** `console.error('[ROUTE path] context', err)` on the server, return `{ detail: 'Something went wrong. Please try again.' }` — never `err.message`.
    - The user must never see database internals, constraint names, table names, or Prisma error codes.

---

## Prisma Schema — Quick Reference

| Model | Key Fields | Notes |
|-------|-----------|-------|
| `Mess` | id, name, inviteCode, cutOffTime, mealConfigs[], telegramGroups[] | Central entity |
| `Member` | id, messId, email, passwordHash, role, telegramUid | One member per mess |
| `DailyLog` | messId, memberId, logDate, breakfastCount/lunchCount/dinnerCount, guestCount, frozen, isOverride | One per member per day |
| `MealConfig` | messId, mealType, enabled, cutoffTime, maxCount | 3 rows per mess (B/L/D) |
| `UserMealPreference` | memberId, messId, mealType, dayType, enabled, defaultCount | 6 rows per member (B/L/D × WD/WE) |
| `Expense` | messId, addedBy, amount, category, expenseDate, yearMonth | |
| `MessMonth` | messId, yearMonth, isClosed, mealRate, totalExpense | Created on close |
| `LedgerEntry` | messId, memberId, entryType, amount | DEDUCTION / CARRY_FORWARD |
| `TelegramGroup` | chatId, messId, timezone | One active group per mess |
| `MessMembership` | memberId, messId, role | Multi-mess support |
| `AuditLog` | actorId, action, targetTable, oldValue, newValue | |

> **Note:** `DailyLog` uses integer counts (0 = off, 1+ = portions), NOT booleans. The API response includes convenience booleans (`breakfast: count > 0`) for backwards compat.

---

## Working on a Module — Checklist

When you receive a task for a specific module:

1. ✅ Read the module section above
2. ✅ Check the page `.tsx` file and its `.module.css`
3. ✅ Check the relevant API route(s) in `src/app/api/`
4. ✅ Check `src/lib/api.ts` for the client-side API method
5. ✅ Check `src/types/index.ts` for relevant types
6. ✅ Check `messages/en.json` for i18n keys (and add to `bn.json` too)
7. ✅ After DB schema changes: run `npx prisma generate`
8. ✅ After code changes: verify with `npm run build` (catches TS errors)
9. ✅ After adding new API routes: add the client method to `src/lib/api.ts`
