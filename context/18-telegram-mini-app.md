# Module 18: Telegram, self-setup and the Mini App

The mess group is a normal chat. Anyone types `/mealtill` (or taps the pinned button) and gets **their
own** read-only Mealtill inside Telegram: today's meals, their money, who is eating today. Nobody else in
the group sees it.

## How a person gets in

| Step | Who | Once or always |
|------|-----|----------------|
| Link Telegram to the Mealtill account: website, Settings, My Telegram, **Open in Telegram** (`t.me/<bot>?start=CODE`) | each member | once |
| Add the bot to the house group | mess admin | once |
| `/mealtill`, the pinned "Open my Mealtill" message, or the menu button in a private chat | anyone | any time |

## The bot sets itself up (`src/lib/telegram/services/group-presence.service.ts`)
Handles `my_chat_member` (the bot added, removed or promoted), before the normal message dispatch in
`handleWebhookUpdate()`.

| Event | Result |
|-------|--------|
| Added by a linked **admin** | `activateGroup()` connects the group to the admin's mess, posts the welcome with the button, tries to pin it |
| Added by anyone else | One short note, nothing else |
| Made an admin later | Pins the existing welcome (never posts a second one) |
| Removed or kicked | Group deactivated, stored message ids forgotten |

Who added the bot comes from Telegram (`from`) and the webhook secret stops forged updates, so it is
trusted. The mess always comes from that person's linked account. A group connected to another mess is
never taken over (`linkGroupToMess` returns `TAKEN`).

## `/mealtill` (`src/lib/telegram/commands/handlers/linkgroup.handler.ts`)
- Private chat: a `web_app` button that opens the Mini App right there.
- Connected group: deletes the `/mealtill` message and the previous prompt, posts one new prompt with a
  link button to `t.me/<bot>?startapp`. The group never holds more than one prompt. (No timers: the
  project has no cron jobs, so "tidy" means "replace", not "delete after a minute".)
- Group not connected: a linked admin connects it; anyone else gets a short note.
- `/linkgroup CODE` still works as an older fallback.

Prompt and welcome ids live on `TelegramGroup.lastPromptMessageId` / `pinnedMessageId`
(`MIGRATION.sql` section 24). Deleting and pinning need the bot to be a group admin; without that the
calls fail quietly.

## The Mini App

| Part | File |
|------|------|
| Page | `src/app/[locale]/tg/page.tsx`, `tg.module.css` |
| Identity | `src/lib/telegram/webapp-auth.ts` (`verifyInitData`) |
| Data | `GET /api/tg/home` |
| Shared "today" logic | `src/lib/today.ts` (`getMemberDayMeals`, `getTodayHeadcount`), also used by `/api/meals/today` and `/api/cook/headcount` |

- **Identity**: Telegram signs `initData` with a key derived from our bot token. The API checks the
  HMAC and refuses data older than 24 hours, then finds the member with
  `MemberRepository.findByTelegramUid()` (active, approved, mess not suspended or deleted). Nothing else
  in the request is trusted. Not linked: `{ linked: false, link_url }`.
- **Read-only**: the API has no write path. Changes stay on the website and `/meal`.
- **Look**: follows the person's Telegram theme (`--tg-theme-*` variables, light or dark) and language
  (`bn` loads `/bn/tg` with a full load that keeps the `#tgWebApp...` hash). Pull to refresh, haptics,
  countdown to the next cutoff.
- **Headers**: only `/en/tg` and `/bn/tg` may load `https://telegram.org` scripts and be framed by
  `web.telegram.org` (Telegram Web shows Mini Apps in an iframe). Every other page keeps the strict CSP
  and `X-Frame-Options`. See `next.config.ts`.

## Setup (staff console, Telegram page)
1. **Connect the bot**: sets the webhook with `allowed_updates: ['message', 'my_chat_member']`, the
   command menu, and the private chat menu button (`setChatMenuButton`, web_app to `/en/tg`).
2. **Once in @BotFather**: Bot Settings, Configure Mini App, paste `https://<site>/en/tg`. Needed for the
   group button (`t.me/<bot>?startapp`). The checklist shows whether it is done (`getMe.has_main_web_app`).

## Tests
`npm run test:telegram` (39 checks): forged and stale `initData`, swapped user ids, strangers, other
messes, forged "bot added" events, takeover attempts, removal and re-adding, `/mealtill`, `/start CODE`
in groups versus private chats, and the older `/linkgroup` and `/link` flows.
