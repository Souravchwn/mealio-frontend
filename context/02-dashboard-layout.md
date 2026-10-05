# Module 02 — Dashboard Layout & Navigation

## What This Module Does

Wraps every `/{locale}/(dashboard)/*` page with a persistent sidebar (desktop), topbar, mobile bottom nav, and an auth guard. Also houses the `MessSwitcher` and `ThemeToggle` composed components.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/layout.tsx` | Layout (client) | Sidebar + topbar + bottom nav + auth guard |
| `src/app/[locale]/(dashboard)/dashboard.module.css` | CSS | All layout styles |
| `src/components/composed/MessSwitcher/MessSwitcher.tsx` | Component (client) | Multi-mess dropdown in topbar |
| `src/components/composed/MessSwitcher/MessSwitcher.module.css` | CSS | Switcher styles |
| `src/components/composed/ThemeToggle/ThemeToggle.tsx` | Component (client) | Light/dark mode button |
| `src/components/composed/ThemeToggle/ThemeToggle.module.css` | CSS | Toggle button styles |
| `src/components/composed/LocaleSwitcher/LocaleSwitcher.tsx` | Component (client) | EN/BN language switcher |

---

## `layout.tsx` — Key Logic

### State
```typescript
const [sidebarOpen, setSidebarOpen] = useState(false)  // mobile drawer state
```

### Auth guard
```typescript
useEffect(() => {
  if (!isLoading && !isAuthenticated) router.push(`/${locale}/login`)
}, [isAuthenticated, isLoading])
```
Shows a loading logo (`styles.loadingScreen`) while `isLoading` is true.

### Nav items

**mainNav** — visible to ADMIN + MANAGER + MEMBER:
```
Overview   → /{locale}/overview
Meals      → /{locale}/meals
Expenses   → /{locale}/expenses      (ADMIN + MANAGER only)
Headcount  → /{locale}/headcount
My Summary → /{locale}/my-summary
```

**adminNav** — visible to ADMIN only:
```
Matrix     → /{locale}/matrix
Members    → /{locale}/members
Audit      → /{locale}/audit
Settings   → /{locale}/settings
```

### Active detection
```typescript
const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
```

### topbarRight order (left to right)
1. `MessSwitcher` — dropdown to switch between messes
2. `ThemeToggle` — light/dark
3. Bell icon (`.iconBtn`) — notifications placeholder

### Logout button
Uses `.logoutBtn` class (no inline styles). Hover turns red (`var(--color-danger)`).

### Bottom nav (mobile)
Shows first 5 items from `filteredMain`. Active state shows a small dot indicator below the icon via `::after`.

---

## Design System — Layout Shell

### Sidebar
- Background: `var(--color-bg-sidebar)` = `#0f0a2e` (dark navy). Dark in both modes.
- Active nav item: `rgba(99,102,241,0.15)` background + 3px left bar (`var(--color-primary)`) + icon glow.
- Active icon: `color: var(--color-primary)` + `filter: drop-shadow` glow.

### Topbar
- Background: `var(--color-bg)` (page background — **not** card white, **no** blur/glass).
- Border: `1px solid var(--color-border)` at bottom.
- **No `backdrop-filter`** — the earlier frosted-glass approach used an undefined `--color-bg-card-rgb` variable (fell back to hardcoded white `255 255 255`). Fixed to use plain `var(--color-bg)`.
- Topbar is intentionally a different color from the sidebar — it belongs to the content area, not the nav shell. The visual separation is correct UX.

### Content area
- `max-width: 1200px`, centered, `padding: var(--space-6)`.

---

## CSS Class Reference

| Class | Purpose |
|-------|---------|
| `.sidebar` | Fixed left nav panel |
| `.sidebarOpen` | Mobile: slide in |
| `.navItem` | Nav link base |
| `.navItemActive` | Active link (indigo bg + left bar) |
| `.navItemIcon` | Icon wrapper (active gets primary color + glow) |
| `.navLabel` | Section label ("Menu" / "Admin") |
| `.logoutBtn` | Logout icon button (red on hover) |
| `.topbar` | Sticky page header |
| `.pageTitle` | Current page name in topbar |
| `.iconBtn` | Generic topbar icon button (Bell, etc.) |
| `.menuButton` | Hamburger (hidden on desktop, shown ≤1024px) |
| `.bottomNav` | Mobile bottom nav container |
| `.bottomNavItem` | Bottom nav link |
| `.bottomNavItemActive` | Active bottom item (primary color + dot) |
| `.content` | Page content wrapper |
| `.overlay` | Mobile sidebar backdrop |

---

## CSS Variables Used

| Variable | Usage |
|----------|-------|
| `--sidebar-width` | Sidebar fixed width (260px) |
| `--topbar-height` | Topbar height (64px) |
| `--color-bg-sidebar` | Sidebar background (dark) |
| `--color-bg` | Topbar + page background |
| `--color-primary` | Active nav indicator, dots, glow |
| `--color-danger` | Logout button hover |
| `--z-fixed` | Sidebar z-index |
| `--z-sticky` | Topbar z-index |

---

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| > 1024px | Sidebar fixed left; `.main` has `margin-left: var(--sidebar-width)` |
| ≤ 1024px | Sidebar hidden (`translateX(-100%)`), hamburger shown; `.bottomNav` appears |
| ≤ 640px | Content padding `var(--space-4)`; topbar height 56px; page title `text-sm` |

---

## MessSwitcher

### Visibility rule
```typescript
if (user?.role !== "ADMIN" && messes.length < 2) return null
```
ADMIN always sees it. Others see it only if they belong to 2+ messes.

### Switching
```typescript
const res = await api.mess.switchMess(messId, token)
login({ ...user, messId: res.mess.id, messName: res.mess.name }, res.accessToken)
router.refresh()
window.location.reload()  // intentional — ensures all components re-init
```

---

## i18n Keys

`nav.*`: `overview`, `meals`, `mealHistory`, `expenses`, `headcount`, `mySummary`, `matrix`, `members`, `audit`, `settings`, `logout`, `profile`

`messSwitcher.*`: `label`, `switching`

---

## Adding a New Nav Item

1. Add to `mainNav` or `adminNav` with `{ key, href, icon, roles }`
2. Add `nav.yourKey` to `messages/en.json` and `messages/bn.json`
3. Create the page at `src/app/[locale]/(dashboard)/your-route/page.tsx`
