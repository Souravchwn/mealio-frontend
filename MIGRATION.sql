-- ============================================================
-- MEALIO — PRODUCTION MIGRATION
-- Run this in Supabase SQL Editor BEFORE deploying the new code.
-- All statements are idempotent (safe to run multiple times).
-- ============================================================

-- ── 1. daily_logs: add integer count columns ─────────────────────────────────
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS breakfast_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS lunch_count     INTEGER NOT NULL DEFAULT 1;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS dinner_count    INTEGER NOT NULL DEFAULT 1;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS is_override     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS override_type   TEXT CHECK (override_type IN ('USER','ADMIN','SYSTEM'));

-- ── 2. Migrate existing boolean data → integer counts (one-time, safe) ───────
-- Only updates rows where counts are still at default (1/1/1) but a boolean was false.
UPDATE daily_logs
SET
  breakfast_count = CASE WHEN breakfast IS NOT NULL AND NOT breakfast THEN 0 ELSE breakfast_count END,
  lunch_count     = CASE WHEN lunch     IS NOT NULL AND NOT lunch     THEN 0 ELSE lunch_count     END,
  dinner_count    = CASE WHEN dinner    IS NOT NULL AND NOT dinner    THEN 0 ELSE dinner_count    END
WHERE
  (breakfast = false OR lunch = false OR dinner = false)
  AND breakfast IS NOT NULL;

-- ── 3. user_meal_preferences table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_meal_preferences (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id     UUID REFERENCES members(id) ON DELETE CASCADE,
  mess_id       UUID REFERENCES messes(id) ON DELETE CASCADE,
  meal_type     TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','LUNCH','DINNER')),
  day_type      TEXT NOT NULL CHECK (day_type IN ('WEEKDAY','WEEKEND')),
  enabled       BOOLEAN NOT NULL DEFAULT true,
  default_count INTEGER NOT NULL DEFAULT 1 CHECK (default_count >= 0),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, mess_id, meal_type, day_type)
);

-- Add default_count if the table already existed without it
ALTER TABLE user_meal_preferences ADD COLUMN IF NOT EXISTS default_count INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_meal_prefs_member_mess ON user_meal_preferences(member_id, mess_id);

ALTER TABLE user_meal_preferences ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_meal_preferences' AND policyname = 'No anon access'
  ) THEN
    CREATE POLICY "No anon access" ON user_meal_preferences FOR ALL TO anon USING (false);
  END IF;
END $$;

-- ── 4. meal_configs table ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meal_configs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id     UUID REFERENCES messes(id) ON DELETE CASCADE,
  meal_type   TEXT NOT NULL CHECK (meal_type IN ('BREAKFAST','LUNCH','DINNER')),
  enabled     BOOLEAN NOT NULL DEFAULT true,
  cutoff_time TIME NOT NULL,
  max_count   INTEGER NOT NULL DEFAULT 10 CHECK (max_count > 0),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mess_id, meal_type)
);

CREATE INDEX IF NOT EXISTS idx_meal_configs_mess ON meal_configs(mess_id);

ALTER TABLE meal_configs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'meal_configs' AND policyname = 'No anon access'
  ) THEN
    CREATE POLICY "No anon access" ON meal_configs FOR ALL TO anon USING (false);
  END IF;
END $$;

-- ── 5. Seed default meal_configs for ALL existing messes ─────────────────────
INSERT INTO meal_configs (mess_id, meal_type, cutoff_time, enabled, max_count)
SELECT id, 'BREAKFAST', '08:30:00', true, 10 FROM messes
ON CONFLICT (mess_id, meal_type) DO NOTHING;

INSERT INTO meal_configs (mess_id, meal_type, cutoff_time, enabled, max_count)
SELECT id, 'LUNCH', '13:00:00', true, 10 FROM messes
ON CONFLICT (mess_id, meal_type) DO NOTHING;

INSERT INTO meal_configs (mess_id, meal_type, cutoff_time, enabled, max_count)
SELECT id, 'DINNER', '21:00:00', true, 10 FROM messes
ON CONFLICT (mess_id, meal_type) DO NOTHING;

-- ── 6. processed_updates table (Telegram idempotency) ────────────────────────
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id    BIGINT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT now()
);

-- ── 7. telegram_otps table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_otps (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  telegram_id TEXT NOT NULL,
  phone       TEXT NOT NULL,
  otp         TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_otps_uid ON telegram_otps(telegram_id);

-- ── 8. bazaar_sessions table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bazaar_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id      UUID REFERENCES messes(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  year_month   TEXT NOT NULL,
  shoppers     JSONB NOT NULL DEFAULT '[]',
  note         TEXT,
  created_by   UUID REFERENCES members(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bazaar_sessions_mess_month ON bazaar_sessions(mess_id, year_month);

ALTER TABLE bazaar_sessions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bazaar_sessions' AND policyname = 'No anon access'
  ) THEN
    CREATE POLICY "No anon access" ON bazaar_sessions FOR ALL TO anon USING (false);
  END IF;
END $$;

-- ── 9. expenses: add session_id column ───────────────────────────────────────
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES bazaar_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_session ON expenses(session_id) WHERE session_id IS NOT NULL;

-- ── 10. mess_months table ────────────────────────────────────────────────────
-- Tracks per-month state (open/closed), meal rate, and total expense snapshot.
CREATE TABLE IF NOT EXISTS mess_months (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id       UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
  year_month    TEXT NOT NULL,
  is_closed     BOOLEAN NOT NULL DEFAULT false,
  closed_at     TIMESTAMPTZ,
  meal_rate     DECIMAL(10, 4),
  total_expense DECIMAL(10, 2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mess_id, year_month)
);

-- ── 11. ledger_entries table ──────────────────────────────────────────────────
-- Tracks all financial movements per member per month:
--   CONTRIBUTION  — cash deposited by member (recorded by admin/manager)
--   DEDUCTION     — meal cost charged at month-close
--   CARRY_FORWARD — net balance rolled into the next month
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id       UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
  mess_month_id UUID REFERENCES mess_months(id),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  entry_type    TEXT NOT NULL,
  amount        DECIMAL(10, 2) NOT NULL,
  note          TEXT,
  created_by    UUID REFERENCES members(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Fix the entry_type constraint regardless of how the table was originally created
-- (covers cases where Prisma db push created it with a different or missing constraint)
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
ALTER TABLE ledger_entries
  ADD CONSTRAINT ledger_entries_entry_type_check
  CHECK (entry_type IN ('CONTRIBUTION', 'DEDUCTION', 'CARRY_FORWARD'));

CREATE INDEX IF NOT EXISTS idx_ledger_member_month ON ledger_entries(member_id, mess_month_id);
CREATE INDEX IF NOT EXISTS idx_ledger_mess_type    ON ledger_entries(mess_id, entry_type);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ledger_entries' AND policyname = 'No anon access'
  ) THEN
    CREATE POLICY "No anon access" ON ledger_entries FOR ALL TO anon USING (false);
  END IF;
END $$;

-- ── 12. audit_log table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id      UUID REFERENCES messes(id),
  actor_id     UUID REFERENCES members(id),
  action       TEXT NOT NULL,
  target_table TEXT,
  target_id    UUID,
  old_value    JSONB,
  new_value    JSONB,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ── 13. telegram_groups table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_groups (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id    TEXT NOT NULL UNIQUE,
  chat_name  TEXT,
  mess_id    UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
  timezone   TEXT NOT NULL DEFAULT 'Asia/Dhaka',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── 14. mess_memberships table (multi-mess support) ───────────────────────────
CREATE TABLE IF NOT EXISTS mess_memberships (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id  UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  mess_id    UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  joined_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, mess_id)
);

-- ── 15. Soft-delete (void) fields for bazaar_sessions ────────────────────────
ALTER TABLE bazaar_sessions ADD COLUMN IF NOT EXISTS is_voided   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bazaar_sessions ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE bazaar_sessions ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;
ALTER TABLE bazaar_sessions ADD COLUMN IF NOT EXISTS voided_by   UUID;

CREATE INDEX IF NOT EXISTS idx_bazaar_sessions_voided ON bazaar_sessions(mess_id, year_month, is_voided);

-- ── 16. Soft-delete (void) fields for ledger_entries ─────────────────────────
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS is_voided   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS void_reason TEXT;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS voided_at   TIMESTAMPTZ;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS voided_by   UUID;

-- ── 17. daily_cook_notes table (cook's optional note per meal slot per day) ───
CREATE TABLE IF NOT EXISTS daily_cook_notes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id     UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
  log_date    DATE NOT NULL,
  slot        TEXT NOT NULL CHECK (slot IN ('BREAKFAST','LUNCH','DINNER')),
  note        TEXT,
  updated_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mess_id, log_date, slot)
);

CREATE INDEX IF NOT EXISTS idx_cook_notes_mess_date ON daily_cook_notes(mess_id, log_date);

ALTER TABLE daily_cook_notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'daily_cook_notes' AND policyname = 'No anon access'
  ) THEN
    CREATE POLICY "No anon access" ON daily_cook_notes FOR ALL TO anon USING (false);
  END IF;
END $$;

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this script:
--   1. Deploy the new code to Vercel
--   2. The app will use breakfast_count/lunch_count/dinner_count for all meal logic
--   3. meal_configs drives per-meal cutoff times (BREAKFAST 08:30, LUNCH 13:00, DINNER 21:00)
--   4. bazaar_sessions groups expense items under one shopping trip
--   5. CONTRIBUTION entries in ledger_entries drive live member balance
--   6. Run npm run seed to populate demo data with 7 real members + sample deposits
--   7. Voided sessions/contributions are soft-deleted: is_voided=true, reason stored, excluded from financial calcs
-- ============================================================

-- ── 18. Custom Month Periods ──────────────────────────────────────────────────
ALTER TABLE messes ADD COLUMN IF NOT EXISTS month_start_day INTEGER NOT NULL DEFAULT 1;

ALTER TABLE mess_months ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE mess_months ADD COLUMN IF NOT EXISTS end_date DATE;
ALTER TABLE mess_months ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mess_months_open ON mess_months(mess_id, is_closed);

-- Populate start_date and end_date for existing rows
UPDATE mess_months 
SET 
  start_date = TO_DATE(year_month || '-01', 'YYYY-MM-DD'),
  end_date = (TO_DATE(year_month || '-01', 'YYYY-MM-DD') + INTERVAL '1 month' - INTERVAL '1 day')::DATE
WHERE start_date IS NULL;

ALTER TABLE mess_months ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE mess_months ALTER COLUMN end_date SET NOT NULL;

-- ── 19. Settings + security hardening ─────────────────────────────────────────
-- Guest meal billing policy: HOST (guest meals charged to the member who brought them)
-- or SHARED (guest meals excluded from everyone's count, cost spread via the meal rate)
ALTER TABLE messes ADD COLUMN IF NOT EXISTS guest_meal_policy TEXT NOT NULL DEFAULT 'HOST';
-- When true, bazaar expenses are credited as a deposit to the member who recorded them
ALTER TABLE messes ADD COLUMN IF NOT EXISTS bazaar_counts_as_deposit BOOLEAN NOT NULL DEFAULT FALSE;
-- When true, closing a month carries each member's balance into the next month
ALTER TABLE messes ADD COLUMN IF NOT EXISTS carry_forward_balance BOOLEAN NOT NULL DEFAULT TRUE;
-- Weekend days for meal preferences (0=Sun … 6=Sat). Bangladesh messes usually want '5,6' (Fri, Sat).
ALTER TABLE messes ADD COLUMN IF NOT EXISTS weekend_days TEXT NOT NULL DEFAULT '0,6';

-- Telegram linking now uses a code issued by the web app to a logged-in member
ALTER TABLE telegram_otps ADD COLUMN IF NOT EXISTS member_id UUID;
ALTER TABLE telegram_otps ALTER COLUMN telegram_id DROP NOT NULL;
ALTER TABLE telegram_otps ALTER COLUMN phone DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_telegram_otps_code ON telegram_otps(otp);
-- Invalidate any phone-based OTPs issued by the old (insecure) flow
UPDATE telegram_otps SET used = TRUE WHERE member_id IS NULL AND used = FALSE;

-- ── 20. SaaS foundations: sign-up, approval, recovery, support, platform admin ──
ALTER TABLE messes ADD COLUMN IF NOT EXISTS require_join_approval BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE messes ADD COLUMN IF NOT EXISTS owner_id UUID;
ALTER TABLE messes ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE messes ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;
ALTER TABLE messes ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE messes ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE messes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE members ADD COLUMN IF NOT EXISTS join_status TEXT NOT NULL DEFAULT 'APPROVED';
ALTER TABLE members ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE members ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS auth_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  issued_by TEXT NOT NULL DEFAULT 'SELF',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_member ON auth_tokens(member_id, purpose);

CREATE TABLE IF NOT EXISTS platform_admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id UUID,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_audit_created ON platform_audit_log(created_at);

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'INFO',
  member_id UUID,
  mess_id UUID,
  email TEXT,
  ip TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_security_events_created ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(type, created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_ip ON security_events(ip, created_at);

CREATE TABLE IF NOT EXISTS support_tickets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id UUID,
  mess_id UUID,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'OTHER',
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  access_key_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_support_tickets_member ON support_tickets(member_id);

CREATE TABLE IF NOT EXISTS support_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type TEXT NOT NULL,
  author_id UUID,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

-- Lock the new tables away from Supabase's public API (the app connects as the owner)
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 21. Bazaar memo photos (receipt evidence) + entry mode
-- ============================================================
ALTER TABLE bazaar_sessions ADD COLUMN IF NOT EXISTS entry_mode TEXT NOT NULL DEFAULT 'ITEMIZED';

CREATE TABLE IF NOT EXISTS bazaar_memos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES bazaar_sessions(id) ON DELETE CASCADE,
  mess_id UUID NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bazaar_memos_session ON bazaar_memos(session_id);
ALTER TABLE bazaar_memos ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 22. Frozen snapshot of every closed period
-- ============================================================
-- Closed periods are read from this column, so later setting changes (guest policy,
-- bazaar credit, ...) can never rewrite a closed month. Periods closed before this
-- column existed are snapshotted the first time they are read.
ALTER TABLE mess_months ADD COLUMN IF NOT EXISTS snapshot JSONB;

-- ============================================================
-- 23. Telegram group link codes
-- ============================================================
-- /linkgroup CODE in the house group links it to a mess without anyone hunting for a chat id.
ALTER TABLE telegram_otps ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'MEMBER';
ALTER TABLE telegram_otps ADD COLUMN IF NOT EXISTS mess_id UUID;

-- ============================================================
-- 24. Telegram Mini App prompts in the group
-- ============================================================
-- Remember the bot's latest "Open my Mealio" reply (deleted on the next /mealio) and the pinned one.
ALTER TABLE telegram_groups ADD COLUMN IF NOT EXISTS last_prompt_message_id INTEGER;
ALTER TABLE telegram_groups ADD COLUMN IF NOT EXISTS pinned_message_id INTEGER;

-- ============================================================
-- 25. Members by name first (sign-up optional)
-- ============================================================
-- A member added by name has no email and no password until they join.
ALTER TABLE members ALTER COLUMN email DROP NOT NULL;
ALTER TABLE members ALTER COLUMN password_hash DROP NOT NULL;
-- Meals a member eats by default when they have not set their own
ALTER TABLE messes ADD COLUMN IF NOT EXISTS default_meals TEXT;
-- "I am <name>" requests made with the mess invite code; credentials wait here for the admin
CREATE TABLE IF NOT EXISTS member_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id UUID NOT NULL REFERENCES messes(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_member_claims_mess ON member_claims(mess_id, status);
ALTER TABLE member_claims ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 26. Guests per meal
-- ============================================================
-- A guest can come for lunch only, dinner only, or both. guest_count stays for older days
-- (guests who ate every meal the host ate); new changes write these columns instead.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS guest_breakfast INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS guest_lunch INTEGER NOT NULL DEFAULT 0;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS guest_dinner INTEGER NOT NULL DEFAULT 0;
