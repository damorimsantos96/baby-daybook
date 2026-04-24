-- ============================================================
-- BABY DAYBOOK — Schema inicial
-- Execute no SQL Editor do Supabase (supabase.com → SQL Editor)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── updated_at helper ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── user_profiles ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── children ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS children (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL,
  birth_date    DATE NOT NULL,
  sex           TEXT NOT NULL CHECK (sex IN ('M', 'F')),
  photo_url     TEXT,
  display_order SMALLINT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_children_user
  ON children (user_id, display_order);

CREATE TRIGGER trg_children_updated_at
  BEFORE UPDATE ON children
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── measurements ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS measurements (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  child_id              UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  weight_kg             NUMERIC(5,3),
  height_cm             NUMERIC(5,1),
  head_circumference_cm NUMERIC(4,1),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (child_id, date)
);

CREATE INDEX IF NOT EXISTS idx_measurements_child_date
  ON measurements (child_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_measurements_user
  ON measurements (user_id);

CREATE TRIGGER trg_measurements_updated_at
  BEFORE UPDATE ON measurements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Row Level Security ───────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE children      ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_profile"
  ON user_profiles FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_children"
  ON children FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "own_measurements"
  ON measurements FOR ALL USING (auth.uid() = user_id);

-- ─── Storage bucket ───────────────────────────────────────────────────────────
-- Run in Supabase Dashboard → Storage → New Bucket
-- Name: child-photos, Public: false
-- Then add this RLS policy to the bucket objects:
--
-- Policy name: "own_photos"
-- Allowed operations: SELECT, INSERT, UPDATE, DELETE
-- USING expression: auth.uid()::text = (storage.foldername(name))[1]
-- WITH CHECK expression: auth.uid()::text = (storage.foldername(name))[1]
