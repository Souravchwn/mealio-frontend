# Deploying Mealtill

A checklist from empty to live. Takes about 30 minutes the first time.

## 1. Accounts you need

| For | Service | Needed? |
|-----|---------|---------|
| Database | Supabase Postgres | Yes |
| Bazaar memo photos | Vercel Blob (Vercel integration) | Strongly recommended |
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

## 3. Database (Supabase), photos (Vercel Blob) and cache (Upstash)

1. Create a Supabase project (region: Singapore is closest to Bangladesh). In Project Settings, Database, Connection string, copy:
   - **Transaction pooler** (port 6543) into `DATABASE_URL`. The app uses this.
   - **Session pooler** (port 5432, host `aws-0-…pooler.supabase.com`) into `DIRECT_URL`. The Prisma CLI uses this.
     Do not use the "Direct connection" host `db.<ref>.supabase.co`: it is IPv6 only and fails on most networks.
   - Replace `[YOUR-PASSWORD]` (brackets included) with the database password. URL-encode special characters (`@` is `%40`).
2. Create the tables from the schema, on your machine, with those two values in `.env.local`:
   ```bash
   npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script   # preview
   npx prisma db push                                                                          # apply
   ```
   Use the same command after pulling new code that changes `prisma/schema.prisma`; it only adds what is missing.
   Do not run `MIGRATION.sql` on a new database: it only upgrades the very old Supabase schema.
3. In Vercel, Storage, create a **Blob** store and connect it to this project. It sets `BLOB_READ_WRITE_TOKEN`.
   Bazaar memo photos then go to Blob instead of the database (without it they are stored in Postgres, which fills
   the free 500 MB in months). Move existing photos once with `npm run memos:to-blob`.
4. Add **Upstash** (Redis) from Vercel Integrations. It sets `KV_REST_API_URL` and `KV_REST_API_TOKEN`; the app reads
   those as well as the `UPSTASH_REDIS_REST_*` names.
5. Backups: the Supabase free plan keeps no restorable backups. Before real money is in it, either upgrade to Pro
   (daily backups) or export regularly (Database, Backups, or `pg_dump` with `DIRECT_URL`).

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

- Run the checks against a staging copy, never the real database: `npm run test:isolation`, `npm run test:closed`, `npm run test:telegram` (needs `npm run dev` running; the Telegram one needs a test bot token).
- Open `/en/console` and make sure Security shows no surprises.
- Read `context/17-periods-and-archive.md` so you know how closing a month works. Closing is the admin's job and cannot be undone.
