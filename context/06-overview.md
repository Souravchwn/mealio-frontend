# Module 06 — Overview Dashboard

## What This Module Does

The landing page after login. Shows a personalized greeting + stat cards (meal rate, balance, headcount, expenses) + today's meal status + quick action buttons + recent expenses. Accessible to all roles.

---

## Files

| File | Type | Purpose |
|------|------|---------|
| `src/app/[locale]/(dashboard)/overview/page.tsx` | Page (client) | Dashboard summary |
| `src/app/[locale]/(dashboard)/overview/overview.module.css` | CSS | Overview styles |

---

## Data Loading

All API calls are fired in **parallel** using `Promise.allSettled` on mount. Individual failures don't break the page — cards just show `—` or `0`.

```typescript
const [rateRes, expensesRes, headcountRes, todayMealsRes, summaryRes] = await Promise.allSettled([
  api.expenses.getMealRate(user.messId, yearMonth, token),
  api.expenses.getExpenses(user.messId, yearMonth, token),
  api.cook.getHeadcount(user.messId, token),
  api.meals.getToday(user.id, token),
  api.members.me(token, yearMonth),
])
```

---

## Sections

### 1. Greeting
```typescript
getTimeOfDay() → 'morning' | 'afternoon' | 'evening'
// Used in t("overview.greeting", { timeOfDay: t(`overview.${getTimeOfDay()}`), name: user.name })
```

### 2. Stats Grid (4 cards)
| Card | Data Source | Notes |
|------|-------------|-------|
| Meal Rate | `api.expenses.getMealRate()` | `৳ X.XX per meal` |
| Your Balance | `api.members.me()` | Positive = overpaid (green), negative = owes (red) |
| Month Expense | `api.expenses.getExpenses()` → sum | Total for current month |
| Headcount | `api.cook.getHeadcount()` | Today's lunch count |

### 3. Today's Meals
Shows `breakfast/lunch/dinner` from `api.meals.getToday()`. Read-only preview — not toggleable from here. Links to `/meals` for toggling.

### 4. Quick Actions
Buttons linking to: `/meals`, `/expenses`, `/matrix`, `/headcount`. Each filtered by role (MEMBER doesn't see expenses).

### 5. Recent Expenses
Last 5 expenses from `api.expenses.getExpenses()`. Shows category color dot + amount + description + date.

---

## `src/lib/utils.ts` — Functions Used

```typescript
getTimeOfDay()          → 'morning' | 'afternoon' | 'evening'  (based on local hour)
formatCurrency(amount)  → '৳ 1,234.56'
getCategoryColor(cat)   → hex color string for the dot indicator
getCurrentYearMonth()   → 'YYYY-MM' for current month
```

---

## i18n Keys

`overview.*`: `greeting`, `morning`, `afternoon`, `evening`, `todayMeals`, `mealRate`, `yourBalance`, `totalMembers`, `monthExpense`, `totalMeals`, `headcountToday`, `recentExpenses`, `quickActions`, `toggleMeals`, `addExpense`, `viewMatrix`, `viewHeadcount`

---

## Common Pitfalls

1. **No write operations** — the overview is 100% read-only. Don't add toggles or forms here.
2. **`Promise.allSettled`** means partial failures are expected. Always check `result.status === 'fulfilled'` before reading `.value`.
3. **yearMonth** is computed client-side with `getCurrentYearMonth()`. Since it uses `new Date()`, it reflects the client's local time — could differ from the mess timezone for month boundaries.
