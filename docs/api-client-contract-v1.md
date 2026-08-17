# API client contract v1

Status: frozen and verified for a local web and mobile migration baseline.

This document versions the migration contract, not the whole tRPC API. It records the existing
protected procedures and response DTOs for athlete state, daily load, activity ingestion status,
and planned sessions. It adds package-owned cache invalidation and mutation-retry support, but does
not migrate a client app, add a procedure, or change provider or onboarding behavior.

## Response fixtures

Import deterministic fixtures from the supported test-only package subpath:
`@repo/api/test-support/client-contract-v1`. Do not deep-import the source file. Each fixture is
parsed by the same Zod schema used at the tRPC output boundary. The suite includes every public
state for athlete-state freshness/rebuild/import, daily-load freshness/coverage, ingestion
lifecycle, planned-session source/lifecycle/cancellation/completion, mutation-receipt outcome, and
both complete and truncated planned-session ranges.

The fixture map is `API_CLIENT_CONTRACT_V1_RESPONSE_FIXTURES`; its keys are exact procedure names.
A drift test checks every name against the real router and parses every mapped value with that
procedure's response DTO. Fixtures contain no worker lease or queue data, storage paths or
credentials, provider identity or payloads, raw errors, or persistence-only identity keys.

`TRAINING_EFFECTS_CURSOR_CONTINUATION_V1_FIXTURE` and
`THRESHOLD_EVIDENCE_CURSOR_CONTINUATION_V1_FIXTURE` contain a first page with `hasMore: true`, the
canonical next request, and the terminal continuation page. The `after` cursor is copied from the
first page's final item: `(effectiveAt, activityId, activityAnalysisRevision)` for training effects
and `(observedAt, evidenceId)` for threshold evidence. Preserve the original lower bound and limit
when requesting the continuation. `PLANNED_SESSION_TRUNCATED_RANGE_V1_FIXTURE` covers the required
`truncated: true` client branch.

## Supported procedures

All procedures require an authenticated session. The requested `profileId` must be the signed-in
profile.

| Procedure | Kind | Input summary | Success result |
| --- | --- | --- | --- |
| `athleteIntelligence.getCurrentState` | query | `{ profileId }` | Current-state DTO, including freshness, rebuild/import status, revisions, coverage, and optional published baseline. |
| `athleteIntelligence.getLoadRange` | query | `{ profileId, range: { startDate, endDate } }`; 1–366 inclusive days | Ordered daily-load range DTO. |
| `athleteIntelligence.getTrainingEffects` | query | `{ profileId, fromEffectiveAt, limit?, after? }`; limit 1–100 | `{ items, hasMore }` with public training-effect explanations. |
| `athleteIntelligence.getThresholdEvidence` | query | `{ profileId, fromObservedAt, limit?, after? }`; limit 1–100 | `{ items, hasMore }` with public threshold evidence. |
| `athleteIntelligence.requestRecalculationRepair` | mutation | `{ profileId }` | Accepted repair receipt and athlete-state cache tags. |
| `activityFiles.getIngestionStatus` | query | `{ profileId, ingestionId }` | One safe ingestion-status variant. |
| `plannedSessions.range` | query | `{ profileId, range: { startDate, endDate } }`; 1–366 inclusive days | `{ items, truncated }`; up to 5,000 sessions. |
| `plannedSessions.create` | mutation | `{ profileId, session: { planningDate, source, groupEventId?, prescription } }` | Planned-session mutation receipt. |
| `plannedSessions.move` | mutation | `{ profileId, sessionId, expectedRevision, planningDate }` | Updated planned-session receipt. |
| `plannedSessions.cancel` | mutation | `{ profileId, sessionId, expectedRevision, reason? }`; public reason is `user_requested` | Updated planned-session receipt. |
| `plannedSessions.linkCompletion` | mutation | `{ profileId, sessionId, expectedRevision, activityId }` | Updated planned-session receipt. |
| `plannedSessions.linkGroupEvent` | mutation | `{ profileId, sessionId, expectedRevision, groupEventId }` | Updated planned-session receipt. |
| `plannedSessions.unlinkGroupEvent` | mutation | `{ profileId, sessionId, expectedRevision, groupEventId }` | Updated planned-session receipt. |

The fixtures are the canonical examples for nested source, prescription, lifecycle, cursor, and
response fields. Clients must not depend on fields absent from those DTOs.

## Mutation receipts and cache tags

`athleteIntelligence.requestRecalculationRepair` returns:

- `status: "accepted"`;
- the `profileId`;
- `cache_tags`: `athleteIntelligence.getCurrentState`,
  `athleteIntelligence.getLoadRange`, `athleteIntelligence.getThresholdEvidence`,
  `athleteIntelligence.getTrainingEffects`, and `home.getDashboard`.

Every `plannedSessions` mutation returns:

- `outcome`: `created`, `unchanged`, or `updated`;
- the complete public `session` DTO;
- `cache_tags`: `plannedSessions.range`, `calendar.range`, `calendar.day`,
  `trainingPlans.getPlanningLedger`, `trainingPlans.getPlanTabProjection`, `trainingPlans.get`,
  `trainingPlans.list`, `activityPlans.getById`, `activities.getById`,
  `activities.listPaginated`, and `home.getDashboard`.

For `plannedSessions.create`, a first application returns `created`; an idempotent replay can return
`unchanged`. The other planned-session mutations return `updated` on success.

Clients must pass the receipt directly to
`invalidateReceiptCacheTags(queryClient, receipt)` from `@repo/api/client`. The package maps every
tag to the existing tRPC Query key prefix `[[routerName, procedureName]]` and calls TanStack Query's
`invalidateQueries`. Omitting input from the prefix intentionally invalidates every cached input for
that procedure. `API_CACHE_TAG_QUERY_KEYS` and `queryKeysForCacheTags` are exported for tests and
advanced composition; clients do not maintain a second tag map.

## Finite expected errors

Branch on the tRPC code, not the message. Messages are safe for display but are not versioned
machine identifiers.

| Code | Meaning in this contract | Client action |
| --- | --- | --- |
| `BAD_REQUEST` | Input failed the strict DTO, date/range, cursor, or other request validation. The error response includes field validation details when Zod rejected the input. | Fix the request; do not retry unchanged input. |
| `UNAUTHORIZED` | No valid signed-in session. | Restore authentication before retrying. |
| `FORBIDDEN` | The profile or referenced activity plan, training plan, group event, activity, session, or ingestion is not available to the actor. | Do not retry unchanged input. |
| `NOT_FOUND` | Athlete state, ingestion, or planned session is unavailable or missing where that procedure supports a missing result. | Refetch parent state or return to the previous screen; do not loop. |
| `CONFLICT` | A planned session changed, its immutable source identity conflicts, or its current lifecycle rejects the mutation. | Follow the planned-session conflict flow below. |

The shared transport can also return `PRECONDITION_FAILED` for an unsupported client contract epoch,
`TOO_MANY_REQUESTS` for rate limiting, or an unexpected server/network failure. Those are transport
conditions rather than domain outcomes.

## Retry guidance

- Queries may be retried after transient network or server failures with bounded backoff. Respect
  the server's retry delay for `TOO_MANY_REQUESTS`.
- The shared `createQueryClient` mutation default is `retry: false`. A timeout or lost response can
  occur after the server committed a write, so conflict-sensitive and other ordinary mutations are
  never replayed automatically.
- A caller may explicitly spread `IDEMPOTENT_INGESTION_MUTATION_RETRY_OPTIONS` from
  `@repo/api/client` into a mutation only when the ingestion operation is proven replay-safe and the
  retry reuses the same operation/business identity. This allows one retry after one second. It is
  not a general mutation retry policy.
- Do not automatically retry `BAD_REQUEST`, `FORBIDDEN`, or `NOT_FOUND` with unchanged input.
- A repair request is coalesced server-side. After an ambiguous network result, refetch current
  state before presenting another repair action.
- A planned-session create is keyed by its supplied source. Reuse the same source identity when
  retrying the same logical create; a replay may return `unchanged`.
- After an ambiguous planned-session write, refetch the range before deciding whether another write
  is needed.

## Direct-ingestion status

`activityFiles.getIngestionStatus` is read-only. It does not expose worker claim, lease,
cancellation, scheduler, storage, or provider-retry operations.

- `awaiting_upload` and `processing` are active; polling may continue.
- `succeeded` is terminal and includes non-null `activityId` and `artifactId`.
- `failed_terminal` is terminal and cannot be retried through this procedure.
- `failed_retryable` is terminal for the current attempt and is the only state with
  `actions.retry: true`. Retry happens by resubmitting the existing source-specific request and
  business identity; there is no `retryIngestion` client procedure.
- Provider-sourced status is display-only for clients. Provider retry remains service-owned.

Polling cadence is deliberately not part of this response contract. Clients should stop polling on
all terminal states and use bounded backoff while a status is active.

## Planned-session revision conflicts

`move`, `cancel`, `linkCompletion`, `linkGroupEvent`, and `unlinkGroupEvent` require the last
observed positive `expectedRevision`. A stale revision returns `CONFLICT`; the error does not expose
the newer revision. Refetch `plannedSessions.range`, replace the local session with the returned
DTO, and ask for or apply fresh user intent before submitting another mutation. Never increment a
revision locally or blindly replay a conflicting write.

## Freeze checks

- Every fixture parses through its public response DTO.
- The supported test-only package subpath exports the fixtures without a source-file deep import.
- The fixture procedure map uses real procedure names and the correct response DTO for every value.
- Cursor continuation and planned-session truncation branches have deterministic fixtures.
- Every server cache tag maps to the existing tRPC Query key and the receipt helper invalidates all
  matching cached inputs.
- Ordinary mutations execute once after an ambiguous failure; the explicit idempotent-ingestion
  policy allows exactly one replay.
- Fixtures cover every relevant public lifecycle union.
- DTOs reject representative worker, storage, provider, and persistence-private fields instead of
  silently stripping them.
- API typecheck, tests, and formatting pass under Node 24.11.1.

Known contract boundary: planned-session `CONFLICT` intentionally carries only the finite tRPC code
and safe message, not a typed conflict reason or current revision. Clients must refetch. This is
fully specified above and does not block the v1 client migration.
