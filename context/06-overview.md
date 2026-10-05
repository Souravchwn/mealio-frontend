# Module 06 — Overview Dashboard

## What This Module Does

The first page after login. Shows a personalized greeting + stat cards (meal rate, balance, headcount, expenses) + today's meal status + quick actions + recent expenses. Read-only — no write operations on this page.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/overview/page.tsx` | Page (client) | Dashboard summary |
| `src/app/[locale]/(dashboard)/overview/overview.module.css` | CSS | Overview styles |

---

## Data Loading

All API calls fired in **parallel** with `Promise.allSettled`. Individual failures show skeleton/fallback — they don't break other sections.

```typescript
Promise.allSettled([
  api.expenses.getMealRate(user.messId, yearMonth, token),
  api.expenses.getExpenses(user.messId, yearMonth, token),
  api.cook.getHeadcount(user.messId, token),
  api.meals.getToday(user.id, token),
  api.members.me(token, yearMonth),
])
```

`yearMonth` comes from `getCurrentYearMonth()` (client local time).

---

## Sections

### 1. Greeting
```typescript
const greeting = t("overview.greeting", { timeOfDay: t(timeOfDay), name: firstName })
// Also shows: "Monday, 14 Apr 2026 · Mess Name" in .greetingMeta
```
`getTimeOfDay()` → `'morning' | 'afternoon' | 'evening'`.

### 2. Stats Grid (4 cards, 2×2 on tablet/mobile)

| Card | Source | Notes |
|------|--------|-------|
| Meal Rate | `getMealRate()` | `৳ X.XX` |
| Your Balance | `members.me()` | **Green if ≥ 0 (overpaid), red if < 0 (owes)**. Icon and top-accent line also change. |
| Month Expense | `getExpenses()` → sum | Total BDT for current month |
| Headcount | `getHeadcount()` | Today's lunch count |

Loading state shows a shimmer skeleton (`statValueSkeleton`) instead of `—`.

### 3. Today's Meals (read-only preview)
Three slots: breakfast / lunch / dinner. Uses i18n labels from `meals.*` namespace.
Active slot: green border + green tint background. Inactive: muted border.
"Manage" link → `/{locale}/meals`.

### 4. Quick Actions (role-filtered)
| Action | Visible to |
|--------|-----------|
| Toggle Meals | All |
| Add Expense | ADMIN + MANAGER |
| View Matrix | ADMIN only |
| View Headcount | All |

### 5. Recent Expenses
Last 5 from `getExpenses()`. Category dot + description + amount. Separated by border lines.
"View all" link only shown to ADMIN + MANAGER.
Empty state: centered muted text.

---

## CSS Architecture

### Stat cards
- Flex column: label row (label + icon) on top, value below
- `statCardPrimary/Success/Danger/Accent/Info` → colored `::before` top-accent line (revealed on hover)
- Balance card classes determined dynamically: `stats.balance >= 0` → success, else danger
- `statValueSkeleton` = gradient shimmer animation while loading

### Layout
- `.statsGrid` = 4-column on desktop, 2-column ≤1100px, 2-column on mobile
- `.twoColumn` = `1fr 1.2fr` (left narrower) → stacks at ≤900px
- `.leftCol` = flex column containing Today's Meals + Quick Actions
- `.sectionCard` = white card with border — replaces `<Card>` component usage (consistent padding/radius)

### Quick actions
- Icon changes from primary-light bg → primary solid on hover
- Uses `var(--color-primary-rgb)` for focus ring box-shadow

---

## i18n Keys Used

- `overview.*`: `greeting`, `morning`, `afternoon`, `evening`, `todayMeals`, `mealRate`, `yourBalance`, `monthExpense`, `headcountToday`, `recentExpenses`, `quickActions`, `toggleMeals`, `addExpense`, `viewMatrix`, `viewHeadcount`
- `meals.*`: `breakfast`, `lunch`, `dinner`, `on`, `off`
- `common.*`: (none directly — uses inline strings for "Manage", "View all")

---

## Utilities Used

```typescript
getTimeOfDay()          → 'morning' | 'afternoon' | 'evening'
formatCurrency(amount)  → '৳ 1,234.56'
getCategoryColor(cat)   → hex string for expense dot
getCurrentYearMonth()   → 'YYYY-MM'
```

---

## Common Pitfalls

1. **No write operations** — overview is 100% read-only. Don't add toggles or forms.
2. **`Promise.allSettled`** — always check `result.status === "fulfilled"` before reading `.value`.
3. **Balance sign** — positive = member overpaid (green), negative = member owes (red). Don't reverse this.
4. **Inline styles removed** — no `style={{ marginTop: ... }}` or any inline styles. All layout via CSS modules.
5. **Meal labels use i18n** — `tm("breakfast")` from `useTranslations("meals")`, not JS `.charAt(0).toUpperCase()`.
6. **`animationDelay` on stat cards removed** — there is no animation on `.statCard`, so delay props were silently doing nothing. The page-level `fadeInUp` on `.page` handles the entry.
