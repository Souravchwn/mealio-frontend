# Deploying Mealtill

A checklist from empty to live. Takes about 30 minutes the first time.

## 1. Accounts you need

| For | Service | Needed? |
|-----|---------|---------|
| Database | Neon Postgres (Vercel integration) | Yes |
| Hosting | Vercel | Yes |
| Shared cache and rate limits | Upstash Redis (Vercel integration) | Strongly recommended |
| Telegram bot | @BotFather in Telegram | If you want the bot |
| Emails (reset codes, invites) | Gmail SMTP for now, Resend later | Recommended |

## 2. Environment

```bash
npm run env:production
```

This writes `.env.deploy.local` (git-ignored) with fresh `JWT_SECRET`, `PLATFORM_JWT_SECRET` and `TELEGRAM_WEBHOOK_SECRET`. Fill in the rest from your providers. `.env.production.example` explains every line.

On Vercel paste the values into Project, Settings, Environment Variables (Production). The file is only a convenient list.

## 3. Database (Neon) and cache (Upstash)

1. In Vercel, Integrations, add **Neon** and connect it to this project. It sets `DATABASE_URL` (pooled, used by the app) and `DATABASE_URL_UNPOOLED` (used by the Prisma CLI). Nothing to copy by hand.
2. Add **Upstash** (Redis) the same way. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the app reads those as well as the `UPSTASH_REDIS_REST_*` names.
3. Create the tables once from the schema, on your machine, with the unpooled Neon string in `DIRECT_URL`:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # preview
   npx prisma db push                                                                          # apply
   ```
   Do not run `MIGRATION.sql` on a new database: it upgrades an old Supabase database and uses Supabase-only roles.

## 3b. Email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD` (a Gmail app password) to send reset codes, invites and email confirmations. Mail from a personal Gmail can land in spam; the app tells people to look there. Later set `RESEND_API_KEY` and `EMAIL_FROM` (a verified domain); Resend then takes over automatically.

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
4. Members link their Telegram once (Settings, My Telegram, **Open in Telegram**). The admin adds the bot to the house group: it sets itself up and pins an "Open my Mealtill" button. Make the bot a group admin so it can pin and tidy up.
5. Anyone sends `/mealtill` in the group to open their own Mealtill inside Telegram.

## 7. Before you invite people

- Run the checks against a staging copy: `npm run test:isolation`, `npm run test:closed`, `npm run test:telegram`.
- Open `/en/console` and make sure Security shows no surprises.
- Read `context/17-periods-and-archive.md` so you know how closing a month works. Closing is the admin's job and cannot be undone.
