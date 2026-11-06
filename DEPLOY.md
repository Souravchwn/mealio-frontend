# Deploying Manager Babu

A checklist from empty to live. Takes about 30 minutes the first time.

## 1. Accounts you need

| For | Service | Needed? |
|-----|---------|---------|
| Database | Supabase (Postgres) | Yes |
| Hosting | Vercel (or any Node host) | Yes |
| Shared cache and rate limits | Upstash Redis | Strongly recommended |
| Password reset emails | Resend | Optional |

## 2. Environment

```bash
npm run env:production
```

This writes `.env.deploy.local` (git-ignored) with fresh `JWT_SECRET` and `PLATFORM_JWT_SECRET`. Fill in the rest from your providers. `.env.production.example` explains every line.

On Vercel paste the values into Project, Settings, Environment Variables (Production). The file is only a convenient list.

## 3. Database

1. Create the Supabase project.
2. Open the SQL Editor and run `MIGRATION.sql`. It is safe to run again, and when upgrading an existing database run it **before** deploying the new code. It adds each mess's own timezone (copied from its linked Telegram group, if it had one) and the broadcasts table.
3. Put the pooled connection string in `DATABASE_URL` (port 6543) and the session one in `DIRECT_URL` (port 5432).

## 4. Deploy

Push the repository to Vercel and deploy. Set `NEXT_PUBLIC_APP_URL` to the final https address, then redeploy once so links in emails are right.

## 5. First staff login

On your own machine, with the production values in `.env.local` temporarily, or in a one-off shell:

```bash
npm run platform-admin -- --email you@example.com --name "Your Name"
```

Then sign in at `https://your-domain/en/console`.

## 6. Removing the old Telegram data (optional, upgrades only)

Telegram support has been removed. If this database ever had it, the old tables and columns are still there and harmless. Once the new version is live and you are sure you will not want that data back, run section 27 of `MIGRATION.sql` (it is commented out; it permanently deletes each member's linked Telegram id and each mess's linked group). Also delete the bot's webhook in Telegram, and the `TELEGRAM_*` variables from your host.

## 7. Before you invite people

- Run the checks against a staging copy: `npm run test:isolation`, `npm run test:closed`.
- Open `/en/console` and make sure Security shows no surprises.
- Read `context/17-periods-and-archive.md` so you know how closing a month works. Closing is the admin's job and cannot be undone.
