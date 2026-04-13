# Mealio — Demo & Feature Verification Guide

This guide walks through every feature of Mealio for verification, testing, and demo purposes.

---

## Demo Credentials

Seed the database first (`npm run seed`), then use:

| Role | Email | Password | What they can do |
|---|---|---|---|
| **Admin** | `admin@demo.com` | `admin123` | Everything — matrix, members, audit, settings, close month |
| **Manager** | `manager@demo.com` | `manager123` | Expenses, headcount, meal toggles, no-cook commands |
| **Member** | `member@demo.com` | `member123` | Own meals, guest count, personal summary |

---

## Feature Verification Checklist

### A. Authentication

- [ ] Login with each role — verify redirect to dashboard
- [ ] Register a new account using the mess invite code (visible in Settings)
- [ ] JWT persists across page reload (stored in localStorage)
- [ ] Logout clears auth state and redirects to login

---

### B. Default-Driven Meal Preferences (Settings Page)

This is the core of the system. Every user has personal defaults that drive their daily logs.

1. Login as **Member** → go to **Settings**
2. Verify the **My Default Meal Preferences** card is visible
3. Six toggle buttons appear: Breakfast / Lunch / Dinner × Weekday / Weekend
4. Toggle **Dinner → OFF** for Weekdays
   - Button turns grey and shows "OFF"
   - Toast: "Preferences saved"
5. Navigate to **My Meals** page
   - Dinner should immediately show as OFF (today's log was synced)
6. Toggle Dinner back ON in Settings
   - Meals page should reflect ON again
7. **Verify:** Preferences are per-user — logging in as Admin shows independent toggles

---

### C. My Meals Page

1. Login → go to **My Meals**
2. Today's log loads showing breakfast / lunch / dinner toggles
3. **Toggle a meal** (e.g. click Lunch card):
   - Toggle animates ON → OFF
   - No page reload needed
4. **Cutoff indicator** — shows time remaining or "Cut-off passed"
5. **Guest count** — use + / − buttons; verify count updates
6. After cutoff passes, all toggles become disabled
7. **All ON / All OFF** bulk buttons work before cutoff

---

### D. Overview Dashboard

1. Login as Admin → **Overview**
2. Verify stat cards: Meal Rate, Your Balance, Month Expense, Headcount
3. Today's Meals summary panel reflects current log values
4. Recent expenses list shows last few entries
5. Quick action buttons navigate to correct pages

---

### E. Expenses (Manager / Admin)

1. Login as Manager → **Expenses**
2. Add an expense: amount, category (Protein/Carb/etc.), description, date
3. Expense appears in the list with correct values
4. **Meal Rate** card updates in real-time based on total expenses
5. Edit an expense → amount changes → meal rate recalculates
6. Delete an expense → removed from list

---

### F. Headcount (Cook Dashboard)

1. Login as any role → **Headcount**
2. Shows today's counts: Members eating, Guests, Total
3. Breakdown per meal (Breakfast / Lunch / Dinner)
4. Toggle a meal on another account → headcount updates on refresh

---

### G. Monthly Matrix (Admin)

1. Login as Admin → **Matrix**
2. Full grid: members as rows, days as columns
3. Each cell shows meal status (B/L/D) with colour coding
4. Summary row: total meals per member, meal cost, balance
5. **Export CSV** downloads the matrix
6. **Close Month** button (requires confirmation):
   - Freezes all logs for that month
   - Computes balances in the ledger
   - Month shows as "CLOSED" — no further edits allowed

---

### H. Members Page (Admin)

1. Login as Admin → **Members**
2. List of all members with role, balance, Telegram link status
3. Edit a member: change role, activate/deactivate, set guest dates
4. Invite code displayed for sharing

---

### I. Audit Trail (Admin)

1. Login as Admin → **Audit**
2. Chronological list of all actions (TOGGLE_MEAL, ADD_EXPENSE, CLOSE_MONTH, etc.)
3. Each entry shows actor, action, old value, new value, timestamp
4. Pagination works for large logs

---

### J. Settings Page (Admin / Manager)

1. Login as Admin → **Settings**
2. **Personal Meal Preferences** card visible to all users (see section B)
3. **Mess Settings** section only visible to Admin/Manager:
   - Edit mess name → save → verify change persists
   - Lunch cutoff time (default 10:00) — controls `/meal on/off` targeting
   - Dinner cutoff time (default 21:00) — blocks toggles after this hour
   - Invite code copy button

---

### K. My Summary Page

1. Login as Member → **My Summary**
2. Shows: meal rate, meals eaten, contributed, meal cost, balance
3. Breakdown by slot (Breakfast / Lunch / Dinner count)
4. Telegram link status

---

## Telegram Bot Verification

See `TELEGRAM_SETUP.md` for full setup. Quick checks:

### Account Linking
```
/start                    → Welcome message
/link +880XXXXXXXXXX      → Sends OTP
/verify 123456            → Account linked confirmation
```

### Default-Driven Meal Commands
```
/status                   → Shows today's B/L/D from daily log
/meal off                 → Targets LUNCH (if before 10:00) or DINNER (10:00–21:00)
/meal on                  → Same time-based targeting, enables the slot
/meal breakfast           → Explicit toggle for breakfast slot
/meal lunch               → Explicit toggle for lunch slot
/meal dinner              → Explicit toggle for dinner slot
/meal guest 2             → Sets guest count to 2
```

### Admin Commands
```
/nomeal                   → All meals OFF for today, members notified
/nomeal tomorrow          → Same for tomorrow
/nomeal Cook is sick      → With reason in broadcast
/mealon                   → Restores each member to THEIR OWN preferences (not all-ON)
/mealon tomorrow          → Same for tomorrow
/announce <msg>           → Broadcast to all linked members
/rate                     → Current meal rate (৳/meal)
/balance                  → My contributed vs consumed balance
```

---

## i18n Verification

1. Click language switcher (top-right) → switch to Bengali (বাংলা)
2. All page titles, labels, and buttons render in Bengali
3. Switch back to English
4. Language preference persists across page navigation

---

## Theme Verification

1. Click theme toggle (top-right) → switch to Dark mode
2. All pages render correctly in dark theme
3. Switch back to Light mode
4. Theme preference persists across page reload

---

## Cron Job Verification (staging/production)

| Endpoint | Schedule | What to verify |
|---|---|---|
| `/api/cron/generate-daily-meals` | 00:05 daily | New `daily_logs` rows created from preferences for each member |
| `/api/cron/deactivate-guests` | 00:00 daily | Guest members past `guest_until` date become inactive |
| `/api/cron/cutoff-warning` | Hourly | Telegram reminder message sent before cutoff |
| `/api/cron/month-end-reminder` | 20:00 on days 28–31 | Admin receives month-close reminder |

Trigger manually for verification:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" \
  https://your-app.vercel.app/api/cron/generate-daily-meals
```

Expected response:
```json
{
  "ok": true,
  "messesProcessed": 1,
  "logsCreated": 8,
  "logsSkipped": 4
}
```

---

## Known Constraints

- **Cutoff enforcement** — after the dinner cutoff time, meal toggles are blocked (both web and Telegram). Admins can override via `/nomeal` / `/mealon` at any time.
- **Frozen months** — closing a month freezes all its `daily_logs`. No further edits are possible.
- **Preference sync** — changing a preference on the Settings page immediately updates today's log (if the log exists and isn't frozen). Future days are handled by the nightly cron.
- **Timezone** — all time-based decisions (cutoff, day type, cron) use the mess's Telegram group timezone. Default: `Asia/Dhaka`.
- **Guest members** — guests are auto-deactivated after their `guest_until` date by the daily cron.
