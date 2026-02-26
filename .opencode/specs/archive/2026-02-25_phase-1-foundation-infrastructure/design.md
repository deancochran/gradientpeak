# Phase 1 Specification - Foundation & Infrastructure

Date: 2026-02-25
Owner: Mobile + Backend + Platform
Status: Proposed
Type: Foundation infrastructure + navigation stabilization

## Executive Summary

Phase 1 establishes the baseline required for all subsequent roadmap phases:

1. User-configurable backend connectivity for true self-hosting and open-source distribution, implemented directly on existing login/signup screens.
2. Deterministic navigation behavior that prevents overlay persistence and duplicate stack entries.

This phase is complete only when the app can target any valid backend instance without source edits and navigation behavior is stable under normal and rapid user interaction.

## Problem Statement

- Mobile app connectivity currently depends on fixed backend assumptions.
- Authentication and API workflows are coupled to a non-user-configurable destination.
- Overlay-driven surfaces can remain visible after route transitions.
- Duplicate routes can be pushed into stack flows that should not self-stack.

These issues create hard blockers for self-hosting, feature scalability, and predictable UX.

## Goals

1. Add a minimal collapsible server URL override in the existing login/signup UI.
2. Ensure configured server URL is loaded before API initialization.
3. Route all API operations through configured URL with no hardcoded fallback.
4. Keep default auth behavior pointed at deployed hosted server unless user explicitly expands and changes server URL.
5. Ensure backend deployment and runtime behavior are fully environment-driven.
6. Enforce navigation sequencing: dismiss overlay first, then navigate.
7. Prevent duplicate stack entries for non-self-stacking routes.
8. Standardize modal routes using Expo Router modal conventions.

## Non-Goals

- No new pre-auth route, wizard, or standalone server-setup screen.
- No schema redesigns for later-phase feature requirements.
- No new navigation framework or custom router implementation.

## Scope

### In Scope

- Mobile server URL UX and persistence within existing login/signup screens.
- API client bootstrap sequencing and base URL resolution.
- Auth token/session reset on server change.
- Backend env-based configurability for CORS and email-related runtime behavior.
- Single-command local deployment artifacts for self-hosting.
- Navigation and overlay flow corrections across existing screens.

### Out of Scope

- Metrics engine work (Phase 2).
- Calendar/data model work (Phases 3+).
- Coaching/messaging/notification features.

## Functional Requirements

## 1.1 Self-Hosted Server Architecture & Mobile Auto-Login

### FR-1: Login/signup inline server override

- Login and signup screens include a small, minimal, collapsible "Server URL" section.
- Collapsible section is collapsed by default for standard users.
- Default behavior (collapsed, untouched) uses official hosted deployment URL.
- Self-hosting users can expand, enter custom URL, and continue auth on that server.

### FR-2: Secure persistence and startup ordering

- Selected URL must be securely stored on-device.
- Stored URL must be loaded before API client initialization.
- App startup must not issue API calls until configured URL is resolved.

### FR-3: Universal configured-base usage

- All API traffic uses configured URL:
  - auth
  - token refresh
  - signup/registration
  - domain data operations
- No hardcoded fallback URL remains in mobile call paths.

### FR-4: Auth-surface scoped server editing

- Server URL editing for this phase is scoped to login/signup surfaces only.
- No new settings/profile server-management flow is required in this phase.

### FR-5: Self-host-ready backend runtime

- Backend runtime config is environment-driven.
- CORS and email behavior contain no hardcoded deployment values.
- Repository includes one-command local deployment path (for full stack bootstrap).

## 1.2 Navigation Architecture Fixes

### FR-6: Overlay-safe navigation sequencing

- Any open modal/sheet/popup/drawer must finish dismissal before navigation starts.
- Close and navigation must not fire simultaneously.
- Navigation dispatch should occur in close callback or confirmed post-close state.

### FR-7: Duplicate navigation prevention

- Root/tab-level destinations that should not self-stack must use replacement semantics.
- Rapid repeated taps must not cause duplicate navigation events.
- Stack should contain only one active instance for non-duplicable screens.

### FR-8: Expo Router modal alignment

- Modal routes must use Expo Router modal presentation conventions.
- Back gestures should dismiss relevant modal route naturally.
- Modals must not leak across unrelated navigation contexts.

## Non-Functional Requirements

- Reliability: navigation behavior remains deterministic under rapid interaction.
- Security: auth/session boundaries reset correctly when server authority changes.
- Maintainability: no custom navigation subsystem introduced.
- Portability: self-host setup requires environment changes, not source edits.

## Dependencies and Ordering

1. Mobile URL bootstrap correctness must land before broad auth/API validation.
2. Navigation audit must precede route-specific fixes.
3. Overlay sequencing fixes should land before expanded modal-heavy feature work.

## Risks and Mitigations

- Risk: hidden hardcoded URLs remain in low-traffic paths.
  - Mitigation: repository-wide endpoint/base URL audit with explicit checklist.
- Risk: race conditions during startup URL load.
  - Mitigation: gate API init behind resolved config state.
- Risk: navigation regressions from broad route changes.
  - Mitigation: codify route-by-route ownership and targeted regression tests.

## Acceptance Criteria

1. Login and signup default to deployed hosted server with no extra setup step.
2. Login and signup expose a collapsible server URL input for self-host users.
3. API base URL is derived from persisted config in all request paths.
4. Backend local self-host deployment runs with env configuration only.
5. No orphaned overlays remain after route transitions.
6. Non-self-stacking screens do not duplicate in the navigation stack.
7. Modal routes follow Expo Router conventions and dismiss correctly.

## Exit Criteria for Phase 1

- All functional and acceptance criteria pass in QA.
- Known navigation defects in this phase are resolved and verified.
- Self-host auth entry flow is production-usable from existing login/signup UI without source edits.
