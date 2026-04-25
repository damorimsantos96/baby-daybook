-- ============================================================
-- BABY DAYBOOK — PostgREST schema grants
-- Fixes 404 on children?select=* in new Supabase projects
-- where anon/authenticated roles lack explicit table grants.
-- Execute no SQL Editor do Supabase (supabase.com → SQL Editor)
-- ============================================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT ALL ON user_profiles      TO authenticated;
GRANT ALL ON children           TO authenticated;
GRANT ALL ON measurements       TO authenticated;
GRANT ALL ON app_version_config TO authenticated;

GRANT SELECT ON app_version_config TO anon;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
