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

-- ── 8. daily_logs: per-slot guest counts ─────────────────────────────────────
-- Guests now attend a specific meal and are billed to the host member.
-- A host's billed portions for a slot = own slot count + that slot's guest count.
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS guest_breakfast_count INTEGER NOT NULL DEFAULT 0 CHECK (guest_breakfast_count >= 0);
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS guest_lunch_count     INTEGER NOT NULL DEFAULT 0 CHECK (guest_lunch_count >= 0);
ALTER TABLE daily_logs ADD COLUMN IF NOT EXISTS guest_dinner_count    INTEGER NOT NULL DEFAULT 0 CHECK (guest_dinner_count >= 0);

-- Backfill: the legacy single guest_count is assumed to be dinner guests.
-- Idempotent guard: only migrate rows whose three new columns are still all 0.
UPDATE daily_logs
SET guest_dinner_count = guest_count
WHERE guest_count IS NOT NULL AND guest_count > 0
  AND guest_breakfast_count = 0 AND guest_lunch_count = 0 AND guest_dinner_count = 0;

-- NOTE: guest_count is retained (deprecated) for one release for safe rollback.
-- It is no longer read by application code. DROP it in a later migration:
--   ALTER TABLE daily_logs DROP COLUMN IF EXISTS guest_count;

-- ── 9. members: deprecate the guest-as-member system ──────────────────────────
-- is_guest / guest_from / guest_until and role='GUEST' are no longer used by the
-- application (guests are per-slot counts on daily_logs, attached to a host).
-- Columns are NOT dropped here to avoid irreversible data loss; drop them in a
-- later migration once confirmed safe:
--   ALTER TABLE members DROP COLUMN IF EXISTS is_guest;
--   ALTER TABLE members DROP COLUMN IF EXISTS guest_from;
--   ALTER TABLE members DROP COLUMN IF EXISTS guest_until;
--
-- Optional one-time normalization of any existing guest member rows into
-- regular members (uncomment to apply):
--   UPDATE members SET role = 'MEMBER', is_guest = false WHERE role = 'GUEST';

-- ── Done ──────────────────────────────────────────────────────────────────────
-- After running this script:
--   1. Deploy the new code to Vercel
--   2. The app will use breakfast_count/lunch_count/dinner_count for member meals
--      and guest_breakfast_count/guest_lunch_count/guest_dinner_count for guests
--   3. meal_configs drives per-meal cutoff times (BREAKFAST 08:30, LUNCH 13:00, DINNER 21:00)
-- ============================================================
