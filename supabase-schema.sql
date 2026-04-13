-- ============================================================
-- MEALIO — PRODUCTION SCHEMA
-- Run this in your Supabase SQL Editor on a fresh project.
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- MESSES
-- ============================================================
CREATE TABLE IF NOT EXISTS messes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  invite_code     TEXT UNIQUE NOT NULL,         -- e.g. "MESS-ABC1"
  cut_off_time    TIME NOT NULL DEFAULT '21:00',
  estimated_monthly_budget NUMERIC(10,2),
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id         UUID REFERENCES messes(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  phone           TEXT,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'MEMBER'
                    CHECK (role IN ('ADMIN','MANAGER','MEMBER','GUEST')),
  telegram_uid    BIGINT UNIQUE,
  telegram_linked BOOLEAN DEFAULT false,
  is_active       BOOLEAN DEFAULT true,
  -- GUEST-specific fields
  is_guest        BOOLEAN DEFAULT false,
  guest_from      DATE,
  guest_until     DATE,
  invited_by      UUID REFERENCES members(id),
  joined_at       TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MESS MONTHS
-- ============================================================
CREATE TABLE IF NOT EXISTS mess_months (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id         UUID REFERENCES messes(id) ON DELETE CASCADE,
  year_month      TEXT NOT NULL,                -- "2026-04"
  is_closed       BOOLEAN DEFAULT false,
  closed_at       TIMESTAMPTZ,
  meal_rate       NUMERIC(10,4),
  total_expense   NUMERIC(10,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mess_id, year_month)
);

-- ============================================================
-- DAILY MEAL LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id         UUID REFERENCES messes(id) ON DELETE CASCADE,
  member_id       UUID REFERENCES members(id) ON DELETE CASCADE,
  log_date        DATE NOT NULL,
  breakfast       BOOLEAN DEFAULT true,
  lunch           BOOLEAN DEFAULT true,
  dinner          BOOLEAN DEFAULT true,
  guest_count     INTEGER DEFAULT 0 CHECK (guest_count >= 0),
  frozen          BOOLEAN DEFAULT false,
  toggled_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mess_id, member_id, log_date)
);

-- ============================================================
-- EXPENSES
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id         UUID REFERENCES messes(id) ON DELETE CASCADE,
  added_by        UUID REFERENCES members(id),
  amount          NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  category        TEXT NOT NULL
                    CHECK (category IN ('PROTEIN','CARB','VEGETABLE','SPICE','OIL','UTILITY','OTHER')),
  description     TEXT,
  expense_date    DATE NOT NULL,
  year_month      TEXT NOT NULL,                -- "2026-04" — denormalized for fast queries
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- LEDGER (double-entry financial records)
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id         UUID REFERENCES messes(id) ON DELETE CASCADE,
  mess_month_id   UUID REFERENCES mess_months(id),
  member_id       UUID REFERENCES members(id) ON DELETE CASCADE,
  entry_type      TEXT NOT NULL
                    CHECK (entry_type IN ('DEPOSIT','DEDUCTION','CARRY_FORWARD','SETTLEMENT')),
  amount          NUMERIC(10,2) NOT NULL,       -- positive=credit, negative=debit
  note            TEXT,
  created_by      UUID REFERENCES members(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- AUDIT LOG (immutable — never delete rows)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mess_id         UUID REFERENCES messes(id),
  actor_id        UUID REFERENCES members(id),
  action          TEXT NOT NULL,
  target_table    TEXT,
  target_id       UUID,
  old_value       JSONB,
  new_value       JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- MESS MEMBERSHIPS (multi-mess support)
-- ============================================================
CREATE TABLE IF NOT EXISTS mess_memberships (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id   UUID REFERENCES members(id) ON DELETE CASCADE,
  mess_id     UUID REFERENCES messes(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('ADMIN','MANAGER','MEMBER','GUEST')),
  is_active   BOOLEAN DEFAULT true,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, mess_id)
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_daily_logs_mess_date    ON daily_logs(mess_id, log_date);
CREATE INDEX IF NOT EXISTS idx_daily_logs_member_date  ON daily_logs(member_id, log_date);
CREATE INDEX IF NOT EXISTS idx_expenses_mess_month     ON expenses(mess_id, year_month);
CREATE INDEX IF NOT EXISTS idx_ledger_member_month     ON ledger_entries(member_id, mess_month_id);
CREATE INDEX IF NOT EXISTS idx_members_telegram        ON members(telegram_uid) WHERE telegram_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_members_mess            ON members(mess_id);

-- ============================================================
-- ROW LEVEL SECURITY — block anon key access entirely
-- ============================================================
ALTER TABLE messes ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE mess_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No anon access" ON messes FOR ALL TO anon USING (false);
CREATE POLICY "No anon access" ON members FOR ALL TO anon USING (false);
CREATE POLICY "No anon access" ON daily_logs FOR ALL TO anon USING (false);
CREATE POLICY "No anon access" ON expenses FOR ALL TO anon USING (false);
CREATE POLICY "No anon access" ON ledger_entries FOR ALL TO anon USING (false);
CREATE POLICY "No anon access" ON mess_months FOR ALL TO anon USING (false);
CREATE POLICY "No anon access" ON audit_log FOR ALL TO anon USING (false);

-- ============================================================
-- DEFAULT-DRIVEN MEAL SYSTEM — additive migrations
-- Run these on existing databases (safe to run multiple times).
-- ============================================================

-- ── daily_logs: migrate from boolean to integer counts ──────────────────────
-- Step 1: Add new count columns
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS breakfast_count INTEGER DEFAULT 1;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS lunch_count     INTEGER DEFAULT 1;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS dinner_count    INTEGER DEFAULT 1;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS is_override     BOOLEAN DEFAULT false;
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS override_type   TEXT CHECK (override_type IN ('USER','ADMIN','SYSTEM'));

-- Step 2: Migrate existing boolean data to counts (run once)
UPDATE daily_logs
  SET breakfast_count = CASE WHEN breakfast THEN 1 ELSE 0 END,
      lunch_count     = CASE WHEN lunch     THEN 1 ELSE 0 END,
      dinner_count    = CASE WHEN dinner    THEN 1 ELSE 0 END
  WHERE breakfast_count = 1 AND lunch_count = 1 AND dinner_count = 1
    AND (breakfast = false OR lunch = false OR dinner = false);

-- Note: old boolean columns (breakfast, lunch, dinner) are kept for safety.
-- They are ignored by the Prisma schema and can be dropped after confirming
-- the new system is stable:
--   ALTER TABLE daily_logs DROP COLUMN breakfast, DROP COLUMN lunch, DROP COLUMN dinner;

-- ── USER MEAL PREFERENCES ────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_meal_prefs_member_mess ON user_meal_preferences(member_id, mess_id);

ALTER TABLE user_meal_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "No anon access" ON user_meal_preferences FOR ALL TO anon USING (false);

-- ── MEAL CONFIGS (per-meal, per-mess cutoff + enabled) ───────────────────────
-- Drives dynamic time-based meal targeting. Replaces the single mess.cut_off_time
-- approach. Seed three rows per mess on creation.
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
CREATE POLICY "No anon access" ON meal_configs FOR ALL TO anon USING (false);

-- Seed default meal configs for the demo mess (and any existing messes)
INSERT INTO meal_configs (mess_id, meal_type, cutoff_time, enabled, max_count)
SELECT id, 'BREAKFAST', '08:30', true, 10 FROM messes
ON CONFLICT (mess_id, meal_type) DO NOTHING;

INSERT INTO meal_configs (mess_id, meal_type, cutoff_time, enabled, max_count)
SELECT id, 'LUNCH', '13:00', true, 10 FROM messes
ON CONFLICT (mess_id, meal_type) DO NOTHING;

INSERT INTO meal_configs (mess_id, meal_type, cutoff_time, enabled, max_count)
SELECT id, 'DINNER', '21:00', true, 10 FROM messes
ON CONFLICT (mess_id, meal_type) DO NOTHING;

-- ============================================================
-- DEMO MESS SEED
-- ============================================================
INSERT INTO messes (id, name, invite_code, cut_off_time, estimated_monthly_budget)
VALUES (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Demo Mess',
  'MESS-DEMO',
  '21:00',
  15000
) ON CONFLICT DO NOTHING;
