# Phase 4 Specification - User Identity and Profile Refactor

Date: 2026-02-27
Owner: Mobile + Backend + QA
Status: Draft (implementation-ready)
Type: Mobile navigation and profile surface refactor

## Executive Summary

Phase 4 introduces a single universal user detail screen that can render any user profile and subsumes current settings functionality for the authenticated viewer.

This phase is a navigation and surface responsibility refactor, not a social-graph feature launch.

## Scope

### In Scope

- Add one canonical profile route for all users: `/user/[userId]`.
- Route all avatar-driven user navigation to `/user/[userId]`.
- Split concerns within one route:
  - public-facing profile details (always visible on user detail)
  - private account/settings controls (visible only on own profile)
- Own-profile conditional UI on the same user detail route:
  - show edit profile control
  - show account/security/preferences/integrations sections
- Deprecate and remove standalone settings route/screen.
- Keep all existing settings capabilities accessible on own profile.

### Out of Scope

- New follower/coach roster features.
- Messaging, notifications UI.
- New social privacy model beyond safe data projection required for user detail display.

## Route Contract (Locked)

1. There is exactly one user detail route: `/user/[userId]`.
2. No `/me` route is introduced in Phase 4.
3. Own profile navigation always resolves by passing the authenticated user id into `/user/[userId]`.
4. User detail rendering logic is implemented once and reused for self and non-self users.
5. Standalone settings route/screen is removed in this phase.

## Problem Statement

- Current profile entry points route users to a settings screen.
- That pattern does not scale to multi-user navigation where any user avatar should open that specific user's profile.
- Current contracts do not clearly separate public profile data from private/self-only controls.

## Required Outcomes

1. Any avatar tap in app surfaces navigates to `/user/[userId]` for that user.
2. User detail screen always shows profile content for the target user.
3. Own-only controls appear only when viewing own profile (`viewerId === userId`).
4. Existing settings capabilities are available in own-profile sections and standalone settings is removed.
5. Public-by-id data contracts return only fields intended for cross-user display.

## Functional Requirements

### A) Universal User Detail Screen

- Accept route param `userId` and fetch target user profile.
- Display profile identity and summary content in a viewer-safe format.
- Provide consistent loading, empty, and not-found behavior.

### B) Own vs Other Conditional Behavior

- If target `userId` equals authenticated user id:
  - show edit profile action in header
  - show account/security/preferences/integrations sections
- If not own profile:
  - do not render own-only account actions

### C) Settings Content Consolidation

- Account/security/preferences/integrations content currently in settings must be moved to own-profile sections on `/user/[userId]`.
- Standalone settings route/screen must be removed.
- No loss of existing settings capability is allowed.

### D) Navigation Consistency

- Shared header avatar routes to own `/user/[userId]`.
- Activity/feed/profile avatars route to target `/user/[userId]`.
- Avoid duplicate route aliases for the same conceptual screen.

### E) API Contract Hardening

- Self profile query can remain full-contract for own use.
- Public user-by-id contract must be explicit projection (no wildcard field selection in final state).
- User detail screen should consume a stable response shape suitable for both self and other-user views.

## Non-Functional Requirements

- Keep route architecture minimal (single canonical profile route).
- Maintain Expo Router stack behavior and back gesture consistency.
- Preserve type safety across mobile and tRPC contracts.
- Ensure no regressions in settings capability after consolidation.

## Acceptance Criteria

1. Canonical route `/user/[userId]` is implemented and used everywhere profile navigation occurs.
2. No `/me` route exists in mobile route tree or navigation helpers.
3. Avatar in app header opens own profile by passing authenticated id to `/user/[userId]`.
4. Other-user avatar taps open that user's profile via `/user/[userId]`.
5. Own profile shows edit/settings controls; other profiles do not.
6. Standalone settings route/screen is removed and own-profile view preserves all prior settings capabilities.
7. Public profile API contract is explicit and viewer-safe.

## Exit Criteria

- `tasks.md` checklist complete.
- Route and behavior tests for own/other profile pass.
- No remaining settings route/screen usage in active mobile app codepaths.
