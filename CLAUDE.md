# Baby Daybook — Project Guide

## Mission
- Personal family app for tracking children's growth metrics (weight, height, head circumference).
- Primary target is Android APK via Expo/EAS; web exists as a support surface and deploy target.
- Backend is Supabase (Postgres + Auth + Storage).
- Core promise: log measurements for each child and visualize growth against WHO (0–60m) and CDC (2–20y) reference curves.
- If `AGENTS.md` or `CLAUDE.md` is changed, those `.md` edits must also be committed and pushed.

## Project Shape
- This folder IS the project root. `medidas-iniciais.xlsx` (historical import) is at the repo root (gitignored).
- Frontend stack: Expo 55, React Native 0.83, Expo Router, React Query, Zustand, NativeWind.
- Styling is dark theme with utility classes plus inline style objects.
- No heavy service layer; screens call hooks and `src/lib/api.ts` directly.

## Runtime Targets
- Android is the main product target.
- Web is supported through Expo export and Vercel rewrite to `index.html`.

## Important Commands
- `npm run start` — starts Expo
- `npm run android` — launches Android dev flow
- `npm run web` — runs web locally
- `npm run typecheck` — TS validation
- `npm run doctor` — Expo Doctor
- `npm run check` — env check + typecheck + doctor + audit
- `npm run check:build-env` — validates Supabase env before builds
- `npm run check:supabase` — validates DNS and Supabase health endpoint

## Build / Deploy
- Expo config is in `app.json`.
- OTA intended for Diego's installed Android app must target the `production` channel.
- Do not use `npm run update:production` for non-interactive OTA deploys; call `eas update` directly with `EXPO_TOKEN`, `--channel production`, `--environment production`, `--platform android`, and an explicit `--message`.
- `runtimeVersion.policy = appVersion`, so native-breaking releases must bump the app version.
- Native version enforcement is backed by Supabase table `app_version_config`.

## Environment
- Local runtime env: `.env.local`.
- Required public vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `app.json` also contains Supabase URL/key under `expo.extra`; config works without `.env.local`.
- `scripts/import-excel.mjs` needs service role credentials in `scripts/.env`.
- `.env.local` also contains `EXPO_TOKEN` — use it directly for non-interactive EAS OTA.
  - PowerShell OTA pattern: `$env:EXPO_TOKEN = (Select-String -Path .env.local -Pattern '^EXPO_TOKEN=').Line.Split('=',2)[1]; eas update --channel production --environment production --platform android --message "..."`

## Navigation Map
- `app/_layout.tsx` — wires QueryClient, auth session bootstrap, and OTA update check.
- `app/index.tsx` — redirects to login or `/(tabs)/`.
- `app/(auth)/login.tsx` — password login plus optional biometric unlock.
- `app/(tabs)/_layout.tsx` — authenticated shell with two tabs.
- `app/(tabs)/index.tsx` — children list (home tab).
- `app/(tabs)/configuracoes.tsx` — profile, biometrics, sign-out.
- `app/filho/[id].tsx` — child detail screen with Tabela and Gráficos top tabs.

## Main Screens
- `(tabs)/index.tsx` — grid of children cards; "+" FAB to add; tap to open child detail.
- `(tabs)/configuracoes.tsx` — user profile name, biometric toggle, sign-out.
- `filho/[id].tsx` — header with photo/name/age; top-tab switcher Tabela | Gráficos.
  - **Tabela tab**: FlatList of measurements (date, weight, height, head circ); add/edit/delete.
  - **Gráficos tab**: WHO/CDC source toggle; 3-line/5-line detail toggle; Peso + Altura + Cabeça charts (Cabeça hidden when CDC selected).

## Data Access Pattern
- React Query is the default fetch/cache layer.
- Most server operations live in `src/lib/api.ts`.
- Auth state is the only Zustand store (`src/stores/auth.ts`).
- Supabase client lives in `src/lib/supabase.ts` and uses SecureStore or localStorage.

## Core Domain Tables
- `user_profiles` — name.
- `children` — first_name, birth_date, sex, photo_url, display_order.
- `measurements` — child_id, date, weight_kg, height_cm, head_circumference_cm.
- `app_version_config` — minimum supported runtime and APK URL.

## Important Migrations
- `001_initial_schema.sql` — user_profiles, children, measurements tables, indexes, RLS.
- `002_app_version_config.sql` — forced-native-update gate (same pattern as treino-dieta).

## Growth Curve Logic
- `src/utils/growthCurves.ts` is the source of truth for WHO and CDC percentile tables.
- WHO tables: weight, height, head-circumference for boys and girls (0–60 months).
- CDC tables: weight, stature for boys and girls (24–240 months). No HC table exists in CDC.
- Percentile toggles: 5 lines (P3/P15/P50/P85/P97) or 3 lines (P3/P50/P97) — controlled by UI toggle.
- When CDC is selected, the head-circumference chart is hidden.
- `ageInMonths(birthDate, date)` is the canonical age calculator.

## Photo Storage
- Supabase Storage bucket: `child-photos` (private).
- Path: `{user_id}/{child_id}.jpg`.
- Access via short-lived signed URLs generated in `src/lib/api.ts`.

## Key Hooks
- `useChildren` / `useUpsertChild` / `useDeleteChild` — children CRUD.
- `useMeasurements` / `useUpsertMeasurement` / `useDeleteMeasurement` — measurements CRUD.
- `useAppUpdate` — foreground OTA check/fetch/reload.
- `useNativeVersionGate` — compares Expo runtimeVersion with Supabase min runtime.
- `useBiometrics` — SecureStore flag + local auth prompt.

## Historical Import
- One-time script: `scripts/import-excel.mjs`.
- Reads `medidas-iniciais.xlsx` (gitignored) at repo root.
- Requires `scripts/.env` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- Upserts children Clara (F) and Davi (M), then all measurements.
- Confirm actual birth dates with Diego before running.

## UI / UX Notes
- Dark-first; brand color emerald (#10b981) matches logo neon green.
- Charts built with @shopify/react-native-skia — no external chart library.
- Bottom sheets are custom `BottomSheetModal` component, not a third-party framework.
- Portrait only.

## Risky / Fragile Areas
- `measurements` has a UNIQUE constraint on (child_id, date) — upserts must use ON CONFLICT.
- Signed photo URLs expire; do not cache them long-term.
- `app_version_config` must be updated after every native EAS build.

## Fast Debug Heuristics
- Login/network issue → inspect `src/lib/supabase.ts`, `.env.local`, `app.json`; run `npm run check:supabase`.
- Build failure → run `npm run check:build-env`, then `npm run typecheck`.
- Chart not rendering → inspect `src/utils/growthCurves.ts` table slicing; verify child age is within curve range.
- Photo not loading → check Supabase Storage signed URL expiry and bucket RLS policies.
- Update modal/banner issue → inspect `useAppUpdate`, `useNativeVersionGate`, and `app_version_config`.

## Working Style
- Prefer surgical edits; large screen files are complex and partially hand-tuned.
- Preserve React Query invalidation behavior when adding mutations.
- When touching schema assumptions, read the matching migration before changing TS types.
- Always run `git status` before modifying anything; treat uncommitted changes as user work unless confirmed otherwise.

## After Every Change — Mandatory Steps
After implementing any change, always complete all applicable steps before reporting done:

1. **Create a branch** specific to the work before starting any `feat`, `fix`, `docs`, or `security` change.
2. **Commit** the changed files with a descriptive message on that branch.
3. **Merge** the finished branch into `master`.
4. **Push** `master` to `origin/master`.
5. **Delete** the branch created for that work after the merge is complete.
6. **Deploy/update** based on what changed:
   - JS or asset change for Diego's installed Android app → run `eas update` directly with `EXPO_TOKEN`, `--channel production`, `--environment production`, `--platform android`, and explicit `--message` (OTA; user reopens app).
   - Native/SDK/permission change → new EAS build required; notify Diego to reinstall APK.
7. Tell Diego in one line what was deployed and what action (if any) he needs to take.
8. If this file or `AGENTS.md` was edited, commit and push those `.md` changes too; there is no docs-only exception.

## Response Style
- Be as concise as possible. Deliver the same information with the fewest words.
- Terse like caveman. Technical substance exact. Only fluff die.
- Drop articles, filler, pleasantries, and hedging when meaning stays clear. Fragments are OK. Prefer pattern: thing -> action -> reason -> next step.
- Keep this mode active in every response unless the user explicitly asks for normal mode or more polish.
- No preambles ("I'll now...", "Let me..."). No closing summaries ("In summary...", "I've updated...").
- State what changed and what to do next — nothing else.

## Communicating Deploys to the User

**OTA for Diego's installed Android app:**
Run `eas update` directly with `EXPO_TOKEN`, `--channel production`, `--environment production`, `--platform android`, and explicit `--message`.
Only JS/assets change. No manual action needed beyond reopening the app.

**Native APK (new EAS build) — reinstall the APK.**
Required when a native module, permission, Expo SDK, or the `version` in `app.json` changes.
After a native build: update `min_runtime_version` and `apk_download_url` in `app_version_config`, then send Diego the download link.
