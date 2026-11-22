# Step-first activity plans: implementation plan

Status: Implementation in progress directly in `.worktrees/dev`; no database reset executed.
Authority update: user authorized fresh-development baseline replacement, and explicitly
permits refactoring related uncommitted code. All subsequent implementation is dev-only,
single writer. No permission for hosted/shared/production actions or commits is inferred.
Core V5 schema, catalogue and reviewed recording contracts pass Node 24.19 typecheck
and 2,325 tests (one skipped). API: 2,104 tests and typecheck passed. Web: 889 tests,
six script tests, typecheck passed; production build passed before final recovery hardening.
Mobile: typecheck, Vitest and native Jest passed (1,399 native tests, two baseline skips).
Fresh SQL baseline is implemented; 509 differential Core/SQL cases and reviewed manifest
regressions pass on disposable targets. Final full DB and repository gates are pending.
Native same-list drag callbacks are tested; cross-repeat movement uses explicit destinations.
No physical device is connected, so native gesture rendering is not verified.
Date: 2026-10-11. Target checkout: `.worktrees/dev`.
Inspected HEAD: `2a0f32794c78c606c2f2c24d1ea29c3b8b400911`, with extensive uncommitted work.

## 1. Decision, scope, and authority

User-approved direction: replace mandatory interval/block containers with an ordered
`Step | Repeat` sequence. Repeats contain steps only, never repeats. This is a canonical
cross-package contract replacement, not a projection layered on V4.

This document now tracks the authorized implementation. Verification status above records
completed checks, not production deployment or ordinary development database reset.

The user permits reset rather than data migration when needed. Plan a fresh-development
cutover: no V4 backfill, dual-read API, legacy importer, historical conversion service,
or preservation of disposable development DB rows. No hosted/shared/production reset,
deployment, publication, or unrelated cleanup is authorized. Confirm the actual guarded
repository-managed local target before executing a later reset; never infer it from an
available connection or MCP server.

This plan supersedes the mandatory `blocks -> steps` topology and interval-sheet UX in
`activity-plan-simplification-specification.md` for this workstream. Preserve its fixed,
single-sport model, existing target semantics, authorization, and completed-multisport
ingestion requirements. Do not modify the older specification's historical evidence.

## 2. Target contract

Conceptual shape; implementation must define Zod contracts first and infer TS types:

```ts
type Step = {
  type: "step";
  id: string;
  name?: string;
  instructions?: string;
  duration: Duration;
  targets: Target[];
};
type Repeat = {
  type: "repeat";
  id: string;
  count: number;
  steps: Step[];
};
type Structure = {
  version: 5;
  activity_category: ActivityCategory;
  items: (Step | Repeat)[];
};
```

V5 is the proposed new discriminator, not a commitment to support V4. Reusing V4 for
an incompatible shape would conceal stale payloads. Keep workout-level metadata where
it already belongs. Do not introduce repeat name/description, interval names, generic
container nodes, per-step sports, or arbitrary recursion.

Recommended behavior decisions for implementation:

- A saved workout has at least one item. A saved repeat has at least one step and an
  integer count from 2 through 50; count means total executions, not additional loops.
- A one-step repeat is valid. Performing a sequence once is represented by ordinary
  steps; an explicit **Ungroup** action expands the entire repeated sequence into
  standalone steps, preserving prescribed dose and assigning fresh IDs to copied steps.
- Preserve existing duration variants, unit precision, nullable draft semantics,
  target compatibility/default rules, max three targets, uniqueness, max one objective,
  and strength-step repetition/RPE rules. Strength reps are not repeat count.
- IDs are globally unique across steps and repeats. Moving preserves IDs; duplicating
  creates fresh IDs for the copied group and every child. Array order is authoritative;
  do not also persist order indexes, parent IDs, or index-based repeat pointers.
- Proposed limits preserve present safety bounds: 1,000 top-level items, 20 steps per
  repeat, 50 executions per repeat, 1,000 expanded occurrences, 1 MiB JSON, and the
  existing explicit-time and per-step quantity limits. Standalone steps are not
  artificially limited to 20. Validate limits before allocating expanded output.
- Strict validation rejects nested repeats, unknown shape keys, duplicate IDs, invalid
  counts, nonfinite values, unsupported versions, and empty saved groups/documents.
- Drafts may have no items, empty repeats, unset durations, incomplete target choices,
  and temporarily invalid exact inputs. They are not executable and cannot be saved as
  a valid prescription. Errors identify stable item/step IDs and the failing field.

The count minimum, fresh default count (2), and group behavior above are recommended
product defaults, not independently requested new features. Revisit them before coding
only if they conflict with an existing indispensable source template.

## 3. Shared semantics and ownership

Core owns schema validation, deterministic structure edits, compilation, calculations,
hash input, and presentation data. API owns transport/write transactions. DB owns durable
constraints and revision enforcement. Apps own navigation and draft interaction state.

Use one small Core structure-editing interface for insert/move/remove/duplicate/ungroup
operations. Destinations identify the root list or a repeat plus insertion position.
Validate the entire operation before applying it; a rejected move leaves the source
unchanged. Handle same-list indexes after removal, not with ad hoc app arithmetic.

Recommended structural behavior:

- Add Step inserts a standalone draft step and opens its dedicated editor.
- Add Repeat appends an empty draft group at count 2 with an inline Add Step affordance.
- Moving a step into/out of a repeat preserves its prescription and ID.
- Moving a repeat moves the group and its children; dropping a repeat inside a repeat
  is invalid and has no effect.
- Removing/moving out the last child removes the emptied group; newly created empty
  groups can remain in the draft until filled or explicitly removed, but block save.
- Delete Repeat deletes its children; Ungroup preserves every execution as individual
  steps (not only one set). Use distinct labels and
  confirmation for destructive group deletion. Do not silently turn one into the other.
- Repeat children cannot be shared between groups. No references to external step maps.

Compiler output must represent each execution as a Step occurrence with ordinal,
step ID, optional repeat ID, and iteration (zero-based internally). Standalone steps
have no synthetic block/repeat identity. Pick and test one new deterministic occurrence
ID format before updating recording consumers. Do not preserve V4 IDs with fake blocks.
Freeze the resolved V5 prescription/occurrence mapping for an active recording; edits
to its source plan must not retarget the ongoing session.

## 4. User-facing contract: mobile and web

Both details and editing show the same chronological sequence. Repeats show their
children once, with a visible repeat count; do not display every expanded execution as
an authoring row. Calculations and execution still use expanded semantics.

Mobile:

- Overview followed by standalone step rows and visibly grouped repeat steps.
- Persistent safe-area-aware **Add Step / Add Repeat** toolbar; content clears it.
- Tapping any step opens the same dedicated editing screen for name, notes, duration,
  and targets, regardless of membership. No interval sheet and no field-modal stack.
- Back returns valid changes to the shared workout draft; it does not save remotely.
  Invalid input stays recoverable with explicit discard; untouched new-step cancellation
  leaves no placeholder. Preserve overview scroll position and return accessibility focus.
- Repeat count is compact and inline. No separate repeat metadata/editor hierarchy.
- Drag/drop supports root reorder, within-repeat reorder, cross-repeat moves, entering/
  exiting repeats, and whole-repeat reorder. Provide visible drop indicators and an
  accessible move alternative. Prevent conflicting edits during an active drag.

Web:

- Use the same row hierarchy, summaries, Core operations, and save validation.
- A dedicated step route or focused editor region may use a desktop-appropriate layout,
  but must not reintroduce mandatory interval editing. Inspect existing web authoring
  availability before estimating screen work; detail-only parity is not editing parity.
- Provide keyboard movement and explicit move destinations alongside pointer dragging.
- Update responsive details, previews, library/catalog and workout selection views.

Reuse semantic duration/target controls and their precision/default safeguards from
the existing local work. Replace the interval-owned transaction state rather than
copying it into a new navigation stack. Detailed screen state belongs to the workout
draft owner; do not serialize entire prescriptions in route params or create a second
persisted authoring representation.

## 5. Dependency-ordered implementation phases

### Phase 0 — Baseline and contract lock

1. Re-read Git status, nearest guidance, and this plan. Snapshot touched dirty files
   without reverting, stashing, or committing the user's unrelated work.
2. Inventory executable V4 consumers, persisted client keys, templates and SQL
   validators. Distinguish planned-workout formats from completed activity FIT data.
3. Lock V5 keys, bounds, occurrence identity, structural edit rules, and focused step
   navigation semantics. Record approved deviations in this document.
4. Capture baseline package verification; classify pre-existing failures honestly.
5. Before any new build launches against retained client storage or any ordinary DB
   reset, complete the client-artifact cutover gate below. Disposable isolated tests
   with newly created fixtures may proceed independently.

Exit: scoped file ownership, reproducible baseline, agreed single canonical shape.

### Phase 1 — Core schema, editing operations, compiler, calculations

1. Replace block schemas/types and draft save resolution in `packages/core/activity-plan/`.
2. Replace block traversal in authoring, validation, derived naming, presentation,
   occurrences, compile, semantic hashing, and public exports.
3. Implement atomic structure operations used by both apps.
4. Update calculations, estimates, target/config resolution and prescription manifests.
5. Add focused schema, operation and compiler tests before adapting all fixtures.

Exit: V5-only Core contract; flat and repeat examples produce identical expected totals
and occurrence ordering without synthetic blocks; nested repeats fail explicitly.

### Phase 2 — Source catalogues, fixtures, import/export consumers

1. Rewrite Core-owned samples/templates directly into V5, preserving exercise order,
   total repetition semantics, durations and targets. Flatten nonrepeating source
   blocks; map repeating sequences to repeat items. Before rewriting fixtures, inventory
   each nonempty block name/description and record its proposed disposition: map to a
   specific child's name/instructions when that preserves meaning, retain appropriate
   workout-level context, or explicitly approve removal of redundant text. Do not
   overwrite existing child metadata, copy group instructions onto every child blindly,
   or discard meaningful text merely to satisfy the new shape. Obtain approval for
   ambiguous/removal cases and assert the accepted mapping in catalogue tests. This is
   source-content editing only, not a runtime V4 converter.
2. Update template versions/content hashes and training-plan references together.
3. Update catalogue tooling, seed inputs, shared factories and snapshots at their owner.
4. Audit planned workout import/export/provider readiness separately from completed
   activity ingestion. Adapt existing supported paths; do not add Garmin integration.

Exit: every shipped template validates; catalogue identities/references remain coherent;
no runtime compatibility path or changed completed-activity protocol is introduced.

### Phase 3 — Fresh DB contract and API

1. Align Drizzle JSON typing/checks, SQL validators, hash/revision functions, frozen
   manifest validation and DB test artifacts with V5. Preserve RLS and ownership rules.
2. Update API create/update/read/duplicate/template flows, repositories, DTOs, planned
   session resolution, training estimates and freeze behavior. Reject V4 explicitly;
   do not return partial parsed data or accept stale hashes.
3. Update fresh-install SQL through the repository-approved DB artifact mechanism.
   No backfill, compatibility trigger, dual-schema rollout, or row-preservation effort.
4. Verify the fresh disposable target and Core/SQL parity before resetting the ordinary
   development database. Regenerate generated artifacts through their owning commands.
5. Later, with target guards and the pre-cutover client-artifact gate confirmed, use
   only `db:reset:mvp` for the necessary local
   reset/reseed. Confirm catalogues, training references, and app/API connectivity.

Workflow issue to resolve before SQL edits: `packages/db/AGENTS.md` describes exactly
one fresh-only baseline, while README and actual files describe a baseline followed by
forward migrations and immutable applied history. A reset alone cannot install a new
validator. Establish the sanctioned fresh-install definition update without assuming
permission to rewrite applied history or quietly adding a migration programme. This
does not require legacy-data migration and does not block Core/UI planning.
The concrete choice is either an explicitly authorized fresh-baseline replacement or
a forward-only V5 installation SQL artifact with no backfill. The latter still uses
the migration mechanism and must not be assumed authorized under the user's request
to ignore migrations. Record the approved path/artifact and its fresh-target checks
before editing SQL; do not silently choose either or rewrite applied history.

Exit: fresh DB accepts exactly the intended V5 saveable structures; API and SQL agree
on hashes/constraints/revisions; rejected unauthorized or invalid writes change nothing.

### Phase 4 — Runtime execution and stale client state

Pre-cutover client-artifact gate (must complete before Phase 3's ordinary DB reset,
new-build startup recovery, or queue cleanup; not deferred until the rest of Phase 4):

- Inventory/version active recordings, finalized-unsent recordings, and remote-accepted
  artifacts pending local garbage collection, on mobile and web.
- Run minimal version classification before resume, upload, or GC. Durably quarantine
  incompatible artifacts without interpreting their V4 prescription as V5.
- Provide an actionable export/explicit-disposal path. Preserve evidence files and
  queue entries until disposition is authorized; an unknown parse/version must not be
  treated as corrupt disposable data or proof of remote acceptance.
- Fence automatic workers during cutover. Test restart during classification/quarantine
  and prove no incompatible evidence or queue entry is silently removed or submitted.
- Distinguish disposable authoring/query caches from captured recording evidence.

Implement this gate early as part of Phase 0/cutover preparation; then continue the
runtime conversion below. A database reset does not grant permission to erase devices.

1. Update recorder plan loading, occurrence lookups, prompts, repeat progress, skip/next,
   recovery manifests, simulation, completion evidence, queued submission and planned
   FIT-related consumers. Preserve journaling, retry/idempotency and cleanup invariants.
2. Update web execution/recording consumers where present, not just workout views.
3. Bump relevant draft/cache persistence versions and invalidate stale plan caches.
   Reject old payloads visibly; never reinterpret an old draft as V5 or execute it.
4. A DB reset does not erase device files: inventory local active recordings and queued
   uploads before cutover. Require explicit disposal/export of irreplaceable user-owned
   artifacts; stop incompatible resume/upload with an actionable message. No historical
   migration engine is required, but no silent deletion of unrelated captured activity.

Exit: new V5 recordings survive interruption/restart and submit exactly once; old plan
state cannot leak into execution or writes. Define how local dev artifacts were cleared.

### Phase 5 — Mobile and web authoring/presentation

1. Replace block-oriented creation-store operations with the common item operations.
2. Build chronological step/repeat list, shared summaries and both Add actions.
3. Replace mobile interval sheet with dedicated step editing and inline repeat count.
4. Implement drag/drop plus accessible move operations against the already-tested Core
   contract. Avoid independent structural mutation code in each app.
5. Update details, previews, charts and selection/library surfaces on both platforms.
6. Remove obsolete interval-only UI/types/tests after replacement behavior is proven.
   Preserve valuable duration, target, invalid-draft and stale-callback regression tests.

Exit: both apps create/edit/save/reopen the same canonical workout, including moving
steps across repeat boundaries, without any mandatory block or interval editor.

### Phase 6 — Integrated cutover, cleanup and verification

1. Search for live `ActivityPlanBlock`, `.blocks`, `blockIndex`, `blockId`, V4 literals,
   interval editor imports, and old fixture schemas. Classify matches; do not blindly
   rename unrelated intervals, historical SQL, exercise repetitions or completed data.
2. Remove obsolete exports/adapters; update architecture/current-contract scans and docs
   to describe V5 without weakening unrelated checks or rewriting historical evidence.
3. Run package and integrated gates below. Record exact results and blockers.
4. Exercise freshly seeded create -> schedule -> resolve -> record -> submit flows and
   parity between authored totals, runtime occurrences and saved summaries.

Exit: no active first-party V4 read/write path, dead block compatibility abstraction,
or unreported runtime/device evidence gap.

## 6. Verification contract

Required cases:

- Standalone only, mixed sequence, single-child repeat, count boundaries, max expansion,
  malformed/nested repeat, duplicate IDs, invalid duration/target and draft/save distinction.
- `warmup + repeat(5, [work, recovery]) + cooldown` yields 12 ordered occurrences;
  count is not accidentally interpreted as five additional iterations.
- All move directions and root-index edge cases; atomic rejected move; duplication IDs;
  deleting last child; empty draft group; ungroup retains ordering and prescriptions.
- Exact Core/SQL validation and hash parity; ownership/revision/frozen-manifest behavior;
  updated seeds and training-plan references on a guarded disposable database.
- Mobile and web full journey: add step -> set duration/targets -> add repeat -> move
  step into repeat -> add child -> reorder -> move step out -> move/duplicate group ->
  save -> reopen -> compare exact structure and estimates. Test discard/invalid inputs.
- Native navigation/back/background/keyboard/accessibility and browser keyboard moves;
  real drag enter/exit targets and toolbar scrolling. Mock tests alone cannot prove UX.
- V5 recording start, repeat transitions, restart recovery, completion and retry;
  unsupported client payloads do not resume/submit. Completed multisport ingest unchanged.

Use Node 24.19.x and the repository package manager. Planned gates (not run by this plan):

```sh
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/api test
pnpm --filter @repo/db db:verify:static
pnpm --filter @repo/db db:activity-plan-authoring:test
pnpm --filter @repo/db db:verify
pnpm --filter @repo/api test:activity-plan-authoring:disposable
pnpm --filter @repo/api test:planned-sessions:disposable
pnpm --filter mobile check-types
pnpm --filter mobile test # Vitest plus native Jest, including recorder logic
pnpm --filter web test
pnpm --filter web build
pnpm --filter web test:e2e # scope maintained activity-plan/recording journeys first
pnpm --filter @repo/ui test:native # if shared controls change
pnpm check-types
pnpm test:parity
pnpm quality:agent
```

Add owner-scoped API/web tests and actual browser/device journeys using the inspected
scripts. Include a web production build when route/editor ownership changes, and check
direct navigation, SSR/hydration, query invalidation, and authorization-scoped caches.
Mobile `test:e2e` currently runs only the app-launch smoke flow: select or add maintained
workout/recording device journeys explicitly; a smoke pass is not evidence for this change.
`quality:agent` and mocks do not replace live DB, browser, or native evidence.
No device or disposable DB availability is assumed. Report blocked gates rather than
claiming readiness based only on typechecks. Inspect final diff/status for unrelated edits.

## 7. Concrete impact map

These are inspection starting points, not permission to edit every listed file. Recheck
fresh contents and instructions when implementation begins; paths are checkout-relative.

| Owner | Primary paths and easily missed consumers |
| --- | --- |
| Core structure | `packages/core/activity-plan/{structure-schema,structure-validation,draft,authoring,compile,occurrence,semantic-hash,derived-naming,presentation,print,index}.ts` |
| Core downstream | `packages/core/activity-plan-calculations.ts`; `packages/core/plan/{activity-plan-draft-metrics,activity-plan-planning-estimate,prescriptionResolution,recordingValidation,activityPlanProviderReadiness}.ts`; `packages/core/calendar/planned-session.ts` |
| Portable recording | `packages/core/recording/{simulation,portable-timer-draft,portable-web-recording}.ts`; recording-session and manifest schemas |
| Catalogues | `packages/core/samples/{activity-plan-builder,fixed-v4-activity-plan-structures,system-activity-template-taxonomy,training-plans}.ts` and all sport-specific sample families |
| API | `packages/api/src/routers/activity-plans.ts`; `src/dto/activity-plan.ts`; `src/contracts/{planned-sessions,recording-submission}.ts`; `src/application/activity-plans/`, `calendar/`, `training-plan/`; planned-session repositories |
| DB | `packages/db/src/schema/{tables,types}.ts`; `src/validation/`; `scripts/{activity-plan-sql-artifacts,materialize-local-drizzle-schema,system-content-seed-values,verify-system-content-seed}.ts`; fresh SQL/functions/manifests and generated fingerprints |
| Mobile draft/editor | `apps/mobile/lib/stores/activityPlanCreation.ts`; `lib/hooks/forms/useActivityPlanForm.ts`; `lib/activityPlanDefaults.ts`; `components/activity-plan/{ActivityPlanComposerScreen,useActivityPlanComposerProcess}.tsx`; `structure/StructureBuilderCard.tsx`, `structure/StructureIntervalSheet.tsx`, `activity/StepEditorFields.tsx` |
| Mobile views | Activity-plan details/content previews; calendar cards, scheduling modals, training-plan creation and plan selection; `lib/activity-plan-export/activity-plan-pdf.ts` |
| Mobile runtime | `apps/mobile/lib/recording/plannedSessionLaunch.ts`; `lib/services/ActivityRecorder/` plan/execution/checkpoint/evidence/artifact modules; `lib/services/activitySubmissionQueue/`; startup submission recovery |
| Web editor/views | `apps/web/src/lib/activity-plan-authoring.ts`; `src/components/activity-plan/` composer/edit-session/structure/presentation/session-flow/timeline/card modules; protected activity-plan routes and public share route |
| Web runtime | `apps/web/src/lib/recording/{timer-runtime,finalized-artifact,provider,draft-storage,submission-queue,legacy-storage}` and their tests; recording cockpit and plan simulator |
| Print/export | `apps/web/src/lib/activity-plan-export/`; `apps/web/scripts/{export-activity-plan-catalog.tsx,measure-activity-plan-portfolio.ts}`; Core print and mobile PDF export |
| Fixtures/tooling | API contract/builders; Core template and compiler tests; DB authoring/seed parity tests; web E2E seeds/domain builders and activity-plan/recording specs; mobile projection fixtures; `tooling/current-contract/`, `tooling/testing/parity-registry.mjs`, form audit references |

Keep deterministic template IDs reproducible, but do not retain obsolete block identity
as a V5 schema field. Version catalogue content intentionally; source templates are
rewritten, not parsed through a retained V4 adapter. Test public-share and PDF output
with both standalone steps and repeats, including untargeted steps.

Preserve completed-activity `packages/core/activity-segments/`, API activity-file ingestion,
provider sync and analysis semantics. They are not legacy workout containers. Likewise,
web recording `legacy-storage` is not permission to introduce V4 plan compatibility;
only update its relevant stale-data policy without deleting unrelated recovery behavior.

## 8. Execution organization and recovery

Default to one writable lane given the heavily dirty checkout. Read-only impact/review
work can run independently. Do not fork implementation from HEAD and assume it contains
these local edits. Concurrent app writers require a synchronized explicit baseline,
separate worktrees and non-overlapping ownership; shared Core contracts come first.

Dependency order: contract -> Core/compiler -> catalogue/DB/API/runtime -> app authoring
and views -> fresh cutover -> integration. App layout work may overlap backend work once
the contract is stable, but a passing mocked editor is not an integrated delivery.

This is a high-risk contract replacement despite disposable data. Before a destructive
local reset, preserve any explicitly needed local evidence and stop active jobs. If the
new build fails, restore the prior coherent code/artifact set and reseed the matching
local DB; do not pretend reverting code restores discarded rows. Keep deployment and
external provider writes disabled throughout this local implementation.
