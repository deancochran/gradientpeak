# Technical Implementation Plan - Phase 1 Foundation & Infrastructure

Date: 2026-02-25
Status: Ready for implementation
Owner: Mobile + Backend + Platform
Inputs: `design.md`

## 1) Implementation Intent

Implement Phase 1 as two coordinated workstreams:

1. Server configurability and self-hosting readiness.
2. Navigation architecture stabilization.

The implementation must be additive and align with existing Expo Router and backend runtime patterns.

## 2) Guardrails

1. No hardcoded runtime backend assumptions in mobile API layer.
2. No custom navigation framework; use Expo Router/React Navigation best practices.
3. No partial override behavior; auth requests must consistently use either hosted default or explicit override URL.
4. No broad unrelated refactors while resolving Phase 1 defects.

## 3) Workstream A - Server Configuration & Self-Hosting

### A0 - Current-state audit

- Inventory all hardcoded URLs and endpoint base assumptions.
- Map app bootstrap sequence from launch to first API call.
- Identify existing persisted auth/config storage and load order.

Deliverable:

- Audit checklist with file-level references and replacement path.

### A1 - Login/signup inline server override

- Add a small collapsible server URL section directly in existing login/signup screens.
- Keep the override collapsed by default.
- Keep official hosted server as default when field is untouched.
- Persist accepted URL securely.

Deliverable:

- Login/signup can authenticate immediately to hosted default, or custom URL when override is expanded and set.

### A2 - API bootstrap and universal base URL adoption

- Initialize API client only after persisted URL is resolved.
- Route all auth + data calls through configured base URL.
- Remove hardcoded fallback behavior.

Deliverable:

- Base URL resolution utility + startup guard used by all request clients.

### A3 - Scope guard: no new server config routes

- Do not add standalone pre-auth server setup route.
- Do not add profile/settings server mutation flow in this phase.
- Keep server selection UX constrained to login/signup pages.

Deliverable:

- Existing auth routes remain primary entry points with inline advanced server override.

### A4 - Backend runtime and deployment readiness

- Validate all backend runtime assumptions are env-configurable.
- Ensure CORS/email delivery settings are env-driven.
- Provide/confirm one-command local stack startup artifacts.

Deliverable:

- Self-host run path from clean clone using env template + single startup command.

## 4) Workstream B - Navigation Architecture Fixes

### B0 - Navigation defect audit

- Identify overlay-triggered navigation actions.
- Identify routes susceptible to duplicate stack insertion.
- Classify route intent: push, replace, modal presentation.

Deliverable:

- Route behavior matrix with required action per entry point.

### B1 - Overlay dismissal sequencing

- Refactor open-overlay actions to close first, navigate on close completion.
- Prevent concurrent close+navigate dispatch.

Deliverable:

- Shared safe-navigation pattern or utility adopted in overlay flows.

### B2 - Duplicate stack prevention

- Replace push with replace where self-stacking is invalid.
- Add re-entry guards/debouncing for rapid-tap controls.

Deliverable:

- Verified single-instance behavior for protected routes.

### B3 - Modal route normalization

- Ensure modal routes conform to Expo Router modal conventions.
- Validate back-gesture dismissal and context isolation.

Deliverable:

- Consistent modal behavior across app navigation contexts.

## 5) Execution Order

1. A0 + B0 audits (parallel)
2. A1 + A2 login/signup override and API base URL corrections
3. B1 + B2 + B3 navigation corrections
4. A3 scope validation
5. A4 self-host deployment finalization
6. End-to-end QA and regression validation

## 6) Test Strategy

### Mobile

- Login/signup defaults to hosted server when server override remains collapsed.
- Login/signup allows custom server URL via collapsible override.
- Auth/login/signup/refresh routes all hit configured URL.
- Overlay-close-before-navigation behavior holds across affected screens.
- Rapid tap tests do not duplicate protected routes.
- Modal back gestures dismiss correctly.

### Backend/Platform

- Runtime config loaded exclusively from env.
- CORS and email behavior validated for self-host values.
- Local deployment startup succeeds via one command.

## 7) Quality Gates

```bash
pnpm --filter @apps/mobile check-types
pnpm --filter @apps/mobile test
pnpm check-types
pnpm lint
pnpm test
```

## 8) Definition of Done

1. Mobile supports configurable backend URL from login/signup via collapsible advanced override.
2. No hardcoded URL fallback remains in runtime API paths.
3. Navigation defects (orphan overlays, duplicate stacking) are resolved.
4. Modal routing follows Expo Router conventions.
5. Self-host deployment path is documented and operational from repo.
