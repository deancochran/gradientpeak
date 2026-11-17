# Training-plan builder: current-code audit and implementation outline

> Historical audit: activity-plan topology and adaptation findings below were superseded on 2026-09-30 by the [fixed V4 implementation specification](activity-plan-simplification-specification.md). Do not reintroduce adaptive controls from this audit. Frozen prescription and completed multisport preservation requirements remain applicable.

Date: 2026-09-14. Scope: **only F1-F6 and T1-T9** in the [initial-release specification](training-plan-ux-parity-specification.md). This is documentation of proposed changes, not implementation. Source references describe the current dirty development checkout; recheck them before editing. No DB or application source was changed during this audit.

## Superseding correction — 2026-09-17

The historical findings below are not current implementation claims. The approved current dev baseline has no persisted training-plan draft table/service. Do not create one or delete ordinary input/recording artifacts. All earlier durableDraft/table/service proposals and save-draft/resume/autosave phase requirements are superseded by [the form experience contract](form-experience-contract.md).

Keep one web `TrainingPlanEditor` and one mobile `TrainingPlanBuilderScreen` for both create/edit. Plan details only view definitions, link to activity read views, and route Edit plan to that editor. Visibility and linked-session changes save there, explicitly, with guarded Cancel and retained failed/invalid input. Remove detail-owned definition mutation state and picker sheets. Preserve copy/social/schedule/delete operations and their API authorization/idempotency. Revision fields remain transport/source metadata, not ordinary UI badges. The current correction's evidence belongs in [the form coverage ledger](form-ux-remediation.md), not these historical estimates.

## 1. Findings and priorities

| Feature | Current evidence | Required change | Priority |
| --- | --- | --- | --- |
| F1 Create | Both clients use `trainingPlans.preview/commit`; operation supports create/update/duplicate | Make template/copy enter owned editor; safe create/duplicate retries; explicit Cancel | High |
| F2 Library | Client infinite queries/search exist; server broadly retrieves then filters/slices | Authorized repository pagination/search; retain simple mine/templates UI | Medium |
| F3 Weekly editor | Mobile has week/day and individual actions; web is numeric day-offset rows | Shared bounded copy-week/span validation; web week/day presentation; composer return; partial-duration summaries | High |
| F4 Apply | Canonical resolver, revision/hash/fingerprint checks and transactions exist | Inspectable preview before commit; identify each application; handle repeated plan use correctly | Critical |
| F5 Maintain | Generic move/cancel exist; plan removal is scoped by plan/date, not application | Application-scoped future update/removal and dose replacement, protection/conflict tests | Critical |
| F6 Either app | Shared API reads and stale-save handling exist | Preserve in-memory draft/navigation; last-saved Cancel; equivalent review/error states | High |

All features are partial against the target journeys. F5's required application-aware maintenance flow is absent. Passing existing unit/component tests does not prove the specification is delivered.

### Consequential confirmed gaps

1. **Reusing one plan revision at a different date conflicts with current identity.** `packages/core/calendar/planned-session.ts:34-41` derives the key solely from plan ID, plan revision and source-session ID. `drizzle-planned-session-repository.ts:174-192` also compares original target date. A second date is neither an independent application identity nor the same immutable session; code routes this to identity conflict. This is source-traced, not newly reproduced against a database.
2. **Removal is too broad for F5.** `packages/api/src/application/training-plan/appliedScheduleUseCases.ts:67-113` selects all scheduled rows for the plan with date >= today. It can include today and different revisions/applications; it accepts no selected application or reviewed session set. It does lock rows and pass current revisions to cancellation; the missing guarantee is scope/preview protection, not absence of transactions.
3. **Application receipt is synthesized.** `appliedScheduleUseCases.ts:35-64` returns the earliest future date and `planId:revision`, not a durable identity for a distinct application. `applyTemplateUseCase.ts:459-465` uses the same receipt shape.
4. **Preview is computed but not presented as a distinct review.** Web `training-plan-detail.tsx:278-305` and mobile `useTrainingPlanTemplateSchedulingController.ts:78-120` chain preview into commit. F4 needs a user-visible diff and separate confirmation.
5. **Plan duration does not constrain session offsets.** `packages/core/schemas/training-plan-structure/domain-schemas.ts:198-248` permits optional `durationWeeks`, nonnegative offsets, and at most 366 sessions without checking every offset against the declared span.
6. **Readable does not always mean applicable under current checks.** Repository access supports accepted followers/grants (`drizzle-training-plan-repository.ts:154-190`), while application checks/candidates use owner/public/system (`applyTemplateUseCase.ts:156-174,220-235`). Align with the approved capability policy; do not simply remove authorization checks.

## 2. Preserve these foundations

- `trainingPlans.preview` and `commit` already multiplex create/update/duplicate. A new CRUD router is unnecessary.
- `projection-planning.ts:606-765` uses profile-fenced repeatable-read transactions and checks expected revision/hash for updates. Keep this path authoritative.
- `applyTemplateUseCase.ts:322-468` re-resolves, checks fingerprint/evidence, creates frozen planned sessions, and queues provider follow-up transactionally. Extend it instead of inventing client-side prescription logic.
- `packages/core/plan/materializePlanToEvents.ts:77-136` owns date materialization and same-day source ordering despite its historical filename. Do not introduce executable event mirrors.
- `packages/api/src/routers/planned-sessions.ts:157-213` exposes revision-checked move/cancel; preserve frozen manifests when moving.
- The existing 366-session bound is the starting limit, not the previous expanded specification's 1,000-session proposal. Raise limits only with a separate justified decision.
- Existing finish-date or other supported advanced controls need not be deleted. The new core journey uses start-date anchoring and must not depend on expanding those controls.

## 3. Technical work packages

### W1 — Canonical draft edits and summaries (F3; T2/T4)

Ownership: `packages/core/plan/`, canonical structure schema, then existing web/mobile adapters.

- Add pure transforms for move, duplicate, remove, and copy-week using existing `sessions[].id`, `offset_days`, `demand`, and `activity_plan_id`. Use explicit input fresh IDs or an injected ID factory so tests stay deterministic; do not generate identity while rendering.
- Copy source range `[7*w, 7*w+6]` to destination week `d`: new offset = old offset + `7*(d-w)`. Read source from the pre-edit snapshot, so source=destination duplicates exactly once. Preserve demand/reference and relative ordering; assign fresh IDs; append deterministically beside destination sessions.
- Validate unique IDs, integer nonnegative week/offset, explicit allowed destination span, and resulting count <=366 before replacing draft state. Failure returns typed field/operation issues and leaves input untouched.
- Define span through existing `durationWeeks` when explicit: valid offsets are `< 7*durationWeeks`. For a newly created blank draft choose an explicit user-visible week count. Target-contract plans with omitted duration may derive a displayed minimum from max offset, but extension must be explicitly saved; this is not a legacy pre-cut compatibility reader. Inconsistent explicit spans fail validation. Preserve trailing empty weeks when recorded.
- Produce a shared summary view model: known duration minutes, unknown-duration count, session count, per-category versions of those fields. Use existing plan estimates/demand precedence; never replace unavailable values with zero. Distinguish estimated from authored values where present.
- Export intentional Core entry points and use them from both clients; no new recurrence model, batch edit server framework, or workflow engine.

### W2 — Builder and draft navigation (F1/F3/F6; T1/T3/T9)

Web: `apps/web/src/components/training-plan/training-plan-editor.tsx`; associated create/edit routes. Mobile: `TrainingPlanBuilderScreen.tsx`, `useTrainingPlanBuilderController.ts`, `useScheduleEditorController.ts`, `BuilderScheduleEditor.tsx`, `TrainingPlanBuilderEventCard.tsx`, `useTrainingPlanCreationService.ts`.

- Replace web flat offsets with week/day selection and action menus backed by W1. Reuse mobile's interaction concepts without copying business logic into TSX.
- Bring supported session-demand editing to web using the same canonical fields and Core validation as mobile's `TrainingPlanBuilderEventCard.tsx:416-564`: category/intent, supported target duration/load, importance, and activity reference. Keep unavailable targets explicit. Session demand asks the resolver to choose within existing authored controls; it does not author arbitrary adaptation values. Author/edit adaptation controls only in the existing activity composer on the activity definition, never as new mutable plan-session fields. Preview must prove the requested demand is supported before application.
- Add template/copy entry actions to existing detail/library routes; use current duplicate operation then enter the owned editor. Do not copy resolved prescriptions. Keep permission failures actionable.
- Hold last-saved snapshot and dirty state in the current editor/controller. Cancel with confirmation restores that snapshot; failed/stale save preserves current input. Show unsaved/saving/saved/error accurately.
- Preserve the parent editor while opening the activity picker/composer in a nested screen or modal. Return only the new activity identity, load it through authorized APIs, and attach once. Cancel closes without altering the draft. No durable draft service, offline queue, or global autosave is required.
- Guard destructive route/back navigation; browser unload may use the browser's standard unsaved-change mechanism. App process death recovery is not promised in this release.
- After successful save, invalidate exact plan/library queries. Do not overwrite dirty local input when a refetch returns a newer server revision. Offer reload or independent owned copy on conflict.

### W3 — Library query alignment (F2; T1/T8)

Ownership: `crudUseCases.ts:50-105`, `templateUseCases.ts:45-77`, repository port and `packages/api/src/infrastructure/repositories/drizzle-training-plan-repository.ts`; existing client infinite queries.

- Push authorized scope, search, stable ordering and cursor/limit into the repository query instead of broadly loading then slicing. Use a deterministic tie-breaker such as ID alongside the chosen sort key.
- Keep list and get consistent with owner/system/public/follower/grant policy. A returned plan does not automatically authorize every linked activity; inspect that at preview/commit.
- Preserve current mine/templates UI. New visibility filters, folders and card redesign are not required to close F2.
- Verify cursor boundaries on a stable fixture and behavior when records change; do not promise a global immutable catalog snapshot across independent requests without implementing one.

### W4 — Application identity and safe write retry (F1/F4/F5; T5/T7)

**Required schema/design gate:** current fields are insufficient to distinguish two applications of the same plan revision. Prepare the smallest schema proposal before implementation; do not execute a migration under this documentation task.

Proposed conceptual additions, reconciled with current tables/constraints:

- An athlete-owned application identity, distinct from plan identity, with source revision, anchor/planning timezone and current application revision.
- Planned-session source includes application identity as well as plan revision/source-session ID. Session idempotency is namespaced by application plus source revision/session identity, not only plan identity and not only mutable date.
- New-application operation ID is generated once by the client at confirmed intent and reused on retry. Same ID/payload returns the durable result; changed payload conflicts. An intentional second application uses a new ID and application identity, even at identical dates.
- Use a minimal durable write-result association for create/duplicate/apply/update/remove if existing operation infrastructure cannot provide it. Store owner, command identity, request fingerprint and result references transactionally. This is duplicate-write prevention, **not** durable undo/history restoration infrastructure.
- `projection-planning.ts` currently creates fresh plan IDs without caller operation identity for create/duplicate. Fence those writes as well as session insertion. An update retry must recognize its prior successful result before reporting the now-stale source revision.
- Update Core source schema, DB source/idempotency constraints, repository matching, API DTOs and affected fixtures together. Do not leave constraints expecting the old identity format. Repository-managed hard-cut reseeding follows the integrated specification; any hosted conversion needs separate approval.
- Preserve completed records and frozen snapshots. Older source shapes are not silently reinterpreted at runtime.

### W5 — Reviewable apply and scoped maintenance (F4/F5; T5/T6/T7/T8)

Reuse `base.ts`, `applyTemplateUseCase.ts`, `appliedScheduleUseCases.ts`, and existing lifecycle commands. Proposed DTO additions below are not claims of current endpoints:

| Operation | Required input | Review/result |
| --- | --- | --- |
| Preview new application | Source plan revision/hash, start date; selected activity evidence as existing resolver requires | Resolved sessions, full date span, warnings/unresolved reasons, existing calendar work, fingerprint |
| Commit new application | Preview inputs/fingerprint + stable operation identity | Durable application identity, session IDs/count, provider pending/failure status |
| Preview update/remove | Selected application identity/revision; requested source revision or session change | Affected/protected IDs, expected session revisions, cutoff date, replacement prescriptions if needed, fingerprint |
| Commit update/remove | Same reviewed payload + fingerprint + stable operation identity | Atomic eligible change and durable result; typed stale/forbidden/unresolved/protected conflict otherwise |

- Inspect the actual application span when querying existing work. Replace the current `today..today+800`, `limit 10_000` scan (`applyTemplateUseCase.ts:368-373`) with bounded relevant queries and explicit completeness handling; do not let truncation masquerade as no conflicts.
- Initial apply is additive. The web `replaceExisting` checkbox must not bypass review or apply broad replacement; route any update through selected-application scope instead.
- Eligibility is later than today's civil date in the authoritative planning timezone, scheduled, source/application-owned, exact reviewed revision, and not started/completed. Time advancing across midnight invalidates an affected preview when eligibility changes.
- Current session lifecycle lists scheduled/cancelled/completed, not a distinct in-progress state. Audit recording-start/completion ownership before promising protection: start/claim and replacement must share an authoritative fence or predicate. A status-only check is insufficient. Any required persistence constraint belongs in the W4 proposal.
- Update/cancel only the reviewed eligible set. Recheck source access and revisions under the transaction; a race rejects without partially replacing the confirmed set. Read-only preview must never reserve or mutate sessions.
- Shortening updates supported demand, re-resolves via the same resolver and explicitly supersedes the selected future prescription. It cannot overwrite its frozen manifest. Move uses existing lifecycle mutation and revision checks.
- Provider queueing remains transactional; delivery completion stays asynchronous. Do not rerun calendar application because delivery failed. No new device integration is introduced.

### W6 — Client review and error states (F4/F5/F6; T5-T9)

Web: `training-plan-detail.tsx:256-329`. Mobile: `useTrainingPlanTemplateSchedulingController.ts`, `TrainingPlanTemplateSchedulingDialog.tsx`, detail screen scheduling/removal actions.

- Split "Review schedule" from "Confirm apply"; hold the exact preview inputs/fingerprint. Any relevant input edit invalidates the preview. Render date range, known/unknown totals, session results, existing work and actionable blockers.
- Show saved plan revision separately from applied application. Offer Update scheduled plan and Remove scheduled plan only with selected application context. No plan-ID-only broad removal request from the new flow.
- Add future session move/shorten/cancel controls to the application view, capability-gated by server reasons. Do not mutate reusable source by accident when editing one applied session.
- Stale preview, denied access, unresolved target, network timeout and provider-pending outcomes have distinct messages. Preserve user input on failure. Retry uncertain writes with the same operation ID and reconcile the result; do not generate new intent automatically.
- Use accessible keyboard/menu alternatives on web and labeled sheets on mobile. No requirement to build drag-and-drop first.

## 4. Requirement-to-change coverage

| Objective | Work packages | Missing proof to add |
| --- | --- | --- |
| F1 / T1 | W2/W4 | Blank/template/copy reach editor; copy preserves source; retry creates one owned plan |
| F2 / T8 | W3/W5 | Paginated authorized library; inaccessible/revoked activity references cannot leak or apply |
| F3 / T2/T4 | W1/W2 | Copy-week identity/span/count tests; all single-session actions; multisport partial totals |
| F4 / T5/T7 | W4/W5/W6 | Visible review; no-context defaults; second application at another date; DST; lost response |
| F5 / T6/T7 | W4/W5/W6 | Application isolation; tomorrow-only cutoff; start/completion races; shortening freezes replacement |
| F6 / T3/T9 | W2/W6 | Composer return and Cancel; errors preserve draft; stale cross-device save; saved reload; non-drag access |

## 5. Existing tests and verification actually run

Executed on this checkout with `mise exec --` (2026-09-14):

| Command | Result | What it does not prove |
| --- | --- | --- |
| `pnpm --filter web exec vitest run src/components/training-plan` | 4 files, 13 tests passed | Full browser navigation, cross-device state, live DB application safety |
| `pnpm --filter @repo/core exec vitest run calendar/planned-session.test.ts plan/__tests__/canonical-training-plan-structure.test.ts plan/__tests__/materializePlanToEvents.test.ts` | 3 files, 35 tests passed | New copy-week/span rules or corrected application identities |
| `pnpm --filter mobile test:jest:file components/training-plan/create/__tests__/useTrainingPlanBuilderController.jest.test.tsx` | 1 suite, 3 tests passed | Real iOS/Android navigation, process lifecycle, end-to-end parity |

Existing regression locations to extend:

- Core files above; add focused pure copy-week and summary tests next to their implementations.
- `packages/api/src/application/training-plan/projection-planning.test.ts` and `.live-db.test.ts`.
- `packages/api/src/application/training-plan/__tests__/appliedScheduleUseCases.test.ts`.
- `packages/api/src/routers/__tests__/training-plans.apply-template.test.ts`.
- `packages/api/src/infrastructure/repositories/__tests__/drizzle-training-plan-repository.test.ts`.
- `packages/db/scripts/training-plan-calendar-ownership-schema.test.ts` plus relevant source/idempotency constraint tests.
- Web `training-plan-editor.test.tsx`, `training-plan-detail.test.tsx`, `training-plan-library.test.tsx`.
- Mobile `TrainingPlanBuilderScreen.jest.test.tsx`, `BuilderScheduleEditor.jest.test.tsx` and controller tests.

Not run: API/live-DB tests, app/package typechecks, browser E2E, real native journeys, provider integration, or `pnpm quality:agent`. No passing claim is made for them. They are required as appropriate during implementation. Source-traced gaps need regression fixtures before repairs; do not change assertions merely to preserve current incorrect behavior.

## 6. Implementation order and approval boundaries

1. Add regression cases for span/copy, repeated application identity, plan-only removal and read/apply permission mismatch. Confirm recording protection boundary. Submit W4's minimal schema/constraint proposal.
2. Implement W1/W2/W3 against existing canonical APIs; keep unavailable maintenance actions explicit while their backend is incomplete. This work can proceed without a new physiological system.
3. After approval, implement W4 identities/retry protection and W5 transactions/lifecycle constraints together; verify with live-DB concurrency tests before exposing new destructive maintenance.
4. Implement W6 on both clients, run T1-T9 journeys, then integration checks. Do not mark mobile/web parity from unit tests alone.

No coach/group workflows, season planner, durable draft service, undo receipts, offline outbox, export expansion, or normalization project is introduced. The critical persistence work is solely what repeated plan use and safe application-scoped maintenance require.
