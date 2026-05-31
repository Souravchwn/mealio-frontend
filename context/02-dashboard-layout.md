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

**Note:** MANAGER sees Settings nav in the page (isAdmin check in settings page) but Settings is NOT in their nav. MANAGER can only reach Settings by direct URL.

### Active detection
```typescript
const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/")
```

### topbarRight order (left to right)
1. `MessSwitcher` — dropdown to switch between messes (Admin: always shown; others: only if 2+ messes)
2. `ThemeToggle` — light/dark
3. Bell icon — notifications (placeholder, no functionality)

### Bottom nav (mobile)
Shows first 5 items from `filteredMain`. Icon + label.

---

## `MessSwitcher.tsx`

### Visibility rule
```typescript
if (user?.role !== "ADMIN" && messes.length < 2) return null
```
So: ADMIN always sees it (even with 1 mess — to create new ones). Others see it only if they belong to 2+ messes.

### Data loading
On mount, calls `api.mess.list(token)` → sets local `messes` state. No global state used.

### Switching a mess
```typescript
async function handleSwitch(messId: string) {
  const res = await api.mess.switchMess(messId, token)
  login({ ...user, messId: res.mess.id, messName: res.mess.name }, res.accessToken)
  router.refresh()
  window.location.reload()
}
```
The full page reload is intentional — it ensures all components re-initialize with the new mess context.

### "Create New" option
Shown only to `ADMIN`. Navigates to `/{locale}/mess/create`.

### Dropdown items
Each mess renders with a colored dot (active) or empty dot (inactive). Active mess button is `disabled`.

### Close on outside click
Uses `useRef` + `document.addEventListener("mousedown", ...)` pattern. Cleanup on unmount.

---

## CSS Variables Used (from `globals.css`)

| Variable | Usage |
|----------|-------|
| `--sidebar-width` | Sidebar fixed width |
| `--topbar-height` | Topbar height |
| `--color-bg-sidebar` | Sidebar background (dark) |
| `--color-bg-sidebar-hover` | Nav item hover |
| `--color-primary` | Active nav indicator + dots |
| `--z-fixed` | Sidebar z-index |
| `--z-sticky` | Topbar z-index |
| `--z-dropdown` | MessSwitcher dropdown |

---

## Responsive Behavior

| Breakpoint | Behavior |
|------------|----------|
| > 1024px | Sidebar fixed at left; `.main` has `margin-left: var(--sidebar-width)` |
| ≤ 1024px | Sidebar hidden (`translateX(-100%)`), hamburger button shown; `.bottomNav` appears |
| ≤ 640px | Content padding reduced; topbar height 56px; page title font smaller |

---

## i18n Keys

`nav.*` namespace:
- `overview`, `meals`, `mealHistory`, `expenses`, `expenseAnalytics`, `headcount`, `mySummary`, `matrix`, `members`, `audit`, `settings`, `logout`, `profile`

`messSwitcher.*`:
- `label` ("Switch Mess"), `switching` ("Switching..."), `createNew` ("Create New Mess")

---

## Adding a New Nav Item

1. Add to `mainNav` or `adminNav` array with `{ key, href, icon, roles }`
2. Add `nav.yourKey` to `messages/en.json` and `messages/bn.json`
3. Add corresponding `key` to `useTranslations("nav")` — already covers any key under `nav.*`
4. Create the page at `src/app/[locale]/(dashboard)/your-route/page.tsx`

---

## Adding a New Composed Component

Follow the `ThemeToggle` pattern:
```
src/components/composed/YourComponent/
  YourComponent.tsx         ← "use client"
  YourComponent.module.css
```
Import and place in `layout.tsx` topbar or sidebar as needed.
