# Deploying Mealio

A checklist from empty to live. Takes about 30 minutes the first time.

## 1. Accounts you need

| For | Service | Needed? |
|-----|---------|---------|
| Database | Supabase (Postgres) | Yes |
| Hosting | Vercel (or any Node host) | Yes |
| Shared cache and rate limits | Upstash Redis | Strongly recommended |
| Telegram bot | @BotFather in Telegram | If you want the bot |
| Password reset emails | Resend | Optional |

## 2. Environment

```bash
npm run env:production
```

This writes `.env.deploy.local` (git-ignored) with fresh `JWT_SECRET`, `PLATFORM_JWT_SECRET` and `TELEGRAM_WEBHOOK_SECRET`. Fill in the rest from your providers. `.env.production.example` explains every line.

On Vercel paste the values into Project, Settings, Environment Variables (Production). The file is only a convenient list.

## 3. Database

1. Create the Supabase project.
2. Open the SQL Editor and run `MIGRATION.sql` once. It is safe to run again.
3. Put the pooled connection string in `DATABASE_URL` (port 6543) and the session one in `DIRECT_URL` (port 5432).

## 4. Deploy

Push the repository to Vercel and deploy. Set `NEXT_PUBLIC_APP_URL` to the final https address, then redeploy once so the Telegram webhook address is right.

## 5. First staff login

On your own machine, with the production values in `.env.local` temporarily, or in a one-off shell:

```bash
npm run platform-admin -- --email you@example.com --name "Your Name"
```

Then sign in at `https://your-domain/en/console`.

## 6. Telegram (no command line)

1. Create the bot with @BotFather and put the token in `TELEGRAM_BOT_TOKEN` (use a separate bot for local testing).
2. Sign in to the console, open **Telegram**, press **Connect the bot**. The page shows a checklist of what is still missing.
3. Once in @BotFather: Bot Settings, Configure Mini App, paste the URL the console shows (`https://your-domain/en/tg`).
4. Members link their Telegram once (Settings, My Telegram, **Open in Telegram**). The admin adds the bot to the house group: it sets itself up and pins an "Open my Mealio" button. Make the bot a group admin so it can pin and tidy up.
5. Anyone sends `/mealio` in the group to open their own Mealio inside Telegram.

## 7. Before you invite people

- Run the checks against a staging copy: `npm run test:isolation`, `npm run test:closed`, `npm run test:telegram`.
- Open `/en/console` and make sure Security shows no surprises.
- Read `context/17-periods-and-archive.md` so you know how closing a month works. Closing is the admin's job and cannot be undone.
