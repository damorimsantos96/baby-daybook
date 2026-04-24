# Baby Daybook — AGENTS Guide

## Purpose
- Use this file as the Codex-facing project map.
- `CLAUDE.md` is reference material only. Do not edit it unless explicitly asked.
- Prefer this document over generic assumptions when navigating or changing the repo.
- If `AGENTS.md` or `CLAUDE.md` is changed, those `.md` edits must also be committed and pushed.

## Product Overview
- Personal family app for tracking children's growth metrics (weight, height, head circumference).
- Main target is Android via Expo/EAS.
- Web exists as a support surface and deploy target.
- Backend is Supabase: Postgres, Auth, and Storage.
- Core value: log growth data per child and compare against WHO/CDC clinical reference curves.

## Tech Stack
- Expo 55
- React Native 0.83
- React 19
- Expo Router (typed routes)
- TanStack React Query 5
- Zustand (auth only)
- NativeWind 4 + Tailwind 3
- Supabase JS
- @shopify/react-native-skia (charts)

## Repo Map
- `app/` Expo Router routes and layouts.
- `src/lib/` Supabase client, API layer, device storage abstraction.
- `src/hooks/` App-facing hooks: children, measurements, OTA updates, biometrics.
- `src/utils/` Growth curve tables and calculation helpers.
- `src/components/ui/` Shared UI primitives (Card, BottomSheetModal, update banners).
- `src/components/charts/` Skia-based GrowthChart component.
- `src/stores/` Zustand (auth only).
- `src/types/` TypeScript domain types.
- `supabase/migrations/` Schema history and source of truth for DB assumptions.
- `scripts/` Environment checks and historical data import.
- `docs/` Static web assets (privacy policy).
- `assets/` App icons and splash (must be replaced with real logo-derived images by Diego).
- `medidas-iniciais.xlsx` Historical import source at repo root (gitignored).

## Runtime Priorities
- Treat Android as the primary experience.
- Web must keep working for export/deploy, but should not drive product decisions over Android.

## Commands
- `npm run start` starts Expo.
- `npm run android` starts Expo for Android.
- `npm run web` starts Expo Web locally.
- `npm run typecheck` runs TypeScript validation.
- `npm run doctor` runs Expo Doctor.
- `npm run audit:app` audits production dependencies.
- `npm run check` runs build-env check, typecheck, doctor, and audit.
- `npm run check:build-env` validates required env/build configuration.
- `npm run check:supabase` validates Supabase DNS and health endpoint.

## Environment
- Local runtime env is `.env.local`.
- Key public vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `app.json` also contains Supabase values under `expo.extra`.
- `scripts/import-excel.mjs` expects service-role credentials in `scripts/.env`.
- `.env.local` contains `EXPO_TOKEN`. Always read it and pass it as an env var before running EAS/Expo CLI commands.
  - PowerShell pattern: `$env:EXPO_TOKEN = (Select-String -Path .env.local -Pattern '^EXPO_TOKEN=').Line.Split('=',2)[1]; eas update --channel production --environment production --platform android --message "..."`

## App Structure
- `app/_layout.tsx` wires QueryClient, auth bootstrap, and OTA update check.
- `app/index.tsx` redirects to login or `/(tabs)/`.
- `app/(auth)/login.tsx` handles password login and optional biometric unlock.
- `app/(tabs)/_layout.tsx` is the authenticated shell with Filhos and Configurações tabs.
- `app/(tabs)/index.tsx` children list with cards and add FAB.
- `app/(tabs)/configuracoes.tsx` profile, biometrics, sign-out.
- `app/filho/[id].tsx` child detail: header + top-tab Tabela | Gráficos.

## Main Screens
- `app/(tabs)/index.tsx` — shows all children as cards; tap → filho/[id]; long-press → edit/delete.
- `app/(tabs)/configuracoes.tsx` — user display name, biometric toggle, sign-out.
- `app/filho/[id].tsx`:
  - **Tabela tab**: sorted measurement list; add/edit/delete via bottom sheet.
  - **Gráficos tab**: WHO/CDC source toggle; 5-line/3-line detail toggle; Peso + Altura + Cabeça charts (Cabeça hidden when CDC).

## Data Flow
- React Query is the default fetch/cache layer.
- Most server reads/writes live in `src/lib/api.ts`.
- Zustand is only used for auth state in `src/stores/auth.ts`.
- Supabase client lives in `src/lib/supabase.ts`.

## Core Tables
- `user_profiles` user display name.
- `children` first_name, birth_date, sex, photo_url, display_order.
- `measurements` child_id, date, weight_kg, height_cm, head_circumference_cm.
- `app_version_config` minimum supported runtime and APK URL.

## Migration Landmarks
- `001_initial_schema.sql` user_profiles, children, measurements; RLS; updated_at triggers.
- `002_app_version_config.sql` native version gate support.

## Domain Rules
- `children` belongs to a `user_id`; each user can have many children.
- `measurements` has UNIQUE (child_id, date); always upsert with ON CONFLICT.
- Growth curves live entirely in `src/utils/growthCurves.ts` — no runtime API calls for curve data.
- When CDC is selected, head-circumference chart is hidden (CDC has no HC reference data for 2–20y).
- Percentile mode (5 lines vs 3 lines) is a UI-only toggle stored in component state, not persisted.

## Growth Curves
- WHO: weight, height, head-circumference for ages 0–60 months (boys/girls).
- CDC: weight, stature for ages 24–240 months (boys/girls). No CDC HC table.
- Data shape: `[month, P3, P15, P50, P85, P97]` rows as TypeScript constants.
- Helper: `getPercentileCurve(metric, sex, standard, nLines)` → sliced percentile array.
- Helper: `ageInMonths(birthDate, date)` → number.

## Chart Architecture
- `src/components/charts/GrowthChart.tsx` uses @shopify/react-native-skia.
- X axis: age in months; auto-zoomed to child's range + 6-month buffer.
- Y axis: auto-scaled to data + 10% padding.
- P50 — solid emerald. P15/P85 — dashed amber (5-line mode). P3/P97 — dashed red.
- Child data: emerald dots + white connecting line.
- Touch: tap dot → tooltip (date, age, value, nearest percentile band).

## Integrations
### Supabase Storage (child photos)
- Bucket: `child-photos` (private).
- Path: `{user_id}/{child_id}.jpg`.
- Access: short-lived signed URLs via `src/lib/api.ts`.

### OTA Updates
- `useAppUpdate` — foreground check/fetch/reload.
- `useNativeVersionGate` — compares installed version with `app_version_config.min_runtime_version`.

## UI Notes
- App is dark-first. Brand color: emerald (#10b981).
- Styling mixes NativeWind utility classes and inline style objects.
- Charts are custom Skia; no chart library.
- Bottom sheets are custom components.
- Portrait only.

## Risk Areas
- `measurements` UNIQUE constraint — careless inserts without ON CONFLICT will fail.
- Signed photo URLs expire; re-fetch them when stale.
- `app_version_config` must be updated after every native EAS build.

## Change Heuristics
- Prefer surgical edits over broad refactors.
- Preserve React Query invalidation behavior when touching mutations.
- When changing schema assumptions, read the corresponding migration first and then align TS types and API code.

## After Every Change — Mandatory Steps
After implementing any change, always complete all applicable steps before reporting done:

1. **Create a branch** specific to the work before starting any `feat`, `fix`, `docs`, or `security` change.
2. **Commit** the changed files with a descriptive message on that branch.
3. **Merge** the finished branch into `master`.
4. **Push** `master` to `origin/master`.
5. **Delete** the branch created for that work after the merge is complete.
6. **Deploy/update** based on what changed:
   - JS or asset change → `eas update` with `EXPO_TOKEN`, `--channel production`, `--environment production`, `--platform android`, `--message`.
   - Native/SDK/permission change → new EAS build; notify Diego to reinstall APK.
7. Tell Diego in one line what was deployed and what action he needs to take.
8. If this file or `CLAUDE.md` was edited, commit and push those `.md` changes too.

## Response Style
- Be as concise as possible. Deliver the same information with the fewest words.
- No preambles ("I'll now…", "Let me…"). No closing summaries ("In summary…", "I've updated…").
- State what changed and what to do next — nothing else.

## Fast Debug Paths
- Login or network issue: inspect `src/lib/supabase.ts`, `.env.local`, `app.json`, then run `npm run check:supabase`.
- Build issue: run `npm run check:build-env` and `npm run typecheck`.
- Chart not rendering: inspect `src/utils/growthCurves.ts` table and verify child age is within range.
- Photo not loading: check signed URL expiry and Supabase Storage bucket RLS policy.
- Update banner or forced-update issue: inspect `useAppUpdate`, `useNativeVersionGate`, and `app_version_config`.

## Deploy Notes
- OTA: `eas update --channel production --environment production --platform android --message "..."` — user reopens app.
- Native APK: user must reinstall. Update `app_version_config` after build.
- `runtimeVersion.policy = appVersion` — native-breaking changes require bumping `version` in `app.json`.
