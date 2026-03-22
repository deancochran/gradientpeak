---
name: provider-integrations
description: OAuth callbacks, token sync, webhooks, and provider data mapping for external integrations
---

# Provider Integrations Skill

## When to Use

- Working on third-party provider flows such as Strava, Garmin, Wahoo, TrainingPeaks, or Zwift
- Editing OAuth callback handlers, token refresh logic, webhook handling, or sync services
- Mapping provider payloads into shared activity, plan, or event contracts

## Scope

This skill covers cross-provider integration patterns.

- Use `strava-api-expert` for Strava-specific behavior.
- Use `backend` for general tRPC or server procedure work.
- Use `integration-analyst` for research-heavy API investigation.

## Rules

1. Keep provider-specific logic isolated behind clear mapping boundaries.
2. Treat OAuth, token refresh, and webhook verification as security-sensitive paths.
3. Preserve idempotency for callbacks, imports, and sync jobs.
4. Normalize external payloads into shared repo contracts before wider use.
5. Keep retry, reconciliation, and failure states explicit.

## Repo-Specific Guidance

- Integration routers and services live primarily under `packages/trpc/src/routers/` and related integration libraries.
- Web callback entrypoints should stay thin and pass normalized data into backend-owned flows.
- Shared event and activity contracts should remain the stable boundary for provider data.

## Avoid

- mixing provider-specific payload assumptions into shared schemas
- hiding token or webhook failures
- non-idempotent sync behavior
- duplicating provider mapping logic across routes and services

## Quick Checklist

- [ ] provider boundary is explicit
- [ ] oauth/webhook security path preserved
- [ ] idempotency considered
- [ ] shared contract mapping stays centralized
