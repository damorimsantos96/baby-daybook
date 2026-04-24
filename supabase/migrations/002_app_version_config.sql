-- ============================================================
-- BABY DAYBOOK — App version gate
-- Allows forcing users onto a minimum native runtime version.
-- Execute no SQL Editor do Supabase.
-- ============================================================

CREATE TABLE IF NOT EXISTS app_version_config (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  min_runtime_version  TEXT NOT NULL DEFAULT '1.0.0',
  apk_download_url     TEXT NOT NULL DEFAULT '',
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Seed with initial values (update after each native EAS build)
INSERT INTO app_version_config (min_runtime_version, apk_download_url)
VALUES ('1.0.0', '')
ON CONFLICT DO NOTHING;

-- Public read access (app reads this before auth is resolved)
ALTER TABLE app_version_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_read_version_config"
  ON app_version_config FOR SELECT USING (true);
