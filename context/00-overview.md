# Mealio — Context Overview

This directory contains per-module context files. When working on any module, read the relevant file here FIRST, then cross-reference CLAUDE.md for conventions.

## Index

| File | Module | Key Entry Points |
|------|--------|-----------------|
| `01-auth.md` | Login, Register, JWT, AuthContext | `api.auth.*`, `AuthContext`, `auth-utils.ts` |
| `02-dashboard-layout.md` | Sidebar, Topbar, Nav, MessSwitcher | `layout.tsx`, `dashboard.module.css` |
| `03-meals.md` | Today's Meals, Toggle, Guest, Preferences | `meals/page.tsx`, `api/meals/*` |
| `04-expenses.md` | Expenses, Meal Rate, Categories | `expenses/page.tsx`, `api/expenses/*` |
| `05-headcount.md` | Cook Headcount View | `headcount/page.tsx`, `api/cook/headcount` |
| `06-overview.md` | Overview Dashboard | `overview/page.tsx` |
| `07-settings.md` | Settings, Preferences, Telegram Linking | `settings/page.tsx`, `api/mess/settings`, `api/admin/telegram-group` |
| `08-matrix.md` | Month Matrix, Close Month, No-Cook | `matrix/page.tsx`, `api/admin/*` |
| `09-members.md` | Member Management | `members/page.tsx`, `api/members/*` |
| `10-mess-management.md` | Create Mess, Switch Mess | `mess/create/page.tsx`, `MessSwitcher`, `api/mess/*` |
| `11-telegram-bot.md` | Full Telegram Bot | `src/lib/telegram/**` |
| `12-cron-jobs.md` | All 4 Cron Jobs | `api/cron/*` |
| `13-shared-libs.md` | All shared `src/lib/` files | `api.ts`, `financial.ts`, `auth-utils.ts`, `utils.ts`, `meal-preferences.ts` |
| `14-database-schema.md` | Prisma models, fields, relationships | `prisma/schema.prisma` |
| `15-audit.md` | Admin Audit Log | `audit/page.tsx`, `api/admin/audit`, `src/lib/audit.ts` |

## Golden Rules (always apply)

1. **snake_case ↔ camelCase:** API routes return `snake_case`. `src/lib/api.ts` auto-converts to `camelCase` for the frontend. Never manually convert in components.
2. **Integer meal counts:** `DailyLog` uses `breakfastCount/lunchCount/dinnerCount` integers (0=off, 1=normal, 2+=extra). NOT booleans. Convenience booleans (`breakfast: count > 0`) are in the API response for legacy compatibility.
3. **Server-only files:** `prisma.ts`, `financial.ts`, `meal-preferences.ts`, `auth-utils.ts`, `audit.ts` — never import in client components (`"use client"`).
4. **CSS Modules only** — no Tailwind. CSS variables from `globals.css`.
5. **i18n:** All UI strings via `useTranslations("namespace")`. Keys in both `messages/en.json` AND `messages/bn.json`.
6. **Audit log:** Admin operations must call `createAudit()` from `src/lib/audit.ts`.
7. **Role hierarchy:** `ADMIN` > `MANAGER` > `MEMBER` > `GUEST`. Checked both in layout nav AND in API routes.
8. **After schema changes:** Run `npx prisma generate`. After any code change: `npm run build` (TypeScript check).
