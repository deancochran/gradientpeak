# Technical Implementation Plan - Phase 4 User Identity and Profile Refactor

Date: 2026-02-27
Status: Ready for implementation
Owner: Mobile + Backend + QA
Inputs: `design.md`

## 1) Architecture and Ownership

- `apps/mobile`:
  - add canonical user route `/user/[userId]`
  - migrate standalone settings content into own-profile sections
  - remove standalone settings route/screen
  - wire avatar navigation across app surfaces
- `packages/trpc`:
  - provide explicit user detail read contract
  - ensure viewer-safe projection for non-self profile reads

## 2) Contract Lock Before Implementation

Lock these decisions before coding begins:

1. Canonical profile route is `/user/[userId]` only.
2. No `/me` route exists in Phase 4.
3. Own profile is navigated by passing authenticated id to `/user/[userId]`.
4. Standalone settings route is removed; all prior settings capability is available on own `/user/[userId]` view.

## 3) Workstreams

### A) Routing and Navigation

- Add route file `apps/mobile/app/(internal)/(standard)/user/[userId].tsx`.
- Register route in `apps/mobile/app/(internal)/(standard)/_layout.tsx`.
- Update app header avatar action to push authenticated user id into `/user/[userId]`.
- Update other avatar entry points to push target user id into `/user/[userId]`.

### B) Universal User Detail Screen

- Implement user detail UI for any user id.
- Add own-profile conditional controls (edit profile, account/security/preferences/integrations sections).
- Keep other-user view free of own-only account controls.

### C) Settings Consolidation and Removal

- Move account/security/preferences/integrations controls from `settings.tsx` into own-profile sections on `/user/[userId]`.
- Remove `apps/mobile/app/(internal)/(standard)/settings.tsx` route/screen and stack registration.
- Update all navigation references that push `/settings` to target own `/user/[userId]` sections.

### D) API Contract Hardening

- Add/adjust profile query for user detail by id with explicit field projection.
- Ensure self-only fields are not returned in non-self context.
- Keep response shape stable for mobile screen consumption.

## 4) Validation and Quality Gates

- `pnpm --filter @repo/trpc check-types`
- `pnpm --filter mobile check-types`
- `pnpm --filter @repo/trpc test`
- `pnpm --filter mobile test`

## 5) Test Strategy

- Route registration tests for `/user/[userId]`.
- Screen tests for own vs non-own conditional controls.
- Navigation tests for header avatar and activity/feed avatars.
- Router tests for explicit public projection and not-found behavior.

## 6) Rollout Notes

- Migrate navigation entry points first, then consolidate settings content into own-profile sections.
- Remove settings route in same phase once content parity is verified.
- Remove temporary compatibility code after all profile entry paths use `/user/[userId]`.
