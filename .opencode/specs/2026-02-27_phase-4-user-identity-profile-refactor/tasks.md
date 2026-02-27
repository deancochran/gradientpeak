# Tasks - Phase 4 User Identity and Profile Refactor

Last Updated: 2026-02-27
Status: Active
Owner: Mobile + Backend + QA

Implements `./design.md` and `./plan.md`.

## 0) Contract Lock

- [x] Lock canonical profile route: `/user/[userId]`.
- [x] Lock explicit no-`/me` decision for Phase 4.
- [x] Lock own-profile navigation behavior (authenticated id -> `/user/[userId]`).
- [x] Lock settings deprecation: standalone settings route/screen removed in Phase 4.

## 1) Routing

- [x] Add route file `apps/mobile/app/(internal)/(standard)/user/[userId].tsx`.
- [x] Register route in `apps/mobile/app/(internal)/(standard)/_layout.tsx`.
- [x] Confirm no `/me` route file exists.

## 2) Universal User Detail Screen

- [x] Implement viewer-safe user detail UI for any `userId`.
- [x] Add own-profile conditional header action for edit profile.
- [x] Add own-profile account/security/preferences/integrations sections on `/user/[userId]`.
- [x] Ensure non-own profile view omits own-only controls.

## 3) Navigation Entry Points

- [x] Update `apps/mobile/components/shared/AppHeader.tsx` avatar press to `/user/[userId]` (own id).
- [x] Update activity/feed avatar taps to target `/user/[userId]`.
- [x] Remove remaining avatar-to-settings primary navigation paths.

## 4) Settings Consolidation and Removal

- [x] Move existing settings content from `settings.tsx` into own-profile sections on `user/[userId].tsx`.
- [x] Keep existing account/security/preferences/integrations functionality unchanged.
- [x] Remove `apps/mobile/app/(internal)/(standard)/settings.tsx` and related stack route registration.
- [x] Remove all `/settings` navigation references from active mobile codepaths.

## 5) tRPC Profile Contract

- [x] Add/adjust user-detail-by-id procedure with explicit projection.
- [x] Ensure non-self requests do not return private/self-only fields.
- [x] Preserve self profile contract for own account flows.

## 6) Tests

- [x] Add route/layout test coverage for user route.
- [x] Add screen tests for own vs non-own conditional rendering.
- [x] Add navigation tests for avatar taps.
- [x] Add/adjust tRPC tests for projection and not-found behavior.

## 7) Quality Gates

- [x] `pnpm --filter @repo/trpc check-types`
- [x] `pnpm --filter mobile check-types`
- [x] `pnpm --filter @repo/trpc test`
- [x] `pnpm --filter mobile test`

## 8) Completion Criteria

- [x] All sections 0-7 complete.
- [x] `design.md` acceptance criteria satisfied.
- [x] No `/me` route in codebase.
- [x] All avatar profile navigation resolves through `/user/[userId]`.
- [x] No `/settings` route/screen usage remains in active mobile codepaths.
