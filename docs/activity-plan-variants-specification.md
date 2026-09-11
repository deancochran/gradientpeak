# Activity Plan Variants Specification and Implementation Plan

## Status

- **Decision:** Approved
- **Approved direction:** One activity plan owns multiple complete, named activity-plan structures. Exactly one variant is the guaranteed default.
- **Initial default:** Every newly initialized activity plan starts with one default variant named `Base`.
- **Persistence:** Variants remain embedded in the existing activity-plan JSON document. No variants table is introduced.
- **Cutover:** Existing data is migrated in one coordinated maintenance window. All deployed clients and workers upgrade together; no runtime legacy-plan compatibility remains afterward.

## Purpose

Represent related prescriptions such as Base, Build, Advanced, and Race as variants of one activity plan without weakening GradientPeak's calculations, projections, scheduling reproducibility, recording behavior, or provider integration.

The activity plan is the user-facing identity. A variant is a complete executable prescription owned by that activity plan. The default variant gives every operation a deterministic prescription when no explicit variant is selected.

## Product decisions

1. An activity plan can own one or more named variants.
2. Every variant contains a complete, independently valid activity-plan structure.
3. Variants do not inherit from one another and do not contain structural overrides or deltas.
4. Exactly one variant is designated as the default.
5. Every new activity plan is initialized with one default variant named `Base`.
6. A user may rename any variant, including the initially created Base variant. Default identity is independent of display name.
7. Any operation given only an activity-plan identity resolves the current default variant.
8. An operation given an explicit variant identity resolves that exact variant. An unknown variant is an error and never silently falls back to the default.
9. Scheduled sessions preserve the selected variant as an immutable concrete prescription snapshot.
10. Variant authorization and visibility inherit from the owning activity plan; a variant is not an independently authorized resource.
11. Duplicating an activity plan generates new variant IDs while preserving variant names, ordering, structures, and the corresponding default selection.

## Out of scope

- A relational activity-plan variants table.
- Partial variant overrides, patches, inheritance, or parameter-expression engines.
- Automatic phase-, readiness-, or athlete-driven mutation of repetitions, duration, distance, recovery, or structure.
- Combining different activity categories inside one activity plan.
- Recalculating previously scheduled or completed prescriptions after a variant changes.
- Automatically consolidating all existing Base/Build/Advanced/Race system plans during the foundational document migration.
- Changing the established version-3 executable activity-plan structure or compiler semantics.
- Runtime support for both root-V3 and document persistence shapes after cutover.
- Continued operation of old web, mobile, API, or worker versions after cutover.

## Terminology

- **Activity plan:** The stable user-facing resource with name, description, ownership, revision, publication state, and an embedded variant document.
- **Variant:** A named, stable child identity containing one complete version-3 activity-plan structure.
- **Default variant:** The variant resolved whenever a caller does not explicitly select another variant.
- **Resolved prescription:** The selected variant identity and its validated version-3 structure.
- **Prescription snapshot:** The immutable resolved structure, calculations, and provenance captured when a session is scheduled.
- **Legacy structure:** The current persisted format where `activity_plans.structure` contains a version-3 structure directly.

## Canonical document contract

The existing `activity_plans.structure` JSONB column becomes a versioned activity-plan document. `contractVersion` is distinct from the nested executable structure's `version`.

```ts
type ActivityPlanDocument = {
  contractVersion: 1;
  defaultVariantId: string;
  variants: ActivityPlanVariant[];
};

type ActivityPlanVariant = {
  id: string;
  name: string;
  structure: ActivityPlanStructureV3;
};
```

Example:

```json
{
  "contractVersion": 1,
  "defaultVariantId": "34f0d72c-2664-44dc-a7ba-109638721180",
  "variants": [
    {
      "id": "34f0d72c-2664-44dc-a7ba-109638721180",
      "name": "Base",
      "structure": {
        "version": 3,
        "activity_category": "run",
        "segments": []
      }
    }
  ]
}
```

The example omits valid segment content for brevity. Production documents must satisfy the complete existing version-3 structure contract.

## Document invariants

Core owns a strict runtime schema and document-wide validation enforcing:

1. `contractVersion` is supported.
2. `variants` contains at least one variant and no more than the declared bounded variant limit. The initial implementation limit is 16 variants per activity plan.
3. Every variant ID is a UUID and unique within the document.
4. Every variant name is trimmed, nonblank, bounded, and unique after case-insensitive normalization.
5. `defaultVariantId` matches exactly one variant.
6. Every nested structure independently passes the existing branded version-3 activity-plan validation.
7. Every variant has the same `activity_category`.
8. The serialized outer document remains within the existing persisted JSON size limit.
9. Nested segment, interval, and step IDs need only be unique within their own validated structure. Any cross-variant calculation or cache identity must therefore include the variant ID.

The document cannot represent a missing default, an empty plan, an unknown default, duplicate variant names, mixed categories, or a partially valid variant collection.

## Initialization

Activity-plan initialization is server-authoritative and produces:

```ts
{
  contractVersion: 1,
  defaultVariantId: generatedVariantId,
  variants: [
    {
      id: generatedVariantId,
      name: "Base",
      structure: initialValidatedStructure,
    },
  ],
}
```

Clients may provide the initial complete structure through the existing validated creation flow, but they do not bypass document construction or create an activity plan without a default.

The initial Base variant uses the owning activity-plan UUID as its variant ID. The same rule applies when migrating an existing root-V3 row:

```ts
initialBaseVariantId(activityPlanId) === activityPlanId;
```

This rule is the versioned default Base identity algorithm. It makes initialization and cutover migration deterministic without requiring a second mapping or UUID-generation implementation. Additional variants receive independent UUIDs.

## Variant resolution

Core provides one pure resolution boundary:

```ts
resolveActivityPlanVariant(
  document: ActivityPlanDocument,
  selection?: { variantId?: string },
): ResolvedActivityPlanVariant;
```

The result contains:

```ts
type ResolvedActivityPlanVariant = {
  selection: "default" | "explicit";
  variantId: string;
  variantName: string;
  structure: ActivityPlanStructureV3;
};
```

Resolution behavior:

- Omitted variant identity resolves `defaultVariantId`.
- A supplied valid variant identity resolves that exact variant.
- An unknown supplied identity produces a typed domain failure.
- Resolution never mutates the document or nested structure.
- Compilers, estimators, calculations, and provider adapters continue receiving one resolved version-3 structure rather than the outer document.

## Calculation and projection semantics

The default variant is authoritative for every unqualified activity-plan operation, including:

- library and search summaries;
- duration, distance, repetition, and intensity summaries;
- prescription quantification;
- load estimates;
- predictions and athlete-context estimates;
- planning projections;
- recording readiness;
- provider readiness; and
- catalog summaries.

When an explicit variant is selected, calculations operate only on that variant's resolved structure.

Calculation, projection, evidence, and cache identities must distinguish at least:

```text
activity-plan ID
activity-plan revision
variant ID
resolved structure hash or equivalent freshness identity
calculation algorithm version
```

Changing a nonselected variant must not change the selected variant's numerical result. Changing the default variant changes unqualified plan-level results and invalidates affected default-derived projections and caches.

“Activity plan is provider-ready” means its default variant is provider-ready. Explicit variant delivery evaluates only the selected variant. Unsupported nondefault variants do not make the default summary unsupported.

## Revision and hashing semantics

- `structure_hash` becomes the canonical hash of the entire activity-plan document, including variant IDs, names, default selection, and every nested structure.
- Any variant addition, deletion, rename, structure edit, reorder where ordering is user-visible, or default change increments the activity-plan revision.
- Whole-document writes retain the existing optimistic concurrency boundary.
- A stale writer cannot overwrite a newer variant or default selection.
- Derived hashes may be calculated for individual resolved structures, but they do not replace the document hash or activity-plan revision.

## Mutation rules

### Add variant

- Creates a new variant ID.
- Accepts a complete valid structure or clones an existing complete variant structure.
- Requires a unique name.
- Does not become default unless explicitly selected in the same document update.

### Rename variant

- Changes display metadata without changing variant identity.
- Must preserve normalized name uniqueness.
- The initial `Base` variant may be renamed.

### Edit variant

- Replaces that variant's complete structure with another complete valid version-3 structure.
- The entire document is validated before persistence.

### Set default

- Atomically changes `defaultVariantId` to an existing variant.
- Immediately changes future unqualified calculations and selections.
- Does not modify existing planned-session snapshots.

### Delete variant

- The final remaining variant cannot be deleted.
- Deleting the current default is rejected unless another existing variant becomes default in the same atomic update.
- Historical scheduled snapshots remain valid even after their source variant is deleted.

## Scheduling and immutable snapshots

Scheduling accepts an optional variant ID:

- Omitted: the server resolves the current default.
- Supplied: the server resolves that exact accessible variant.
- Unknown: scheduling fails without fallback.

New planned-session prescription snapshots capture:

```ts
{
  activityPlanId: string;
  activityPlanRevision: number;
  variantId: string;
  variantName: string;
  structure: ActivityPlanStructureV3;
  prescriptionQuantification: ActivityPrescriptionQuantificationBundle | null;
  capturedAt: string;
}
```

The selected structure and calculation bundle remain immutable. Later variant edits, renames, deletion, reordering, or default changes do not rewrite scheduled history.

Existing planned-session snapshots retain their concrete V3 prescriptions during cutover. The migration assigns their source activity-plan ID as the Base variant ID, captures the name `Base`, and upgrades them to the variant-aware snapshot contract without changing prescription structure or quantification.

Training-plan sessions always persist `activity_plan_variant_id`. Creation and update inputs may omit it only before server-side materialization; while holding the referenced accessible activity-plan documents inside the existing write transaction, the server resolves each omission to that plan's current default and stores the resolved variant ID immediately. A supplied variant ID must resolve exactly or the whole mutation fails without fallback. Duplicate operations preserve the already-pinned IDs while revalidating those exact variants. Later default changes never retarget persisted training-plan sessions. Existing and system-catalogue training-plan entries deterministically pin Base by setting `activity_plan_variant_id` to `activity_plan_id`, because those activity plans begin with one Base variant whose ID is the owning plan ID.

Template application resolves each persisted training-plan session's exact pinned variant while the accessible activity-plan documents are locked in the scheduling transaction. Planned-session snapshots capture that pinned variant ID, its current name, and its concrete version-3 structure. A missing or unknown pinned variant aborts application; applying a training plan never consults a later default selection.

### Planned-session persistence

The planned-session contract advances from `planned-session-v1` to `planned-session-v2` for variant-aware snapshots. The cutover migration adds snapshot-provenance fields alongside the existing concrete prescription columns, backfills every row, and makes them required before traffic resumes:

```text
activity_plan_variant_id UUID
activity_plan_variant_name TEXT
```

- The cutover migration upgrades every existing `planned-session-v1` row to `planned-session-v2`, sets both variant provenance fields, and preserves its concrete structure and quantification.
- After cutover, only `planned-session-v2` is accepted and both provenance fields are required.
- `prescription_structure` remains the selected concrete V3 structure, not the outer activity-plan document.
- Repository round trips and API projections must preserve the captured variant ID and name.

## API requirements

### Read models

- Activity-plan owner/edit reads return the complete document.
- List and summary projections return default-derived metrics plus default variant identity and variant count.
- Detail and scheduling reads expose ordered variant summaries sufficient for selection.
- A variant is never fetched or authorized independently of its activity plan.
- Public/shared visibility follows the activity plan's existing authorization policy. The API must not expose inaccessible plan content through a variant-specific path.

### Write models

- Creation accepts an initial complete V3 structure and constructs the Base document server-side.
- Update accepts the complete expected document plus the existing revision/concurrency fence.
- Duplicate copies all variant names, ordering, structures, and the default relationship while assigning a new activity-plan identity and new IDs for every copied variant.
- Scheduling accepts an optional selected variant ID and resolves it server-side.
- Transport DTOs reuse Core document and selection contracts without exposing persistence rows.

### Errors

Typed failures must distinguish:

- invalid document;
- unsupported document version;
- missing or unknown default;
- duplicate variant identity or name;
- unknown explicit variant;
- mixed activity category;
- document size/variant limit exceeded;
- stale activity-plan revision; and
- inaccessible activity plan.

## User experience requirements

### Library and search

- Show one card per activity plan, not one card per variant.
- Show calculations for the default variant.
- Identify the default variant and the number of available variants.

Example:

```text
Norwegian 4×4 Run
Default: Base · 4 variants · 44 minutes
```

### Detail and scheduling

- Initially select the default variant.
- Present variant names as an explicit selector.
- Update calculations and compatibility information when selection changes.
- Carry the explicit selected variant ID into scheduling.
- Never imply that changing the selector has modified the underlying default.

### Editing

- New activity plans open with a single `Base` variant.
- The active editor always represents one complete structure.
- Users can add, clone, rename, reorder, delete, and designate variants subject to the document invariants.
- Switching variants with unsaved changes must preserve or explicitly resolve those changes.
- Saving validates every variant, not only the currently visible editor panel.

## Persistence requirements

- Continue using one `activity_plans` row and its existing JSONB structure column.
- Add no variant relation or variant-level RLS policy.
- After the maintenance-window migration, database validation accepts only the canonical outer document and rejects root-V3 values.
- Preserve the existing aggregate JSON size boundary.
- Update category filtering/index assumptions to read the shared nested category deterministically or persist/index an existing authoritative category projection.
- Database constraints must reject missing defaults, invalid nested structures, and mixed categories even when an application bypasses normal API validation.
- Database migrations, schema fingerprints, generated types, and other tool-owned outputs must use the repository-declared generation workflow rather than manual edits.

## Hard-cut migration and deployment

This feature uses one coordinated maintenance-window cutover, not an expand/contract compatibility rollout. Development can proceed in separately verified slices, but production activation is atomic from the product's perspective.

This approved feature-specific decision supersedes general expand/contract and supported-client compatibility guidance elsewhere in the repository for this activity-plan schema change. Data preservation, backup, restore proof, and explicit old-client rejection remain mandatory.

### Pre-cut development

Before the maintenance window:

1. Inventory every root-V3 consumer and persistence writer.
2. Implement document-only Core, database, API, worker, provider, web, mobile, catalog, and export changes in one integration branch or ordered stack.
3. Build the replacement API, workers, web application, and mobile applications.
4. Prepare the one-way data migration and complete validation/restore tooling.
5. Verify the migration against a production-shaped database copy in a disposable environment.
6. Make the upgraded mobile release available before cutover and configure the new API contract epoch so old clients receive an explicit upgrade-required response.
7. Replace the current destructive mobile epoch-reset behavior for unfinished recordings with a cutover migration that preserves, migrates, or quarantines local recording evidence before the new epoch is accepted.

No runtime parser accepts both root V3 and the document shape. Migration tooling may parse the old shape solely to transform stored data while the old application is stopped and before the new application starts.

The forced client upgrade must not delete unfinished recording evidence, journals, streams, FIT artifacts, queued submissions, or recoverable local intent. On first upgraded launch, the mobile cutover coordinator must:

1. Detect pre-cut local state before changing the stored contract epoch.
2. Migrate compatible unfinished state to the new contract or move it atomically into private quarantine.
3. Preserve enough metadata and artifacts to resume, submit, export, or explicitly discard the recording.
4. Refuse destructive cleanup without an informed user action or an approved retention expiry.
5. Survive interruption at every migration step and resume idempotently.

This isolated client migration is permitted solely to preserve local user evidence; it is not a dual-shape server or activity-plan runtime. It may be removed only after the declared local-artifact retention and supported-upgrade window expires.

### Consumer conversion

Every consumer is changed before cutover to accept only an `ActivityPlanDocument`, resolve a variant, and pass only the resolved V3 structure into existing execution logic. The inventory includes:

- activity-plan create, update, duplicate, list, detail, publication, and read projections;
- Core compilation adapters and planning estimates;
- training-plan composition and preview;
- direct and program-derived scheduling;
- planned-session snapshot creation;
- calendar and event projections;
- web and mobile activity-plan editors, lists, detail screens, and scheduling controls;
- recording-plan resolution;
- provider readiness, conversion, synchronization, and refresh;
- activity-plan PDF export; and
- the system activity-plan catalog and print catalog.

No application or worker build containing a direct root-V3 persistence assumption may be included in the cutover release.

### Maintenance-window sequence

1. Place the product in maintenance mode at the ingress boundary and reject all ordinary API, web, webhook, provider-callback, and worker traffic—not only selected writes.
2. Stop accepting new jobs and drain or fence every API instance and background worker that can read or write activity plans or planned sessions.
3. Record the allowed replacement build IDs and advance a deployment generation fence so an old API or worker cannot rejoin after migration.
4. Verify zero old-build instances, in-flight mutations, callbacks, webhooks, leases, or provider jobs can read or commit against the old schema.
5. Capture an access-controlled database backup and migration manifest, then prove restoration in the approved recovery environment.
6. Migrate every existing activity-plan row to the document format.
7. Migrate every existing planned session from `planned-session-v1` to `planned-session-v2` with Base variant provenance while preserving its concrete structure and quantification.
8. Install document-only database constraints, indexes, functions, generated schema artifacts, and the new API contract epoch.
9. Deploy the new API and workers behind blocked ingress and verify every running instance reports an allowed build ID and schema/contract epoch.
10. Deploy the new web application and activate the already-available mobile release requirement.
11. Run internal database, API, calculation, scheduling, recording, provider, web, mobile, catalog, and export smoke checks while public ingress remains blocked.
12. Re-enable workers, then writes, callbacks/webhooks, and ordinary traffic only after the deployment admission check proves no old build can serve traffic.

### Activity-plan transformation

For every existing activity-plan row:

1. Assign the Base variant ID to the existing activity-plan UUID.
2. Wrap the current V3 structure as a variant named `Base`.
3. Set that variant as default.
4. Increment the activity-plan revision exactly once.
5. Recalculate `structure_hash` from the document's canonical serialization.
6. Preserve the pre-migration revision, canonical V3 serialization, and canonical hash in the migration manifest.
7. Validate plan identity, ownership, category, system-content metadata, row count, and nested structure equality.

The migration updates only canonical root-V3 rows and aborts the cutover if it encounters an unexpected shape. Because writers and workers are stopped, no compatibility retry path is needed; any observed concurrent mutation aborts the migration.

### Planned-session transformation

For every existing planned-session row:

1. Preserve `prescription_structure` and `prescription_quantification` exactly.
2. Set `activity_plan_variant_id` to its activity-plan ID.
3. Set the captured variant name to `Base`.
4. Change the contract discriminator to `planned-session-v2`.
5. Validate that the migrated snapshot remains executable and preserves its pre-cut quantification identity.

After migration, the database rejects `planned-session-v1` and null variant provenance.

### System-family consolidation

Consolidating existing Base/Build/Advanced/Race system plans is a later document-native data change, not legacy compatibility:

1. Select the stable root identity, normally the current Base plan.
2. Move each complete family structure into a named variant.
3. Migrate active and future-facing references to `{ activityPlanId, variantId }`, including unscheduled training-plan entries, future calendar events, provider links, and other discovered mutable references.
4. Never rewrite the captured activity-plan ID, variant provenance, structure, name, or quantification of a historical planned-session snapshot.
5. Delete redundant source-plan rows only when no immutable historical reference requires them.
6. Retain historically referenced source rows as archived, nonselectable provenance records excluded from library, editing, scheduling, calculation, publication, and provider paths. They are data retention, not a legacy execution path.

No alias lookup or legacy execution code remains after consolidation. Removing archived provenance rows requires a separately approved snapshot-decoupling migration that preserves their original captured IDs without rewriting history.

## Recovery strategy

- Before writes reopen, failure restores the database backup and the pre-cut application fleet while maintenance mode remains active.
- After writes reopen, the old application and root-V3 schema are not valid rollback targets.
- Post-cut recovery rolls forward with a corrected document-capable build or restores the entire database and application fleet to the cutover point under a separately approved data-loss window.
- Never flatten a multi-variant document to one structure as automated rollback.
- Retain the backup, migration manifest, generated migration, validation output, and deployed artifact identities according to the migration recovery policy.

## Implementation ownership

### `packages/core/activity-plan`

- Document and variant Zod contracts.
- Initialization helper.
- Document-wide invariants.
- Pure resolver and typed failures.
- Canonical document hashing inputs.
- Migration-only parser input contract for transforming root V3 outside the runtime application.

The existing V3 structure contract and compiler remain independently usable after explicit resolution.

### `packages/core/plan`

- Variant-qualified calculation, prediction, projection, and cache identities.
- Default resolution for unqualified plan operations.
- Explicit selection for variant-specific operations.
- Provider and recording readiness adapters over resolved structures.

### `packages/core/calendar`

- Variant provenance in new planned-session prescription snapshots.
- Document-only `planned-session-v2` contract after migration.

### `packages/db`

- One maintenance-window migration to document-only validation.
- Category query/index compatibility.
- Required planned-session variant provenance after cutover migration.
- Generated migration, schema fingerprint, and database verification.

### `packages/api`

- Plan-level authorization and variant resolution orchestration.
- Read/write DTO transitions.
- Server-owned Base initialization.
- Scheduling selection and snapshot capture.
- Whole-document concurrency and provider follow-up behavior.

### `apps/web` and `apps/mobile`

- One-plan library representation.
- Default-derived summaries.
- Variant selection for detail, editing, scheduling, recording, and provider actions.
- Complete-document editing without local calculation authority.

### Catalog and exports

- Resolve the default for one-plan summaries.
- Present named variants beneath one activity-plan family where the publication intentionally includes alternatives.
- Continue exporting concrete validated structures; the renderer does not interpret structural deltas.

## Implementation slices

### Slice 0: inventory and fixtures

- Enumerate every direct parse/access of `activity_plans.structure`.
- Add representative one-, two-, and four-variant fixtures.
- Freeze legacy V3 fixtures and planned-session snapshots.
- Identify generated database artifacts and their declared commands before mutation.

**Exit:** Consumer inventory and migration fixtures are complete; overlapping dirty changes are integrated or isolated. Every deployable that must be replaced during cutover is named.

### Slice 1: Core document foundation

- Add document parsing, initialization, resolution, and hashing behavior.
- Keep old-shape parsing in migration tooling only; runtime Core exports only the document contract.
- Keep compiler input V3-only.
- Add contract and resolver tests.

**Exit:** Core proves deterministic default and explicit resolution without changing calculations.

### Slice 2: API and calculation conversion

- Update reads, writes, estimates, projections, caches, readiness, and duplication to the document-only contract.
- Add default-versus-explicit contract tests.

**Exit:** All server calculations consume resolved V3 structures, identify their variant, and contain no runtime root-V3 persistence parser.

### Slice 3: scheduling and provider conversion

- Add optional variant selection to direct scheduling. Add training-plan variant selection only after its default-following versus stable-selection policy is approved.
- Snapshot variant provenance with the complete selected structure.
- Update recording and provider boundaries.

**Exit:** Scheduling, recording, and provider operations use the selected variant and contain no legacy snapshot branch.

### Slice 4: web and mobile conversion

- Add variant editing and selection.
- Keep default initially selected and update summaries when selection changes.
- Add the contract-epoch/upgrade-required experience for old clients.
- Add an interruption-safe migration/quarantine path for unfinished local recording evidence; do not reuse destructive epoch-reset cleanup.
- Cover accessible naming, focus, unsaved changes, loading, and failure states.

**Exit:** Replacement web and mobile builds are ready for cutover, and old clients fail explicitly rather than submitting an old schema.

### Slice 5: database cutover migration

- Change authored schema validation, category/index assumptions, and planned-session columns to their final document-only forms.
- Generate the migration through the repository workflow.
- Transform all activity plans and planned sessions in one maintenance transaction or other repository-approved all-or-restore boundary.
- Refresh protected fingerprints/types through their generators.
- Add migration precondition, postcondition, and restore verification.

**Exit:** A disposable old-shape database migrates completely to the new schema, rejects old shapes, preserves calculations/snapshots, and restores successfully from the captured backup.

### Slice 6: integrated cutover rehearsal

- Build every replacement deployable from the same approved revision.
- Rehearse ingress blocking, API/worker generation fencing, queue drain, backup, migration, deployment admission, smoke checks, and restore.
- Exercise mobile epoch upgrade with active, interrupted, queued, completed, and corrupt local recording states and prove no recoverable artifact is silently deleted.
- Run package checks, live-database tests, web/mobile journeys, provider fixtures, catalog measurement, and PDF preflight.

**Exit:** The complete rehearsal passes within the approved maintenance window and produces a signed cutover checklist with artifact identities.

### Slice 7: production cutover

- Execute the maintenance-window sequence exactly once with explicit production authority.
- Abort and restore before reopening traffic if any required check fails.

**Exit:** Every row, process, worker, API, and supported client uses the new document contract; old clients receive upgrade-required responses; ordinary traffic is healthy.

### Slice 8: system templates and print catalog

- Consolidate approved system families into embedded named variants.
- Migrate active references safely.
- Update the print catalog to group variants under one activity-plan identity.

**Exit:** System libraries no longer present family variants as unrelated plans, and the print export passes its existing preflight.

There is no later legacy-compatibility removal slice. The hard cut is incomplete if deprecated runtime paths survive Slice 7.

## Verification requirements

### Core contract

- New initialization always produces one valid default variant named Base.
- New initialization and cutover migration assign the same Base variant ID equal to the activity-plan ID.
- Empty variants, duplicate IDs, duplicate normalized names, unknown default, mixed categories, invalid nested V3, excessive variants, and oversized documents fail.
- Omitted selection resolves the default.
- Explicit selection resolves exactly and unknown selection fails without fallback.
- Changing nonselected variants does not change the selected calculation.
- Variant-qualified identities prevent cross-variant cache or evidence collisions.

### Database and migration

- Every legacy row becomes one Base document whose nested V3 value has the same validated canonical serialization and canonical hash as the pre-migration structure.
- Every planned-session-v1 row becomes planned-session-v2 with Base provenance and unchanged concrete prescription/quantification.
- Migration preconditions reject an already migrated or unexpected shape rather than double-wrapping it.
- Each converted plan increments revision exactly once; any detected concurrent writer aborts the cutover.
- Constraints reject malformed documents independently of API validation.
- Category filtering and indexes continue returning the same plans.
- Document hash and revision behavior match the declared migration policy.
- Security and performance advisors are reviewed after DDL changes.

### API

- Creation cannot omit Base/default initialization.
- Whole-document updates enforce ownership and expected revision.
- Reads expose default-derived summaries and variant selection metadata.
- Duplicate behavior produces independent valid variant identities.
- Unknown or inaccessible plan/variant combinations fail safely.

### Calculations and projections

- Existing one-structure calculations produce equivalent results after migration.
- Default and explicit variants produce independently verified estimates.
- Default changes invalidate unqualified derived results.
- Nondefault incompatibility does not corrupt default readiness.

### Scheduling and history

- Omitted selection snapshots the current default.
- Explicit selection snapshots the selected structure.
- Later rename, edit, deletion, or default change cannot alter a captured session.
- Migrated snapshots remain executable and preserve their pre-cut calculation identity.

### User interfaces

- New editors begin on Base.
- One plan appears in library/search with default metrics and variant count.
- Selecting a variant updates displayed metrics and scheduled identity.
- Variant mutation controls enforce last/default restrictions.
- Web and mobile remain behaviorally consistent.

### Integration commands

Run package-focused checks while implementing, then the repository-declared database generation and freshness commands and:

```sh
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/api check-types
pnpm --filter @repo/api test
pnpm --filter web check-types
pnpm --filter web test
pnpm --filter mobile check-types
pnpm --filter mobile test
pnpm catalog:measure
pnpm catalog:export
pnpm quality:agent
```

Tests requiring a local database, browser, native runtime, or provider fixture must run through their repository-owned environments rather than being represented as covered by unit tests.

## Acceptance criteria

The feature is complete when:

1. Every activity plan persists as one valid activity-plan document with at least one named variant and exactly one default.
2. Every newly created plan starts with a default variant named Base.
3. Every calculation, prediction, projection, readiness check, and default summary deterministically uses the default when no variant is supplied.
4. Explicit variant selection is preserved through calculations, scheduling, recording, and provider delivery.
5. Scheduled history remains immutable after all subsequent plan or variant mutations.
6. Existing V3 plans migrate without prescription or calculation drift.
7. Users see one plan in discovery and can name, edit, select, and schedule its variants.
8. Database constraints, Core schemas, API contracts, and web/mobile consumers agree on the same invariants.
9. No variant table, structural override model, or duplicated client-side calculation authority is introduced.
10. All generated artifacts are fresh and focused plus integration verification passes.

## Deferred decisions

These do not block the foundational embedded-variant model but require explicit product approval before their respective slices:

- Whether public/shared activity-plan views expose all variants or only the default.
- Whether training-plan entries follow future default changes or always capture an explicit variant when authored.
- Whether a system family's initial default may be Build/Standard instead of Base during later consolidation. New user-created plan initialization remains Base regardless.
- Whether variant ordering has semantic meaning beyond presentation.
- Whether future coaching automation may recommend a variant while still requiring explicit resolution before scheduling.

## Primary implementation risk

The principal risk is an unconverted consumer treating `activity_plans.structure` as a root version-3 structure after the hard cut. The consumer inventory, clean-build proof, migration rehearsal, and coordinated replacement of every API, worker, provider, app, catalog, and export process are mandatory because no runtime compatibility layer will absorb an omission.
