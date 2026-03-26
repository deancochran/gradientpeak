# Risk And Blocker Matrix

## Purpose

Track the main risks that could slow or complicate the replatform.

## Risks

| Risk | Impact area | Why it matters | Mitigation needed |
| --- | --- | --- | --- |
| Better Auth changes session behavior | auth, web, mobile | current flows are Supabase-auth-shaped | define exact session/cookie/bootstrap model early |
| Drizzle migration ownership is ambiguous | DB, API | dual schema truth creates long-term drift | define one authoritative migration path |
| Next.js runtime assumptions leak into shared code | web, UI | makes TanStack Start migration harder | keep framework code inside `apps/web` |
| `packages/trpc` vs `packages/api` remains unresolved too long | API, imports | slows client/package migration planning | make explicit bridge decision early |
| `packages/supabase` keeps too much ownership | DB, infra | blurs ORM vs platform boundaries | define retained infra-only scope clearly |
| mobile auth regressions | mobile, auth | Expo cannot inherit web-only auth assumptions | keep a separate mobile auth behavior map |

## Blockers To Resolve

| Blocker | Needed decision |
| --- | --- |
| API package final name | `packages/trpc` vs `packages/api` |
| Supabase package final location | keep under `packages/` vs move to `infra/` |
| migration strategy | convert legacy SQL history vs establish forward Drizzle baseline |
| web auth model | exact Better Auth cookie/session flow in TanStack Start |
| mobile auth model | exact Better Auth-compatible Expo bootstrap/deep-link flow |

## Completion Condition

- all listed blockers have an explicit decision in the decision log
