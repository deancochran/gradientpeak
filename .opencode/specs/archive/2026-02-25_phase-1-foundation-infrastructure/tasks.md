# Tasks - Phase 1 Foundation & Infrastructure

Last Updated: 2026-02-26
Status: Active
Owner: Mobile + Backend + Platform + QA

Implements `./design.md` and `./plan.md`.

## Phase A - Server Configuration & Self-Hosting

- [x] Audit all mobile hardcoded backend URL usage and startup assumptions.
- [x] Define source-of-truth config module for server base URL.
- [x] Add small collapsible server URL input to existing login screen.
- [x] Add small collapsible server URL input to existing signup screen.
- [x] Pre-fill official hosted default URL in server field.
- [x] Persist selected URL securely on-device.
- [x] Gate API client initialization on resolved persisted server URL.
- [x] Route all auth requests through configured base URL.
- [x] Route all non-auth API requests through configured base URL.
- [x] Remove hardcoded fallback URL behavior from runtime paths.
- [x] Reset auth/session boundary when server authority changes. _Sign-in/sign-up now clear local auth session when server override changes before continuing auth._
- [x] Keep server configuration scoped to login/signup only (no new auth route, no settings flow).
- [x] Verify backend runtime config is fully env-driven (including CORS/email). _Updated `packages/supabase/config.toml` to source auth redirect + studio API URL from env variables instead of hardcoded host values._
- [x] Verify/ship single-command local deployment path for self-hosting. _Added root scripts `self-host:up` and `self-host:down` with env-overridable defaults, plus `docs/self-hosting-local.md`._
- [x] Publish self-host container image on `main` updates. _Added `apps/web/Dockerfile` and GitHub Actions workflow `.github/workflows/publish-container.yml` to build and push `ghcr.io/<owner>/<repo>` with `latest` and `sha-*` tags, path-based triggers, concurrency cancellation, and SBOM/provenance attestations._

## Phase B - Navigation Architecture Stabilization

- [x] Audit all navigation triggers that can fire while overlay is open. _Reviewed tab launchers and plan/home CTA flows; guarded and/or replace semantics are already applied in primary rapid-tap entry points (`(tabs)/_layout.tsx`, `(tabs)/index.tsx`, `(tabs)/plan.tsx`)._
- [x] Audit all routes currently allowing duplicate stack entries. _Primary non-self-stacking destinations already use `replace` from home/plan launcher paths; record launcher uses action guard in tab layout._
- [x] Create route behavior matrix (push vs replace vs modal). _Documented below in notes._
- [x] Refactor overlay flows to dismiss first and navigate only after close completion.
- [x] Prevent concurrent close+navigate dispatch in all affected flows. _Current Phase 1-targeted flows rely on `useNavigationActionGuard` and replace-first routing for non-self-stacking transitions._
- [x] Update non-self-stacking destinations to replacement semantics.
- [x] Add guards for rapid repeated navigation triggers.
- [x] Align modal routes with Expo Router modal presentation conventions. _Validated existing `Stack.Screen` presentation usage in internal layouts (`presentation: "modal"` / `"fullScreenModal"`) as current Expo Router convention._
- [ ] Validate back-gesture dismissal for modal routes. _Requires device-level QA pass._
- [ ] Validate modal context isolation across unrelated navigation transitions. _Requires device-level QA pass._

## Validation - End-to-End

- [ ] Validate login/signup default behavior: hosted server used when override is collapsed/untouched.
- [ ] Validate login/signup self-host behavior: expanding override and setting URL routes auth to custom server.
- [ ] Validate login/signup/refresh/data calls against configured hosted default.
- [ ] Validate same flows against custom self-host URL.
- [ ] Validate no orphan overlay remains after navigation in audited flows.
- [ ] Validate no duplicate stack entries for protected routes under rapid taps.
- [ ] Validate modal routes dismiss correctly with back gesture.
- [x] Validate self-host stack starts from repo with env config + one command. _`pnpm self-host:up` and `pnpm self-host:down` both succeeded locally._

### Route Behavior Matrix (Phase 1)

- `replace`: home -> plan (today CTA / view plan / schedule strip), no-plan CTA -> library training plans.
- `push`: detail drill-down routes (scheduled activity detail, training plan detail, route/activity details) where stack depth is expected.
- `modal/fullScreenModal`: record flow (`(internal)/record` as `fullScreenModal`), route upload (`presentation: "modal"`).
- `guarded`: record launcher tab and key plan/home launch actions use `useNavigationActionGuard` to suppress rapid duplicate taps.

## Quality Gates

- [x] `pnpm --filter @apps/mobile check-types` _Equivalent run `pnpm --filter mobile check-types` now passes after replacing static `react-native-health` import with guarded runtime loading on iOS onboarding integration step._
- [x] `pnpm --filter @apps/mobile test` _Equivalent run `pnpm --filter mobile test` passed (81 tests)._
- [x] `pnpm check-types` _Passes across workspace after aligning auth update-password contract and mobile onboarding HealthKit loading._
- [x] `pnpm lint` _Passes (warnings only) across workspace; no lint errors remain in Phase 1 touched paths._
- [x] `pnpm test` _Passed across scoped packages run by turbo (`@repo/core`, `@repo/trpc`, `mobile`)._
- [x] `docker build -f apps/web/Dockerfile -t gradientpeak:test .` _Build succeeds for published self-host image path (Next.js standalone runtime)._
- [x] `docker run ... gradientpeak:test` _Container boots and `/api/health` returns `{\"status\":\"ok\"}` on mapped host port._

## Definition of Done

- [ ] Phase 1 acceptance criteria in `design.md` are all satisfied. _Code paths are implemented; remaining blocker is manual QA for modal back-gesture/context-isolation and overlay verification on device._
- [ ] No known Phase 1 blockers remain for Phases 2+. _Repo-wide baseline type/lint debt remains outside this spec scope._
