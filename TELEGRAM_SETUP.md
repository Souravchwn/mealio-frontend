# Mealio Telegram Bot — Complete Setup Guide

## Table of Contents
1. [Create the Bot](#1-create-the-bot)
2. [Configure Environment Variables](#2-configure-environment-variables)
3. [Deploy & Register the Webhook](#3-deploy--register-the-webhook)
4. [Link Your Account](#4-link-your-account)
5. [All Commands Reference](#5-all-commands-reference)
6. [How the Default-Driven Meal System Works](#6-how-the-default-driven-meal-system-works)
7. [No-Meal / Meal-On System (Admin)](#7-no-meal--meal-on-system-admin)
8. [Broadcast Announcements](#8-broadcast-announcements)
9. [REST API (Dashboard Integration)](#9-rest-api-dashboard-integration)
10. [Local Development & Testing](#10-local-development--testing)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Create the Bot

1. Open Telegram and search for **@BotFather**
2. Send `/newbot`
3. Follow the prompts:
   - **Name** — e.g. `Mealio`
   - **Username** — must end in `bot`, e.g. `mealio_yourname_bot`
4. BotFather replies with your **bot token**:
   ```
   123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ
   ```

5. **Optional but recommended** — set bot commands so they appear in the menu.
   Send `/setcommands` to BotFather, select your bot, then paste:
   ```
   start - Welcome message & command list
   link - Link your Mealio account (/link +8801XXXXXXXXX)
   verify - Verify OTP after linking (/verify 123456)
   status - Today's meal status
   meal - Toggle meals (/meal on|off|breakfast|lunch|dinner|guest N)
   rate - Current meal rate for this month
   balance - Your balance for this month
   nomeal - [Admin] Turn off all meals & notify everyone
   mealon - [Admin] Restore meals to personal defaults & notify everyone
   announce - [Admin] Broadcast a message to all members
   ```

---

## 2. Configure Environment Variables

Edit `.env.local` and fill in:

```bash
TELEGRAM_BOT_TOKEN=123456789:ABCDefGhIJKlmNoPQRsTUVwxyZ

# Optional but strongly recommended — prevents spoofed webhook calls
TELEGRAM_WEBHOOK_SECRET=any-random-secret-string-here
```

Generate a webhook secret:
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
```

---

## 3. Deploy & Register the Webhook

The webhook URL must be **HTTPS** (Telegram does not call plain HTTP).

### On Vercel

```bash
# Deploy first
vercel --prod

# Then register the webhook
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://your-app.vercel.app/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Expected response:
```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

### Verify the webhook is active

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

Check `"url"` and `"pending_update_count"`. If `last_error_message` is set, there's a problem.

### Remove the webhook (if needed)

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/deleteWebhook"
```

---

## 4. Link Your Account

Every Mealio member who wants to use the bot must link once.

1. Find your bot on Telegram (search by its username)
2. Send `/start`
3. Send your phone number exactly as registered in Mealio:
   ```
   /link +8801712345678
   ```
4. You'll receive a 6-digit OTP. Send it back:
   ```
   /verify 123456
   ```
5. Confirmation message appears — you can now use all commands.

> The phone number must match what's stored in your Mealio member profile.

---

## 5. All Commands Reference

### Member Commands

| Command | Description |
|---|---|
| `/start` | Welcome message and full command list |
| `/link +880XXXXXXXXXX` | Link your Telegram to your Mealio account |
| `/verify 123456` | Verify OTP to complete account linking |
| `/status` | Show today's breakfast / lunch / dinner status |
| `/meal off` | Disable the **next upcoming meal** (time-based — see below) |
| `/meal on` | Enable the **next upcoming meal** (time-based — see below) |
| `/meal breakfast` | Toggle breakfast specifically |
| `/meal lunch` | Toggle lunch specifically |
| `/meal dinner` | Toggle dinner specifically |
| `/meal guest 2` | Set guest count to 2 for today |
| `/rate` | Current meal rate (৳/meal) for this month |
| `/balance` | Your contributed vs. consumed balance |

> `/meal on` and `/meal off` target a **single meal slot** based on the current time (see section 6).
> Use `/meal breakfast`, `/meal lunch`, `/meal dinner` to toggle a specific slot regardless of time.

---

### Admin / Manager Commands

| Command | Description |
|---|---|
| `/nomeal` | Turn off **all** meals for today and notify every member |
| `/nomeal tomorrow` | Same but for tomorrow |
| `/nomeal 2026-04-15` | Same for a specific date |
| `/nomeal Cook is sick` | Today + include a reason in the notification |
| `/nomeal tomorrow No bazar today` | Tomorrow + reason |
| `/mealon` | Restore meals for today to each member's **personal defaults** |
| `/mealon tomorrow` | Same but for tomorrow |
| `/mealon 2026-04-15` | Same for a specific date |
| `/announce <message>` | Broadcast a custom message to all Telegram-linked members |

> `/mealon` does **not** blindly set everyone to all-ON. It restores each member's own preferences (breakfast/lunch/dinner as configured in their Settings). A member who has dinner OFF by default will have dinner remain OFF after `/mealon`.

---

## 6. How the Default-Driven Meal System Works

Mealio is designed so members **never need to interact daily** unless their plans differ from their norm.

### Automatic daily log generation

Every night at **00:05**, a cron job reads each member's stored preferences and creates a `DailyLog` row for them. No action required from the member.

### Setting preferences

Members go to **Settings → My Default Meal Preferences** in the web dashboard and set:
- **Weekday defaults** (Mon–Fri): breakfast / lunch / dinner ON or OFF
- **Weekend defaults** (Sat–Sun): same three toggles

If no preferences are ever set, all meals default to ON.

### Using `/meal on` and `/meal off` as exceptions

These commands target the **next upcoming meal** based on the current time in your mess's timezone:

| Current time | `/meal off` targets | `/meal on` targets |
|---|---|---|
| Before lunch cutoff (default 10:00) | **Lunch** | **Lunch** |
| Between lunch and dinner cutoff (10:00–21:00) | **Dinner** | **Dinner** |
| After dinner cutoff (default 21:00) | ❌ Rejected | ❌ Rejected |

**Examples:**

```
08:30 → /meal off
🍱 Lunch turned OFF ❌

14:00 → /meal off
🌙 Dinner turned OFF ❌

22:00 → /meal off
⏰ Cut-off time (21:00) has passed. No more meals to toggle for today.
   Use /meal breakfast, /meal lunch, or /meal dinner to toggle a specific slot explicitly.
```

The cutoff times (lunch and dinner) are configurable by admins in Mess Settings.

### Why this design?

- **Members who always eat all meals** → never touch the bot at all
- **Members who skip lunch on weekdays** → set lunch=OFF for weekdays in preferences; done forever
- **Occasional skips** → send `/meal off` when needed (takes 2 seconds)
- **Cook** → always has accurate headcount without chasing people

---

## 7. No-Meal / Meal-On System (Admin)

This system handles days when the cook doesn't come or there's no grocery shopping.

### `/nomeal` — cancel all meals for a day

```
/nomeal
/nomeal Cook is sick today
/nomeal tomorrow No bazar, market is closed
/nomeal 2026-04-20 Public holiday
```

What happens:
1. All active members' `DailyLog` for that date is set to `breakfast=false, lunch=false, dinner=false`
2. Every Telegram-linked member receives a broadcast notification
3. Individual members can still override with `/meal on` or `/meal breakfast` etc.

Broadcast message example:
```
🚫 No Meals — 2026-04-15

All meals have been turned OFF for 2026-04-15.
📝 Reason: Cook is sick today

_You can still turn your own meals back on with /meal on if needed._
```

### `/mealon` — restore meals for a day

```
/mealon
/mealon tomorrow
/mealon 2026-04-20
```

What happens:
1. Each member's `DailyLog` is updated to match **their own personal preferences** for that day type
   - A member with dinner=OFF on weekdays: dinner stays OFF
   - A member with all meals ON: all three restored to ON
2. Every linked member receives a notification

Broadcast message example:
```
✅ Meals Restored — 2026-04-15

Meals have been restored to your personal defaults for 2026-04-15.

_Adjust individually: /meal breakfast /meal lunch /meal dinner_
```

### Important notes

- `/nomeal` and `/mealon` bypass the cutoff time — admins can run them at any hour
- Frozen months (already closed) cannot be modified
- Members who haven't linked Telegram won't receive notifications but their meals are still updated

---

## 8. Broadcast Announcements

Send a message to all Telegram-linked members without affecting meals.

```
/announce Bazar done! Dinner confirmed — special chicken tonight 🍗
/announce Monthly accounts close on April 30. Please verify your expense entries.
```

> Only ADMIN and MANAGER roles can use `/announce`.

---

## 9. REST API (Dashboard Integration)

The no-cook system is also available as a REST API for the web dashboard.

### `POST /api/admin/no-cook`

**Headers:**
```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

**Body:**
```json
{
  "action": "off",
  "date": "2026-04-12",
  "reason": "Cook is sick"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `action` | `"on"` \| `"off"` | Yes | `"off"` = nomeal, `"on"` = mealon |
| `date` | `YYYY-MM-DD` | No | Defaults to today |
| `reason` | `string` | No | Included in Telegram notifications |

**Response:**
```json
{
  "ok": true,
  "date": "2026-04-12",
  "action": "off",
  "members_updated": 12,
  "telegram_notified": 9
}
```

### `GET/PUT /api/members/meal-preferences`

**GET** — returns all 6 preference entries for the current user:
```json
{
  "preferences": [
    { "meal_type": "breakfast", "day_type": "WEEKDAY", "enabled": true },
    { "meal_type": "lunch",     "day_type": "WEEKDAY", "enabled": true },
    { "meal_type": "dinner",    "day_type": "WEEKDAY", "enabled": false },
    { "meal_type": "breakfast", "day_type": "WEEKEND", "enabled": true },
    { "meal_type": "lunch",     "day_type": "WEEKEND", "enabled": true },
    { "meal_type": "dinner",    "day_type": "WEEKEND", "enabled": true }
  ]
}
```

**PUT** — update one preference (also syncs today's log):
```json
{ "meal_type": "dinner", "day_type": "WEEKDAY", "enabled": false }
```

---

## 10. Local Development & Testing

Telegram webhooks require a public HTTPS URL. For local development:

### With ngrok

```bash
ngrok http 3000
# Copy the https URL, e.g. https://abc123.ngrok.io

curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -d "url=https://abc123.ngrok.io/api/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"

npm run dev
```

### With Cloudflare Tunnel (no account required)

```bash
npx cloudflared tunnel --url http://localhost:3000
```

### Testing without a real bot

Send a simulated update to your local webhook:

```bash
curl -X POST http://localhost:3000/api/telegram/webhook \
  -H "Content-Type: application/json" \
  -H "x-telegram-bot-api-secret-token: <TELEGRAM_WEBHOOK_SECRET>" \
  -d '{
    "update_id": 1,
    "message": {
      "message_id": 1,
      "from": { "id": 123456, "first_name": "Test" },
      "chat": { "id": 123456, "type": "private" },
      "text": "/meal off"
    }
  }'
```

The bot processes the command and attempts to reply (the reply will fail silently since chat 123456 isn't real), but you can inspect server logs to confirm correct handling.

---

## 11. Troubleshooting

### "No account found with phone number"
- Phone must be stored in the member's Mealio profile (Members page in dashboard)
- Must include country code: `+8801...` not `01...`
- Member must have `isActive = true`

### Webhook not receiving messages
```bash
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
```
Check `last_error_message` and `last_error_date`. Common causes:
- App not deployed yet
- Wrong URL
- Missing or wrong `secret_token`

### "/meal off says cut-off passed but it's only 20:00"
- The cutoff is checked in the **mess's timezone** (from the linked Telegram group)
- Default timezone is `Asia/Dhaka`
- Verify the timezone is set correctly in the `telegram_groups` table

### "/meal off targets the wrong meal"
- Lunch cutoff defaults to `10:00` mess time
- Dinner cutoff defaults to `21:00` mess time
- Both are configurable: Settings → Mess Settings → Lunch / Dinner Cut-off Time

### "/mealon doesn't turn on all meals for a member"
- This is correct behaviour: `/mealon` restores each member to **their own preferences**, not blanket all-ON
- If a member has dinner=OFF by default, dinner stays OFF after `/mealon`
- They can override individually with `/meal dinner`

### Bot not sending messages
- Verify `TELEGRAM_BOT_TOKEN` in `.env.local` is correct
- Check that the member's `telegramLinked = true` and `telegramUid` is set in the database

### Webhook secret mismatch (requests silently ignored)
- Ensure `TELEGRAM_WEBHOOK_SECRET` in `.env.local` matches what was used in `setWebhook`
- To reset, run `setWebhook` again with the correct `secret_token`

### Check which members have Telegram linked
```bash
npx prisma studio
```
Open the `members` table and filter by `telegram_linked = true`.
