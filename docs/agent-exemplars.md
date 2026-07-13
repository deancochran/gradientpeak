# Agent implementation exemplars

This catalog maps recurring task shapes to current production patterns. It is not a claim that every line in these files is ideal. Copy the listed behavior, observe its tests, and keep the owning package boundary intact.

`pnpm check:guidance` verifies every local exemplar link and rejects a deprecated target unless this catalog documents a specific exception.

## Cross-package ownership

| Task shape | Copy this behavior | Exemplar |
|---|---|---|
| Reusable domain contract or deterministic calculation | Define a Zod-first, framework-neutral Core contract and inferred type for reuse across surfaces. | [Athlete intelligence model contracts](../packages/core/athlete-intelligence/model-input-contracts.ts) |
| API transport procedure and DTO | Keep transport request/response DTOs and validation in API, keep the router thin, then invoke application orchestration. | [Athlete intelligence router](../packages/api/src/routers/athlete-intelligence.ts) |
| Transactional multi-write | Compose writes in one application-owned transaction and test commit behavior. | [Submit activity use case](../packages/api/src/application/activities/submit-activity.ts) |
| Separated API read orchestration | Keep persistence behind a repository contract and assemble the result in application code. | [Feed read use case](../packages/api/src/application/feed/readFeed.ts) |
| DB migration safety | Use the guarded, immutable migration workflow rather than manual ledger/artifact changes. | [Migration workflow](../packages/db/scripts/migration-workflow.ts) |

## Mobile

| Task shape | Copy this behavior | Exemplar |
|---|---|---|
| API-derived mobile data | Infer the API result once and expose a focused app-level alias/view model. | [Group API aliases](../apps/mobile/lib/groups/types.ts) and [group list view model](../apps/mobile/lib/groups/useGroupListViewModel.ts) |
| Accessible action | Supply a role, label, and disabled/busy state through the reusable action primitive. | [Header action](../apps/mobile/components/shared/HeaderAction.tsx) |
| Query-backed list lifecycle | Distinguish loading, error with retry, empty, refresh, and data states. | [Notifications screen](../apps/mobile/app/(internal)/(standard)/notifications/index.tsx) |

Mobile UI changes also require retained Maestro/manual video evidence under the coordination policy, or the exact declared risk `mobile video evidence local-only/deferred`.

## Web and shared UI

| Task shape | Copy this behavior | Exemplar |
|---|---|---|
| Protected route boundary | Resolve session/gating in the route boundary, not after rendering a page. | [Protected route](../apps/web/src/routes/_protected.tsx) |
| Query-backed route lifecycle | Prevent failed data from rendering as an empty state. | [Recording route list](../apps/web/src/routes/_protected/record/route/index.tsx) |
| Accessible web form field | Use stable IDs and connect label, description, error, and invalid state. | [Web form registry](../packages/ui/src/registry/web/form.tsx) |
| Shared semantic field form | Use React Hook Form/Zod with shared wrappers and root error handling. | [Activity-effort form](../apps/web/src/components/protected/activity-effort-form.tsx) |

## Before copying an exemplar

1. Confirm the exemplar's owner matches the task's owner in the product root `AGENTS.md`.
2. Read its nearest test before implementing similar behavior.
3. Copy contracts and state boundaries—not incidental naming, styling, feature flags, or product copy.
4. If no exemplar fits, stop and request a design/ownership decision instead of copying a weak nearby pattern.
