# Tasks - Phase 1 Foundation & Infrastructure

Last Updated: 2026-02-25
Status: Active
Owner: Mobile + Backend + Platform + QA

Implements `./design.md` and `./plan.md`.

## Phase A - Server Configuration & Self-Hosting

- [ ] Audit all mobile hardcoded backend URL usage and startup assumptions.
- [ ] Define source-of-truth config module for server base URL.
- [ ] Add small collapsible server URL input to existing login screen.
- [ ] Add small collapsible server URL input to existing signup screen.
- [ ] Pre-fill official hosted default URL in server field.
- [ ] Persist selected URL securely on-device.
- [ ] Gate API client initialization on resolved persisted server URL.
- [ ] Route all auth requests through configured base URL.
- [ ] Route all non-auth API requests through configured base URL.
- [ ] Remove hardcoded fallback URL behavior from runtime paths.
- [ ] Keep server configuration scoped to login/signup only (no new auth route, no settings flow).
- [ ] Verify backend runtime config is fully env-driven (including CORS/email).
- [ ] Verify/ship single-command local deployment path for self-hosting.

## Phase B - Navigation Architecture Stabilization

- [ ] Audit all navigation triggers that can fire while overlay is open.
- [ ] Audit all routes currently allowing duplicate stack entries.
- [ ] Create route behavior matrix (push vs replace vs modal).
- [ ] Refactor overlay flows to dismiss first and navigate only after close completion.
- [ ] Prevent concurrent close+navigate dispatch in all affected flows.
- [ ] Update non-self-stacking destinations to replacement semantics.
- [ ] Add guards for rapid repeated navigation triggers.
- [ ] Align modal routes with Expo Router modal presentation conventions.
- [ ] Validate back-gesture dismissal for modal routes.
- [ ] Validate modal context isolation across unrelated navigation transitions.

## Validation - End-to-End

- [ ] Validate login/signup default behavior: hosted server used when override is collapsed/untouched.
- [ ] Validate login/signup self-host behavior: expanding override and setting URL routes auth to custom server.
- [ ] Validate login/signup/refresh/data calls against configured hosted default.
- [ ] Validate same flows against custom self-host URL.
- [ ] Validate no orphan overlay remains after navigation in audited flows.
- [ ] Validate no duplicate stack entries for protected routes under rapid taps.
- [ ] Validate modal routes dismiss correctly with back gesture.
- [ ] Validate self-host stack starts from repo with env config + one command.

## Quality Gates

- [ ] `pnpm --filter @apps/mobile check-types`
- [ ] `pnpm --filter @apps/mobile test`
- [ ] `pnpm check-types`
- [ ] `pnpm lint`
- [ ] `pnpm test`

## Definition of Done

- [ ] Phase 1 acceptance criteria in `design.md` are all satisfied.
- [ ] No known Phase 1 blockers remain for Phases 2+.
