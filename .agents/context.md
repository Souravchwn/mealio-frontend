# 🍽 Mealio Frontend — Agent Context File

> **This file is the single source of truth for any AI agent or developer working on the Mealio frontend.**
> Read this ENTIRELY before writing any code.

---

## Table of Contents

- [1. Product Overview](#1-product-overview)
- [2. Tech Stack](#2-tech-stack)
- [3. Architecture](#3-architecture)
- [4. Design System](#4-design-system)
- [5. Internationalization (i18n)](#5-internationalization-i18n)
- [6. Authentication & Authorization](#6-authentication--authorization)
- [7. Pages & Routes](#7-pages--routes)
- [8. Backend API Reference](#8-backend-api-reference)
- [9. Data Models & TypeScript Types](#9-data-models--typescript-types)
- [10. Component Library](#10-component-library)
- [11. State Management](#11-state-management)
- [12. Project Structure](#12-project-structure)
- [13. Coding Conventions](#13-coding-conventions)
- [14. Environment Variables](#14-environment-variables)
- [15. User Roles & Permissions](#15-user-roles--permissions)

---

## 1. Product Overview

**Mealio** is a high-integrity automation platform for shared living ("messes") in Bangladesh & India. It replaces manual Excel-based ledgers and WhatsApp chaos with a structured, ACID-compliant system.

### Target Users (50+ person mess culture)

| Role | Description | Primary Interface |
|---|---|---|
| **Member** | Regular mess resident (5–30 per mess) | Mobile — toggle meals, check balance, add guests |
| **Meal Manager** | Rotating role — handles daily bazaar shopping | Mobile-first — log expenses by category |
| **Admin** | Permanent role — financial oversight | Desktop — month matrix, close month, audit |
| **Cook** | Prepares food based on headcount | Tablet/Phone — simplified headcount dashboard |

### Core Business Problems Solved

| Problem | Solution |
|---|---|
| Manual Excel tracking | Auto-calculated meal matrix from live data |
| WhatsApp message confusion | Telegram Bot + PWA for meal toggles |
| Monthly bill arguments | ACID transactions — every taka/rupee is traceable |
| Cook doesn't know headcount | Real-time dashboard with Firebase cache |
| No expense categorization | Categorized bazaar logging (Protein, Carb, Vegetable, etc.) |

### Key Business Metrics

- **Meal Rate** = Total Expenses ÷ Total Meals (dynamically calculated)
- **Member Balance** = Deposits − (Personal Meals × Meal Rate)
- **Food Waste Target** = 15% reduction via cut-off enforcement + headcount

---

## 2. Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Framework** | Next.js (App Router) | 15.x | SSR, routing, API routes for BFF |
| **Language** | TypeScript | 5.x | Type safety across all code |
| **Styling** | Vanilla CSS (CSS Modules) | — | Maximum control, no framework lock-in |
| **i18n** | next-intl | latest | English + Bangla support |
| **Auth** | JWT (access + refresh tokens) | — | Stored in httpOnly cookies |
| **HTTP Client** | fetch (native) | — | API calls to Spring Boot backend |
| **Icons** | Lucide React | latest | Consistent, tree-shakeable icon set |
| **Charts** | Recharts | latest | Expense trends, nutrition breakdowns |
| **Fonts** | Google Fonts (Inter + Hind Siliguri) | — | Inter for English, Hind Siliguri for Bangla |
| **Date Handling** | date-fns | latest | Lightweight date formatting |
| **Form Handling** | React Hook Form + Zod | latest | Validation with type inference |
| **Notifications** | Sonner | latest | Toast notifications |

### Why NOT Tailwind CSS

The BRD mentions Tailwind, but this project uses **Vanilla CSS with CSS Modules** for:
- Full design control for the premium aesthetic
- Better i18n RTL support potential
- Smaller bundle size
- No class name bloat in JSX

---

## 3. Architecture

### App Router Structure (Next.js 15)

```
app/
├── [locale]/                     ← i18n wrapper (en, bn)
│   ├── layout.tsx                ← Root layout with providers
│   ├── page.tsx                  ← Landing page (public)
│   ├── login/page.tsx            ← Login page
│   ├── register/page.tsx         ← Registration page
│   │
│   ├── (dashboard)/              ← Authenticated layout group
│   │   ├── layout.tsx            ← Sidebar + topbar layout
│   │   │
│   │   ├── overview/page.tsx     ← Role-based dashboard home
│   │   │
│   │   ├── meals/                ← Member: meal management
│   │   │   ├── page.tsx          ← Today's meal status + toggles
│   │   │   └── history/page.tsx  ← Meal history calendar view
│   │   │
│   │   ├── expenses/             ← Manager: bazaar logging
│   │   │   ├── page.tsx          ← Expense list + add form
│   │   │   └── analytics/page.tsx← Category breakdown charts
│   │   │
│   │   ├── headcount/page.tsx    ← Cook: real-time headcount
│   │   │
│   │   ├── matrix/page.tsx       ← Admin: month grid (Excel-killer)
│   │   │
│   │   ├── members/              ← Admin: member management
│   │   │   ├── page.tsx          ← Member list
│   │   │   └── [id]/page.tsx     ← Member detail + balance
│   │   │
│   │   ├── audit/page.tsx        ← Admin: audit trail
│   │   │
│   │   └── settings/page.tsx     ← Mess settings (cut-off time, etc.)
│   │
│   └── not-found.tsx
│
├── api/                          ← BFF (Backend-for-Frontend) routes
│   ├── auth/
│   │   ├── login/route.ts
│   │   ├── refresh/route.ts
│   │   └── logout/route.ts
│   └── proxy/[...path]/route.ts  ← Proxy to Spring Boot backend
│
└── globals.css                   ← Global styles + CSS custom properties
```

### Data Flow

```
Browser → Next.js App Router → BFF API Routes → Spring Boot Backend → PostgreSQL
                                     ↓
                              JWT in httpOnly cookie
                              (never exposed to JS)
```

The BFF (Backend-for-Frontend) pattern:
1. **Login**: Client sends credentials → BFF forwards to Spring Boot → receives JWT → sets httpOnly cookie
2. **API Calls**: Client calls `/api/proxy/...` → BFF reads cookie → attaches JWT Bearer header → forwards to Spring Boot
3. **Refresh**: BFF automatically refreshes expired tokens using the refresh token

---

## 4. Design System

### Philosophy

Premium, modern, and alive. The UI should feel like a fintech app — clean, trustworthy, with subtle animations that delight.

### Color Palette

```css
:root {
  /* Brand Colors */
  --color-primary: #6366f1;         /* Indigo 500 — trust, premium */
  --color-primary-hover: #4f46e5;   /* Indigo 600 */
  --color-primary-light: #e0e7ff;   /* Indigo 100 */
  --color-primary-dark: #3730a3;    /* Indigo 800 */

  /* Accent */
  --color-accent: #f59e0b;          /* Amber 500 — warmth, food */
  --color-accent-hover: #d97706;    /* Amber 600 */
  --color-accent-light: #fef3c7;    /* Amber 100 */

  /* Semantic */
  --color-success: #10b981;         /* Emerald 500 */
  --color-success-light: #d1fae5;
  --color-warning: #f59e0b;         /* Amber 500 */
  --color-warning-light: #fef3c7;
  --color-danger: #ef4444;          /* Red 500 */
  --color-danger-light: #fee2e2;
  --color-info: #3b82f6;            /* Blue 500 */
  --color-info-light: #dbeafe;

  /* Neutrals */
  --color-bg: #f8fafc;              /* Slate 50 */
  --color-bg-card: #ffffff;
  --color-bg-sidebar: #1e1b4b;     /* Indigo 950 — dark sidebar */
  --color-text: #0f172a;            /* Slate 900 */
  --color-text-secondary: #64748b;  /* Slate 500 */
  --color-text-muted: #94a3b8;      /* Slate 400 */
  --color-border: #e2e8f0;          /* Slate 200 */
  --color-border-hover: #cbd5e1;    /* Slate 300 */

  /* Dark Mode */
  --color-bg-dark: #0f0d1a;
  --color-bg-card-dark: #1a1730;
  --color-text-dark: #f1f5f9;
  --color-text-secondary-dark: #94a3b8;
  --color-border-dark: #2d2a4a;
}
```

### Typography

```css
:root {
  --font-primary: 'Inter', sans-serif;         /* English */
  --font-bangla: 'Hind Siliguri', sans-serif;  /* Bangla */

  --text-xs: 0.75rem;      /* 12px */
  --text-sm: 0.875rem;     /* 14px */
  --text-base: 1rem;       /* 16px */
  --text-lg: 1.125rem;     /* 18px */
  --text-xl: 1.25rem;      /* 20px */
  --text-2xl: 1.5rem;      /* 24px */
  --text-3xl: 1.875rem;    /* 30px */
  --text-4xl: 2.25rem;     /* 36px */
}
```

### Spacing Scale

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
}
```

### Border Radius

```css
:root {
  --radius-sm: 0.375rem;   /* 6px */
  --radius-md: 0.5rem;     /* 8px */
  --radius-lg: 0.75rem;    /* 12px */
  --radius-xl: 1rem;       /* 16px */
  --radius-2xl: 1.5rem;    /* 24px */
  --radius-full: 9999px;
}
```

### Shadows (Elevation System)

```css
:root {
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
  --shadow-glow: 0 0 20px rgb(99 102 241 / 0.15);  /* Primary glow */
}
```

### Animation Tokens

```css
:root {
  --transition-fast: 150ms ease;
  --transition-base: 250ms ease;
  --transition-slow: 350ms ease;
  --transition-spring: 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

### Glassmorphism (for cards, modals)

```css
.glass {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.3);
}

.glass-dark {
  background: rgba(15, 13, 26, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

### Component Design Patterns

- **Cards**: Rounded corners (`--radius-lg`), subtle shadow, hover lift animation
- **Buttons**: Rounded (`--radius-md`), primary filled + secondary outlined + ghost variants
- **Inputs**: Rounded (`--radius-md`), focus ring with `--color-primary`, floating labels
- **Tables**: Alternating row backgrounds, sticky headers, horizontal scroll on mobile
- **Modals**: Glass backdrop, slide-up animation, max-width 480px
- **Sidebar**: Dark (`--color-bg-sidebar`), icon + text, collapsible on desktop, drawer on mobile

---

## 5. Internationalization (i18n)

### Strategy

Use `next-intl` with URL-based locale routing: `/en/...` and `/bn/...`

### Locale Files Location

```
messages/
├── en.json      ← English translations
└── bn.json      ← Bangla (বাংলা) translations
```

### Translation Key Convention

Use dot-notation namespaced keys:

```json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "loading": "Loading...",
    "error": "Something went wrong"
  },
  "nav": {
    "overview": "Overview",
    "meals": "My Meals",
    "expenses": "Expenses",
    "headcount": "Headcount",
    "matrix": "Month Matrix",
    "members": "Members",
    "audit": "Audit Trail",
    "settings": "Settings"
  },
  "meals": {
    "title": "Today's Meals",
    "breakfast": "Breakfast",
    "lunch": "Lunch",
    "dinner": "Dinner",
    "on": "ON",
    "off": "OFF",
    "guestCount": "Guest Count",
    "cutoffPassed": "Cut-off time has passed"
  },
  "expenses": {
    "title": "Bazaar Expenses",
    "addExpense": "Add Expense",
    "amount": "Amount",
    "category": "Category",
    "description": "Description",
    "mealRate": "Meal Rate",
    "categories": {
      "PROTEIN": "Protein",
      "CARB": "Carbohydrate",
      "VEGETABLE": "Vegetable",
      "SPICE": "Spice",
      "OIL": "Oil",
      "UTILITY": "Utility",
      "OTHER": "Other"
    }
  }
}
```

### Font Switching

When locale is `bn`, apply `--font-bangla` (Hind Siliguri) as the primary font family on `<html>`.

### Number & Currency Formatting

- English: `৳ 850.00` or `BDT 850.00`
- Bangla: `৳ ৮৫০.০০` (use Bangla numerals)
- Always use `Intl.NumberFormat` with the correct locale

### Date Formatting

- English: `March 15, 2026`
- Bangla: `১৫ মার্চ, ২০২৬`
- Use `date-fns` with locale support

---

## 6. Authentication & Authorization

### JWT Flow (via BFF)

```
┌─────────┐     POST /api/auth/login      ┌──────────┐     POST /auth/login     ┌──────────────┐
│ Browser  │ ──────────────────────────────► │ Next.js  │ ─────────────────────► │ Spring Boot  │
│          │                                │ BFF      │                         │ Backend      │
│          │ ◄─────────────────────────────── │          │ ◄───────────────────── │              │
│          │  Set-Cookie: access_token       │          │  { accessToken,        │              │
│          │  Set-Cookie: refresh_token      │          │    refreshToken,       │              │
│          │                                │          │    user }              │              │
└─────────┘                                └──────────┘                         └──────────────┘
```

### Cookie Configuration

```typescript
// Access Token Cookie
{
  name: 'mealio_access_token',
  httpOnly: true,
  secure: true,           // HTTPS only in production
  sameSite: 'lax',
  path: '/',
  maxAge: 15 * 60         // 15 minutes
}

// Refresh Token Cookie
{
  name: 'mealio_refresh_token',
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/api/auth/refresh',
  maxAge: 7 * 24 * 60 * 60  // 7 days
}
```

### Middleware Auth Guard

Next.js middleware checks for valid access token on all `/(dashboard)` routes. If expired, attempts silent refresh. If refresh fails, redirects to `/login`.

### Role-Based Access Control (RBAC)

```typescript
enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER'
}

// Route permissions
const ROUTE_PERMISSIONS: Record<string, Role[]> = {
  '/overview':    ['ADMIN', 'MANAGER', 'MEMBER'],
  '/meals':       ['ADMIN', 'MANAGER', 'MEMBER'],
  '/expenses':    ['ADMIN', 'MANAGER'],
  '/headcount':   ['ADMIN', 'MANAGER', 'MEMBER'],  // Cook is a role variant
  '/matrix':      ['ADMIN'],
  '/members':     ['ADMIN'],
  '/audit':       ['ADMIN'],
  '/settings':    ['ADMIN'],
};
```

---

## 7. Pages & Routes

### Public Pages

| Route | Page | Description |
|---|---|---|
| `/` | Landing | Product showcase, features, CTA to login/register |
| `/login` | Login | Email/phone + password, locale switcher |
| `/register` | Register | Create account, join a mess via invite code |

### Authenticated Pages (Dashboard)

| Route | Page | Roles | Description |
|---|---|---|---|
| `/overview` | Dashboard Home | All | Role-specific cards: today's meals, balance, headcount, quick stats |
| `/meals` | My Meals | All | Today's meal toggles (B/L/D), guest add, cut-off countdown timer |
| `/meals/history` | Meal History | All | Calendar view of past meal attendance |
| `/expenses` | Expenses | Admin, Manager | List expenses, add new expense form, live meal rate |
| `/expenses/analytics` | Expense Analytics | Admin, Manager | Category pie chart, daily trend line chart, month comparison |
| `/headcount` | Cook's Dashboard | All | Big number display: total headcount, member count, guest count |
| `/matrix` | Month Matrix | Admin | Full member × day grid, Excel-style, with totals |
| `/members` | Member List | Admin | All members, roles, balances, status |
| `/members/[id]` | Member Detail | Admin | Individual meal history, balance ledger, role management |
| `/audit` | Audit Trail | Admin | Chronological log of all admin overrides with reasons |
| `/settings` | Mess Settings | Admin | Cut-off time, mess name, invite code management |

---

## 8. Backend API Reference

### Base URL

```
Production: https://mealio-api.railway.app  (configurable via NEXT_PUBLIC_API_URL)
Development: http://localhost:8080
```

### Authentication Endpoints

> **Note:** These endpoints need to be implemented on the backend. The current backend README doesn't mention auth endpoints. Coordinate with backend team.

| Method | Endpoint | Body | Response |
|---|---|---|---|
| `POST` | `/auth/login` | `{ email, password }` | `{ accessToken, refreshToken, user }` |
| `POST` | `/auth/register` | `{ name, email, password, messInviteCode }` | `{ accessToken, refreshToken, user }` |
| `POST` | `/auth/refresh` | `{ refreshToken }` | `{ accessToken, refreshToken }` |
| `POST` | `/auth/logout` | — | `204 No Content` |

### Telegram Bot Webhook

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/telegram/webhook` | Receives Telegram Updates |
| `GET` | `/api/telegram/health` | Liveness check |

### Meal Management

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/meals/today?memberId=` | Get today's meal status |
| `PUT` | `/api/meals/toggle` | Toggle a meal slot `{ memberId, date, slot, status }` |
| `PUT` | `/api/meals/guest` | Set guest count `{ memberId, date, guestCount }` |

### Expense Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/expenses` | Add expense |
| `GET` | `/api/expenses?messId=&yearMonth=` | List expenses for month |
| `GET` | `/api/expenses/meal-rate?messId=&yearMonth=` | Live meal rate |

**Add Expense Request:**
```json
{
  "messId": "uuid",
  "memberId": "uuid",
  "amount": 850.00,
  "category": "PROTEIN",
  "description": "Rui fish from Karwan Bazar",
  "date": "2026-03-02"
}
```

**Response (includes live meal rate):**
```json
{
  "id": "uuid",
  "amount": 850.00,
  "category": "PROTEIN",
  "description": "Rui fish from Karwan Bazar",
  "date": "2026-03-02",
  "liveMealRate": 87.50
}
```

### Admin — Matrix & Month Close

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/admin/matrix?messId=&yearMonth=` | Full month grid |
| `POST` | `/api/admin/close-month` | Freeze, calculate, snapshot, rollover |

**Matrix Response Structure:**
```json
{
  "messName": "Bashundhara Mess",
  "yearMonth": "2026-03",
  "mealRate": 87.50,
  "totalExpense": 45000.00,
  "totalMeals": 514,
  "members": [
    {
      "memberId": "uuid",
      "memberName": "Sourav",
      "days": [
        {
          "date": "2026-03-01",
          "breakfast": true,
          "lunch": true,
          "dinner": false,
          "guestCount": 0,
          "totalMeals": 2
        }
      ],
      "totalMeals": 62,
      "totalAmount": 5425.00,
      "balance": 575.00
    }
  ]
}
```

**Close Month Request:**
```json
{
  "messId": "uuid",
  "adminId": "uuid",
  "yearMonth": "2026-02"
}
```

### Cook's Dashboard

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cook/headcount?messId=` | Today's headcount |

**Response:**
```json
{
  "messName": "Bashundhara Mess",
  "date": "2026-03-02",
  "memberCount": 14,
  "guestCount": 2,
  "totalHeadcount": 16,
  "source": "database"
}
```

---

## 9. Data Models & TypeScript Types

### Core Types

```typescript
// === Enums ===

enum Role {
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER'
}

enum MealSlot {
  BREAKFAST = 'BREAKFAST',
  LUNCH = 'LUNCH',
  DINNER = 'DINNER'
}

enum ExpenseCategory {
  PROTEIN = 'PROTEIN',
  CARB = 'CARB',
  VEGETABLE = 'VEGETABLE',
  SPICE = 'SPICE',
  OIL = 'OIL',
  UTILITY = 'UTILITY',
  OTHER = 'OTHER'
}

enum MonthStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED'
}

// === Entities ===

interface Mess {
  id: string;
  name: string;
  cutOffTime: string;        // "21:00" (HH:mm)
  createdAt: string;         // ISO 8601
}

interface Member {
  id: string;
  messId: string;
  name: string;
  phone?: string;
  telegramUserId?: string;
  role: Role;
  balance: number;           // BigDecimal → number
}

interface DailyLog {
  id: string;
  memberId: string;
  date: string;              // "2026-03-15"
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  guestCount: number;
  frozen: boolean;
}

interface Expense {
  id: string;
  messId: string;
  memberId: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  date: string;
  createdAt: string;
}

interface MonthlySnapshot {
  id: string;
  messId: string;
  yearMonth: string;         // "2026-03"
  totalExpense: number;
  mealRate: number;
  totalMeals: number;
  status: MonthStatus;
  closedAt?: string;
}

interface AuditTrail {
  id: string;
  adminId: string;
  entityType: string;
  entityId: string;
  oldValue: string;          // JSON string
  newValue: string;          // JSON string
  reason: string;
  createdAt: string;
}

// === Auth ===

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  messId: string;
  messName: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// === API Responses ===

interface HeadcountResponse {
  messName: string;
  date: string;
  memberCount: number;
  guestCount: number;
  totalHeadcount: number;
  source: 'firebase' | 'database';
}

interface ExpenseResponse {
  id: string;
  amount: number;
  category: ExpenseCategory;
  description: string;
  date: string;
  liveMealRate: number;
}

interface MonthMatrixResponse {
  messName: string;
  yearMonth: string;
  mealRate: number;
  totalExpense: number;
  totalMeals: number;
  members: MemberMatrixRow[];
}

interface MemberMatrixRow {
  memberId: string;
  memberName: string;
  days: DayEntry[];
  totalMeals: number;
  totalAmount: number;
  balance: number;
}

interface DayEntry {
  date: string;
  breakfast: boolean;
  lunch: boolean;
  dinner: boolean;
  guestCount: number;
  totalMeals: number;
}
```

---

## 10. Component Library

### Atomic Design Structure

```
components/
├── ui/                    ← Primitive/Atom components
│   ├── Button/
│   │   ├── Button.tsx
│   │   └── Button.module.css
│   ├── Input/
│   ├── Select/
│   ├── Toggle/            ← Meal ON/OFF toggle (core interaction)
│   ├── Badge/
│   ├── Card/
│   ├── Modal/
│   ├── Skeleton/          ← Loading skeletons
│   ├── Avatar/
│   └── Tooltip/
│
├── composed/              ← Molecule/Organism components
│   ├── Sidebar/
│   ├── TopBar/
│   ├── MealCard/          ← Single meal slot card with toggle
│   ├── ExpenseForm/
│   ├── ExpenseRow/
│   ├── HeadcountDisplay/  ← Big number display for cook
│   ├── MatrixTable/       ← Excel-style grid
│   ├── MemberRow/
│   ├── StatCard/          ← Dashboard stat card with icon + trend
│   ├── BalanceCard/
│   ├── AuditRow/
│   └── LocaleSwitcher/
│
└── providers/             ← Context providers
    ├── AuthProvider.tsx
    ├── ThemeProvider.tsx
    └── LocaleProvider.tsx
```

### Key Component Behaviors

#### MealToggle
- Large, thumb-friendly toggle (minimum 48px touch target)
- Animated slide with color change (green ON, gray OFF)
- Disabled state when past cut-off time with countdown
- Optimistic UI update with rollback on error

#### HeadcountDisplay (Cook's View)
- Dominant large number (96px+ font size)
- Animated count-up on load
- Auto-refresh every 30 seconds
- Pulse animation when data is stale

#### MatrixTable (Admin View)
- Virtual scrolling for 30+ members × 31 days
- Sticky first column (member name) and header row
- Color-coded cells: green (meal ON), gray (OFF), blue (guest)
- Inline edit capability with audit trail
- Export to CSV button

---

## 11. State Management

### Strategy: Server-First with React Server Components

- **Server Components** (default): Pages that fetch data at request time
- **Client Components** (`'use client'`): Interactive elements (toggles, forms, modals)
- **No global state library** — use React Context for auth + theme only
- **SWR pattern** for client-side data fetching with `useSWR` or similar
- **Optimistic updates** for meal toggles and expense additions

### Data Fetching Pattern

```typescript
// Server Component — page-level data fetching
async function MealsPage() {
  const meals = await fetchMeals();  // Server-side fetch
  return <MealsList initialData={meals} />;
}

// Client Component — interactive with optimistic updates
'use client';
function MealsList({ initialData }) {
  const [meals, setMeals] = useState(initialData);

  async function toggleMeal(slot: MealSlot) {
    // 1. Optimistic update
    setMeals(prev => ({ ...prev, [slot]: !prev[slot] }));

    // 2. API call
    try {
      await fetch('/api/proxy/meals/toggle', { method: 'PUT', body: ... });
    } catch {
      // 3. Rollback on failure
      setMeals(initialData);
      toast.error('Failed to update meal');
    }
  }
}
```

---

## 12. Project Structure

```
mealio-frontend/
├── .agents/
│   └── context.md              ← THIS FILE
│
├── app/
│   ├── [locale]/               ← i18n dynamic segment
│   │   ├── layout.tsx
│   │   ├── page.tsx            ← Landing
│   │   ├── login/
│   │   ├── register/
│   │   └── (dashboard)/
│   │       ├── layout.tsx      ← Auth guard + sidebar
│   │       ├── overview/
│   │       ├── meals/
│   │       ├── expenses/
│   │       ├── headcount/
│   │       ├── matrix/
│   │       ├── members/
│   │       ├── audit/
│   │       └── settings/
│   ├── api/
│   │   ├── auth/
│   │   └── proxy/
│   └── globals.css
│
├── components/
│   ├── ui/
│   ├── composed/
│   └── providers/
│
├── lib/
│   ├── api.ts                  ← API client utility
│   ├── auth.ts                 ← JWT helpers
│   ├── constants.ts            ← App constants
│   ├── utils.ts                ← General utilities
│   └── validations.ts          ← Zod schemas
│
├── types/
│   ├── index.ts                ← All TypeScript types
│   ├── api.ts                  ← API request/response types
│   └── enums.ts                ← Enum definitions
│
├── hooks/
│   ├── useAuth.ts
│   ├── useMeals.ts
│   ├── useExpenses.ts
│   └── useHeadcount.ts
│
├── messages/
│   ├── en.json                 ← English translations
│   └── bn.json                 ← Bangla translations
│
├── public/
│   ├── icons/
│   └── images/
│
├── middleware.ts               ← Auth guard + locale redirect
├── i18n.ts                     ← next-intl config
├── next.config.ts
├── tsconfig.json
├── package.json
└── .env.local                  ← Local env vars (gitignored)
```

---

## 13. Coding Conventions

### File Naming

- **Components**: PascalCase directories and files (`Button/Button.tsx`)
- **Hooks**: camelCase with `use` prefix (`useAuth.ts`)
- **Utils/Lib**: camelCase (`api.ts`, `utils.ts`)
- **CSS Modules**: Same name as component (`Button.module.css`)
- **Pages**: `page.tsx` (Next.js App Router convention)
- **Layouts**: `layout.tsx`

### TypeScript Rules

- **No `any`** — use `unknown` and narrow with type guards
- **No `enum` in runtime** — use `as const` objects or string unions
- **Export types** from `types/` directory, not from component files
- **Prefer interfaces** over types for object shapes
- **Use `satisfies`** for type-safe constant objects

### Component Rules

- **One component per file** (except small internal helpers)
- **Props interface** named `{ComponentName}Props`
- **Default export** for page components, **named export** for reusable components
- **CSS Module** import aliased as `styles`
- **No inline styles** except for truly dynamic values (e.g., `style={{ width: `${percent}%` }}`)

### CSS Module Convention

```css
/* Button.module.css */
.root { }           /* Root element */
.primary { }        /* Variant */
.secondary { }
.outlined { }
.small { }           /* Size */
.medium { }
.large { }
.disabled { }        /* State */
.loading { }
```

### Import Order

```typescript
// 1. React/Next.js
import { useState } from 'react';
import Link from 'next/link';

// 2. Third-party libraries
import { useTranslations } from 'next-intl';
import { z } from 'zod';

// 3. Internal components
import { Button } from '@/components/ui/Button/Button';

// 4. Hooks
import { useAuth } from '@/hooks/useAuth';

// 5. Types
import type { Expense } from '@/types';

// 6. Utils/Lib
import { formatCurrency } from '@/lib/utils';

// 7. Styles
import styles from './ExpenseForm.module.css';
```

### API Call Convention

All API calls go through the BFF proxy. Never call the Spring Boot backend directly from the client.

```typescript
// ✅ Correct — through BFF proxy
const res = await fetch('/api/proxy/expenses?messId=xxx&yearMonth=2026-03');

// ❌ Wrong — direct backend call (exposes JWT, CORS issues)
const res = await fetch('http://localhost:8080/api/expenses?messId=xxx');
```

---

## 14. Environment Variables

### Client-Side (prefixed with `NEXT_PUBLIC_`)

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | ✅ | Frontend URL (e.g., `http://localhost:3000`) |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | ❌ | Default locale (`en` or `bn`), defaults to `en` |

### Server-Side Only

| Variable | Required | Description |
|---|---|---|
| `API_BASE_URL` | ✅ | Spring Boot backend URL (e.g., `http://localhost:8080`) |
| `JWT_SECRET` | ✅ | Shared secret for JWT verification (if needed by BFF) |
| `NODE_ENV` | ❌ | `development` / `production` |

### `.env.local` Template

```env
# Frontend
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEFAULT_LOCALE=en

# Backend
API_BASE_URL=http://localhost:8080

# Auth
JWT_SECRET=your-jwt-secret-here
```

---

## 15. User Roles & Permissions

### Permission Matrix

| Feature | ADMIN | MANAGER | MEMBER |
|---|---|---|---|
| View own meals | ✅ | ✅ | ✅ |
| Toggle own meals | ✅ | ✅ | ✅ |
| Add guests | ✅ | ✅ | ✅ |
| View own balance | ✅ | ✅ | ✅ |
| View headcount | ✅ | ✅ | ✅ |
| Add expenses | ✅ | ✅ | ❌ |
| View all expenses | ✅ | ✅ | ❌ |
| View expense analytics | ✅ | ✅ | ❌ |
| View month matrix | ✅ | ❌ | ❌ |
| Edit member meals (override) | ✅ | ❌ | ❌ |
| Close month | ✅ | ❌ | ❌ |
| Manage members | ✅ | ❌ | ❌ |
| View audit trail | ✅ | ❌ | ❌ |
| Manage mess settings | ✅ | ❌ | ❌ |

### Sidebar Navigation by Role

**ADMIN sees:**
- Overview, My Meals, Expenses, Headcount, Month Matrix, Members, Audit Trail, Settings

**MANAGER sees:**
- Overview, My Meals, Expenses, Headcount

**MEMBER sees:**
- Overview, My Meals, Headcount

---

## Appendix: Key UX Decisions

### Mobile-First Design
- All pages must be fully functional on 360px width
- Touch targets minimum 44px × 44px
- Bottom navigation on mobile (replacing sidebar)
- Swipe gestures for meal toggle cards

### Meal Toggle UX (Core Interaction)
- **Default state**: All meals ON (members opt-out, not opt-in)
- **Cut-off enforcement**: Visual countdown timer + disabled state post cut-off
- **Optimistic updates**: Toggle responds instantly, API call in background
- **Error recovery**: Auto-rollback with toast notification on failure

### Cook's Dashboard UX
- **Auto-refresh**: Poll every 30 seconds
- **Dominant typography**: Headcount number in 96px+ font
- **Minimal UI**: Only essential info — no sidebar, no navigation clutter
- **Offline indicator**: Clear visual when data may be stale

### Month Matrix UX (Excel-Killer)
- **Virtual scrolling**: Handle 30 members × 31 days without jank
- **Sticky headers**: Both row (member name) and column (date)
- **Cell editing**: Click cell → toggle meal → audit reason modal
- **Export**: CSV download with one click
- **Summary row**: Totals at bottom, auto-calculated

### Dark Mode
- System preference detection with manual override
- Smooth transition (no flash on page load)
- All components must support both themes via CSS custom properties

---

> **Last Updated:** 2026-03-15
> **Maintained by:** Mealio Frontend Team
