# Fixed, single-sport activity plans

Status: V4 implementation, authorized local database reset/reseed and integrated verification completed. See section 18 for final evidence and device-only limits.

Date: 2026-09-29. Delivery checkout: `.worktrees/dev`.

### Execution authorization update

The user subsequently authorized completing the specification and allowed database resets or migrations needed to update and validate the system. This authorizes necessary local schema/migration work and guarded repository-managed local resets. Remote/production mutations, deployment and publication remain outside scope. Confirm the actual guarded target before any destructive command.

For a disposable local environment, reset and reseed is an acceptable cutover strategy: rebuilding source templates and validating all active consumers takes precedence over preserving disposable development rows. The offline preservation/provenance requirements below still apply if an environment is converted in place instead of reset; they do not require building a historical snapshot migration service solely to preserve data explicitly discarded by an authorized local reset. Record which strategy was actually executed and validate seeded references, scheduling, execution and completed multisport ingestion afterward.

## 1. Decision and authority

User-established requirements:

- Simplify the activity-plan model rather than accumulating presentation exceptions.
- Convert all first-party activity-plan templates to the new model.
- Remove adaptive activity plans completely from the active development product.
- An activity plan represents one sport. A brick consists of separate activity plans.
- Preserve ingestion and representation of completed multisport activities.
- Use a consistent step editor regardless of step count, with an always-visible vertically centered drag handle, an always-visible Delete action, compact spacing, and no step-deletion Undo.

This document specifies the implementation target and recommended conversion policy. Detailed choices below, including V4, untargeted steps and stored-snapshot conversion, are proposed design decisions, not claims of previously approved migrations. Approving implementation does not authorize production work, remote seeding, database schema changes, destructive resets, deployment, or rewriting stored records. Obtain explicit approval for the concrete DB migration and data-conversion plan before executing that dependent phase.

This specification supersedes adaptation and activity-plan hierarchy requirements in the documents listed in section 13 for this workstream. It does not supersede their training-plan, privacy, completed-activity, snapshot immutability, or authorization requirements.

## 2. Outcome and non-goals

### Outcome

One fixed, single-sport activity-plan contract shared by Core, API, persistence, templates, web, mobile, scheduling, estimates, execution and planned exports. A plan contains repeatable blocks; blocks contain steps. Fixed and formerly adaptive templates use exactly the same contract and authoring flow.

"Fixed" means concrete quantities and target values. It does not forbid ordinary editing, repeats, percentages of athlete thresholds, or selecting among different plans. A prescription of four repeats at 90% FTP is fixed. An authored parameter allowing three through six repeats is not.

### Non-goals

- No completed-activity schema flattening or removal of multisport/transition metadata.
- No combined multisport activity plan or per-step sport switching.
- No new atomic brick scheduler, transition timer or cross-session adaptation.
- No removal of unrelated training-plan preferences, athlete thresholds, training intent or selection/ranking merely because they involve personalization.
- No replacement of recorder durability, provider protocols, authorization or concurrency controls.
- No automatic expansion of every former adaptive combination into separate templates.
- No permanent dual authoring system, V3 write path or runtime adaptation compatibility service.
- No deletion or reset of user data as a shortcut to finishing the migration.

## 3. Current evidence and implications

Repository inspection found:

| Current owner | Observed behavior | Implication |
| --- | --- | --- |
| `packages/core/activity-plan/structure-schema.ts` | V3: category → activity/rest segments → named intervals → named steps; step description and notes; 1–3 targets | Simplification removes redundant containers, not an existing per-segment sport field |
| `packages/core/activity-plan/structure-validation.ts` | Global IDs, payload, expansion and duration bounds; target compatibility | Preserve executable safety while changing topology |
| `packages/core/activity-plan/adaptation-*.ts` | Bounded controls, target references, optional allowed combinations | Removing only UI is insufficient |
| `packages/core/plan/prescriptionResolution.ts` | Enumerates and ranks adaptive states; manifests contain selected values | Replace adaptive expansion with fixed-candidate evaluation |
| `packages/core/samples/index.ts` and sample families | Registry includes adaptation-bearing templates and single-sport multisport components | Convert definitions, catalog tooling and seeds together |
| `packages/db/src/schema/tables.ts` | Activity-plan adaptation JSONB, revision/hash columns; manifests require adaptation values | Database contract must change explicitly |
| Authoring-policy SQL migrations | Server-side validation, semantic hashing and revision enforcement | Core-only changes would diverge from persistence |
| Planned-session freeze migration and repository | Immutable captured manifest with concrete resolved structure | Existing selected prescriptions must not be recomputed from converted defaults |

Existing completed multisport handling has source-level tests in Core artifact parsing, API file ingestion and effective timeline composition. This is evidence of contracts to protect, not fresh runtime proof of provider ingestion.

The worktree contains substantial pre-existing edits. Establish a scoped baseline before implementation and preserve unrelated work. No remote data inventory has been performed; stored row counts and conversion exceptions remain unknown.

## 4. Proposed canonical domain contract

### 4.1 Structure V4

Conceptual shape, not an independently maintained TypeScript contract:

```text
ActivityPlan entity
  id, name, description, ownership/visibility, revision and hashes
  existing training intent and associated-resource metadata
  structure:
    version: 4
    activity_category: run | bike | swim | strength | other
    blocks:
      - id
        repetitions: positive integer
        steps:
          - id
            name?: nonblank string
            instructions?: nonblank string
            duration:
              time { seconds }
              | distance { meters }
              | repetitions { count }
              | untilFinished
            targets: zero to three canonical targets
```

Use Zod-first contracts and inferred types in Core. Keep existing duration and target discriminators/units unless their audit exposes a required incompatibility. No segment IDs, interval names, block names/notes, step descriptions/notes split, adaptation object, ranges, allowed states or adaptation values in new active contracts.

### 4.2 Responsibilities

- Plan: identity and overall description. Avoid mirroring these in structure JSON.
- Block: ordering, grouping and repetition only. Always present; a one-step block is not a different type.
- Step: optional human label, one instructions field, completion condition and target collection.
- Empty optional text normalizes to absence at save. Invalid editing text remains visible until corrected or canceled.
- Unnamed steps display a derived label such as `Step 1`; never persist generated labels or synchronize block/step names.
- Derived duration, distance, load and intensity remain estimates, not independently editable fields.
- Stable UUID identity is independent of labels and order.

### 4.3 Untargeted steps and recovery

Permit `targets: []` for any step, rather than inventing a separate rest-step layout or fake intensity target. Completion can be prescribed without prescribing intensity. Recovery is conveyed by name/instructions; it does not require another structural container.

An untargeted timed rest is still timed execution, not a pause that stops the recording clock. Estimates and provider readiness must distinguish unknown effort from zero effort. Unsupported exports must report the limitation rather than inventing watts, speed or RPE. Preserve existing equipment/route associations outside this structure.

V3 optional step `purpose` is not carried forward as a new redundant editable field. Audit its live execution/estimation consumers first. Convert human-facing meaning into the step label/instructions; any behavior dependency must be explicitly replaced and tested before removal. Do not discard functional recovery behavior under the assumption that purpose is decorative.

### 4.4 Bounds and valid saved states

- At least one block and one step per block in a saved plan.
- Repetitions 1–50; maximum 20 steps per block, retaining current per-interval limits.
- Maximum 1,000 expanded step occurrences globally, including converted timed rest steps.
- Retain current per-step bounds: time 24 hours, distance 1,000,000 meters, repetitions 10,000; document timed-duration total at most seven days.
- Maximum encoded structure size 1 MiB. Maximum block count 1,000, already bounded by expanded occurrence count; do not introduce a 50-block flattening limit that rejects previously spread-out intervals unnecessarily.
- IDs unique across blocks and steps; finite numbers, canonical precision, category compatibility, no duplicate target type and at most one objective target. Existing permitted supporting targets remain supported.
- No recursive blocks and no unbounded nested repetition.
- Conversion reports any old record that exceeds the new limits; it never truncates or clamps content silently.

### 4.5 Authoring drafts versus saved content

Drafts may temporarily contain no blocks, empty blocks, absent targets and invalid numeric text. Invalid drafts cannot be committed. Save/Done exposes actionable errors at the owning field without destroying the draft. Core owns saveable rules; UI owns raw input and editing transactions. Do not make the saved schema permissive merely to support intermediate editing.

## 5. Complete removal of activity-plan adaptation

Remove active exports, schema fields, procedures/DTO fields, authoring controls, resolution branches, state enumeration, adaptation-specific ranking, manifest fields, catalog builders and seed fields. New writes containing removed fields fail explicitly rather than silently ignoring an old client's request.

Keep one concrete prescription materialization path:

```text
fixed candidate + applicable athlete/context evidence
  → validate and estimate without changing authored quantities
  → deterministic candidate selection where required
  → concrete captured prescription
```

Direct scheduling uses the selected fixed plan exactly. Training-plan matching may rank fixed plans using existing demand/intent policy, but must not silently scale duration, repetitions or intensity to fit demand. If no candidate satisfies a requirement, use the existing explicit fallback policy where still meaningful or return a clear unsatisfied-demand result. Document the reduced fitting capability; do not disguise removal with a new automatic scaling engine.

Retain relative target values such as `%FTP` and their existing execution-time threshold semantics. Threshold translation is not authored adaptation. Test missing-threshold readiness and partial estimates.

## 6. Template and authored-content conversion

### 6.1 Inventory and deliverables

Produce a deterministic inventory of every `SYSTEM_TEMPLATES` member, training-plan reference, source ID, adaptive control count, structure topology and conversion outcome. Counts must come from the checked-out catalog, not this document. Cover all sample families, `multisport.ts`, catalog verification and DB seed builders.

Each input yields one fixed template with the same identity unless an explicitly reviewed exception requires otherwise. Keep stable template IDs to preserve training-plan references and restricted foreign keys. Update semantic revisions/content hashes through the canonical policy, not hand-maintained constants.

### 6.2 Conversion order

1. Validate the source with its original contract.
2. For an adaptive template/current authored plan, materialize declared defaults with the old resolver before removing it. Never assume the stored base already equals resolved defaults.
3. Flatten activity segments in order into blocks, preserving interval repetition and step order/IDs.
4. Convert each rest segment into its own one-repeat block containing a timed, untargeted step. Derive collision-free stable IDs from source identity; do not use fresh randomness on reruns.
5. Consolidate naming/instructions without losing distinct authored content.
6. Validate V4 and compare semantic execution signatures and estimates with the resolved V3 source.
7. Emit converted content, mappings, hashes and explicit exceptions. Only then replace source definitions and remove adaptation machinery.

### 6.3 Text preservation

- Keep authored step names. Blank/genuinely generated labels may become absent only under a tested deterministic rule.
- Merge distinct step description and notes into instructions in a documented order, retaining both when different.
- Preserve distinct segment and interval names/notes as contextual instructions on the first descendant step, with source labels such as `Block context:`. Deduplicate only exact normalized duplicates, not inferred synonyms.
- This contextual instruction applies whenever that step executes; original once-only versus repeated execution semantics must not be inferred from text. If a source has machine-interpreted once-only behavior, flag it as an exception instead of encoding it only as prose.
- Publish a before/after text report for manual review. Do not truncate to fit current field limits. Retain the current instructions limit initially and block overflow records for deliberate resolution.
- Curated source templates may be rewritten for clarity after equivalence is established. Stored user content must not receive unreviewed editorial rewrites.

### 6.4 Conversion evidence

Compare ordered expanded completion conditions, repetition counts, canonical targets and untargeted rest durations, plus preserved authored text and associated resources. Compare meaningful estimates with identical athlete inputs. Hash equality is not expected across versions; executable equivalence is.

The final runtime and template catalog must not depend on the old adaptation resolver. Any one-time converter must be isolated from active package exports and removed from the active product dependency graph. Historical migration SQL and controlled conversion evidence may retain old terminology; they are not a supported legacy authoring system.

## 7. Stored plans, snapshots, hashes and cutover

### 7.1 Two different preservation rules

- Mutable authored plans/templates: convert their declared-default prescription.
- Scheduled prescriptions: convert the already captured `resolved_structure`, never the current source template and never the default adaptation values. A scheduled six-repeat session must remain six repeats even when its template default was four.

Completed activity measurements, artifacts and source composition remain unchanged. Historical executable snapshots referenced by recording or providers need the same semantic-preservation treatment as scheduled snapshots.

### 7.2 Recommended hard-cut policy

Use one active V4 structure and a newly versioned prescription manifest after cutover. Do not retain an active V3 reader requiring adaptation resolution. An approved offline data conversion is a prerequisite to deploying the hard cut where old records exist.

For converted manifests, retain source plan ID/revision, capture time, selected concrete prescription and relevant evidence. Remove active `adaptation_values`. Recompute the new structure hash and manifest fingerprint using explicitly versioned semantics; historical hashes must not be relabeled as hashes of V4 JSON. Preserve original manifest bytes and old/new fingerprints in access-controlled migration evidence outside normal product DTOs. Captured source revision remains historical, not rewritten to the template's new revision.

Existing snapshot immutability triggers forbid ordinary updates. The DB migration must define a narrowly scoped, approved conversion mechanism with transactions, full validation and immediate restoration of immutable enforcement. Application code must never gain a general snapshot-rewrite capability.

Each rewritten snapshot requires a durable, immutable provenance record linked to its session/source row, not just a temporary backup. Record original bytes/version/hash, replacement bytes/version/hash, converter version, conversion run identity and authorized scope. Write the provenance record atomically with the replacement; use a unique source-row/source-hash key so retries cannot produce divergent archives. Restrict access under the same privacy and retention obligations as the original session. Historical adaptation fields may remain in this non-executable audit record, never in active authoring or resolution contracts. The exact persistence design requires DB approval.

### 7.3 Replay and in-flight work

Inventory preview/apply fingerprints, training-plan application idempotency records, provider outboxes, recording recovery artifacts and cached/offline payloads before cutover. Existing successful scheduling requests must replay their persisted results without regenerating a prescription under the new resolver. Expired previews must produce an explicit refresh-required response, not duplicate sessions.

Do not convert an in-progress recording's contract underneath it. Cutover requires no active recordings on the target environment, or a separately tested resume strategy. Drain or explicitly convert pending provider jobs without resending already acknowledged prescriptions. Reject unsupported old client writes with an upgrade/reload requirement; do not silently drop adaptation requests.

Before the first conversion batch, establish an approved maintenance/admission boundary: freeze affected writes, scheduled jobs and affected reads, enforce a supported-client epoch, and prevent either V3 or V4 application binaries from reading partially converted data. Keep this boundary in place through batch completion and post-conversion verification; enable V4 traffic only after the whole dependent dataset is valid. If unaffected product traffic stays available, prove its queries cannot traverse affected records. Do not attempt an implicit rolling mixed-version deployment.

Define a recoverable disposition for each persisted client payload before enforcing the new epoch:

- Unsaved V3 authoring drafts: preserve/export the original locally and provide a bounded migration or explicit user-reviewed discard/recreation path; a forced reload must not silently erase them.
- Queued scheduling/apply requests: reconcile existing idempotency results first; unexecuted obsolete requests require a refreshed preview and confirmation, not automatic re-execution.
- Recording recovery/submission artifacts: drain under the supported old contract before cutover, or ship and verify a dedicated conversion/resume path before admitting affected clients.
- Read caches: invalidate and refetch after the epoch change; do not treat them as authoritative plans.

Publish the minimum-client/sunset policy and recovery instructions. If any persisted payload class cannot be handled safely, the hard cut is blocked for that environment; this does not justify permanent adaptive-plan runtime support or silent local data deletion.

### 7.4 Migration safety

Required before any stored-data mutation:

1. Authorized target/environment and exact migration scope.
2. Protected backup of affected plans, manifests, replay records and referenced content; no raw private data in logs.
3. Dry-run counts and exception report, stable old/new identity mapping and no unresolved content loss.
4. Deterministic, restartable conversion keyed by source version/hash; already converted rows are no-ops, changed source hashes are conflicts.
5. Transactional batches with post-write validation and progress evidence; no global deletion seed mode.
6. Local rehearsal of SQL constraints, triggers, hashes, FK behavior and rollback/restore.
7. Post-conversion referential, equivalence and idempotency checks before accepting V4 writes.

Rollback requires restoring compatible data and binaries together. Reverting code alone cannot undo V4 conversion. Once new V4 edits exist, do not roll back by overwriting them with a stale backup; stop writes and reconcile or forward-fix.

## 8. Consistent web and mobile authoring

- Preserve plan header Back/title/Save and standard category icons beside plan name.
- One block layout and one step layout for every count. No generated block-name field, single-step rename alternative or hidden single-step delete/drag icons.
- Block chrome: compact Repeat control and direct add/remove actions with clear accessible labels. Repeat one is a normal value, not a different component type.
- Step row: vertically centered drag handle; editable name; wrapping duration/target prescription; smaller left-aligned instructions; compact duplicate/delete actions. Remove extra vertical gaps while retaining platform touch targets.
- Dragging a sole step is a safe no-op. Delete remains visible and enabled for the last step; deletion leaves an empty draft block with Add step and an explicit validation state. It does not silently delete the block.
- Block deletion is a separate explicit action. An empty plan draft is allowed; plan Save requires valid content.
- No step-deletion Undo/tombstones. Cancel at block level discards all its uncommitted changes, including deletion.
- One mobile sheet host switches between overview and field content. Field Done validates and accepts only that field; field Cancel/Back/scrim restores only that field. Overview Done validates the block; overview Cancel discards it. Stale callbacks cannot accept, cancel or close a newer edit.
- Newly added steps/targets remain provisional under existing first-acceptance rules; duplicated steps/blocks are complete local copies and do not open editors automatically.
- Keep raw numeric drafts, canonical units, valid type defaults, range/precision rules, optional text clearing, target-type cancellation and accessible error focus.
- Removing the last target is valid. Do not auto-create RPE to satisfy old minimum-target assumptions.
- Summary metrics use canonical estimates, preserving unavailable/partial values rather than manufacturing zero. Removing adaptation must not alter normal category compatibility.

## 9. Bricks and completed multisport boundary

Keep current separate single-sport component template identities. Training-plan samples can schedule bike then run as separate sessions; preserve order and available scheduling metadata. Do not claim these are an atomic linked brick operation. Explicit atomic grouping, transition rules and retry of a multi-session operation are separate product work.

Protect the completed-activity contract independently:

- Source sport/leg sequence, including repeated categories and transition segments where supplied.
- Parent/child identity, provider IDs and duplicate-import behavior.
- Original timing, partial duration coverage, source measurements and provenance.
- Aggregate-versus-leg metric accounting, avoiding double-counted load, duration and distance.
- Routes, partial swim metrics, artifact storage and display composition.

Key regression owners include `packages/core/activity-files`, `packages/core/activity-artifacts`, `packages/api/src/application/activity-file-ingestion`, activity discovery/display, `packages/core/training-timeline/effective-composition.ts`, and web activity-file detail cards. Do not repurpose completed `segments` into planned `blocks` through a global rename.

Matching one completed multisport recording to multiple planned sessions is not added by this change. Preserve existing matching behavior and document unsupported matches; do not mark both sessions complete from one aggregate without leg-specific evidence.

## 10. Ownership and affected surfaces

| Owner | Required changes |
| --- | --- |
| Core activity-plan | V4 structure, draft/saveable boundary, authoring validation, canonical hashing, removal of adaptation exports |
| Core plan/calendar | Fixed resolver candidates, versioned manifest, snapshot validation, estimate/execution consumers |
| Core samples/catalog | Convert every template, stable IDs, coverage/catalog expectations, training-plan references |
| API activity plans | Create/update/duplicate DTOs, capabilities, validation, revision and conflict handling |
| API scheduling | `resolver-candidate.ts`, direct create, training-plan projection/apply, repositories and replay |
| API execution/providers | Frozen snapshot consumption, mobile submission and Wahoo planned projection/readiness |
| DB | Tables/validation exports, constraints, functions/triggers, fingerprints, generated artifacts, seed materialization and approved conversion |
| Web | Composer/edit-session/authoring helpers, detail/scheduling, preview, record/simulate and exports |
| Mobile | Composer process/store, block sheet/fields, preview, schedule modal, calendar creation, recording inputs |
| UI package | Only genuinely reusable semantic-field changes; no domain schema ownership |
| Documentation/tooling | Supersession, current-contract checks and targeted ban on active adaptation imports/fields |

Retain API ownership checks, public/system-template restrictions, optimistic revision conflicts and source FK identity throughout. Changing the representation does not authorize changing who can edit plans.

## 11. Ordered implementation plan

### Phase 0 — Baseline and inventory

Capture scoped dirty-state baseline; inventory templates, consumers and available verification. Produce dependency map and proposed conversion exceptions. Inspect local DB tooling without remote mutation. Record current unrelated gate failures separately.

Exit: exact in-scope symbols/paths, source catalog counts, signed-off contract choices, known stored-data unknowns.

### Phase 1 — Prove conversion before deleting the old resolver

Build bounded local conversion/equivalence fixtures using current V3 parsing/resolution. Capture default-materialized catalog and selected non-default scheduled examples, rest cases and text preservation. Keep evidence separate from active runtime exports.

Exit: every first-party template converts or has an explicit blocking exception; no silent loss.

### Phase 2 — Core fixed contract and templates

Implement V4, fixed materialization/selection, manifest versioning, hashes and estimates. Convert source catalog and references. Remove adaptation exports/branches when conversion proof no longer needs production imports. Preserve training-intent selection without prescription scaling.

Exit: Core types/tests and complete catalog coverage pass; executable equivalence established.

### Phase 3 — Persistence and backend integration

Prepare concrete DB change proposal and request required approval before schema work. Implement authorized migration locally, row validators, API DTOs/repositories, scheduling, optimistic concurrency, replay, provider snapshot consumers and seed changes. No remote seeding.

Exit: local DB constraints and conversion rehearsal pass, immutable snapshots and idempotency demonstrated.

### Phase 4 — Web/mobile authoring and execution

Adopt uniform block/step UI and empty-draft deletion rules, remove adaptation hydration/payloads/controls, update previews, scheduling and recording. Keep one source of schema truth and one mobile field sheet.

Exit: per-surface authoring, cancellation, saved round-trip and snapshot-execution tests pass.

### Phase 5 — Removal audit and integration

Remove dead exports, fixtures and adaptation-only runtime code; update current docs. Verify deliberate exceptions only in immutable history/conversion evidence. Run multisport ingestion and provider regressions, full relevant validation and independent review.

Exit: no active adaptive activity-plan contract or consumer; all templates fixed; integration criteria below met or explicitly blocked.

### Phase 6 — Separately authorized environment cutover

Execute approved inventory/backup/conversion/deployment plan only with explicit authority. Verify counts, constraints, snapshots, jobs and old-client rejection. Local implementation completion is not remote delivery.

Default to one writable lane. If implementation is parallelized, load `parallel-worktrees`, assign clean separate worktrees and exact ownership, and integrate Core contracts before dependent writers. Do not send multiple writers into the existing dirty checkout.

## 12. Verification and acceptance gates

| Risk/requirement | Required evidence |
| --- | --- |
| Schema simplification | V4 parsing rejects segments/adaptation; validates bounds, IDs, target compatibility, untargeted steps and optional text |
| Template loss | All catalog members validate; old/new executable signature comparison at old declared defaults; stable identity/reference report |
| Selected schedules reset | Non-default old snapshot converts to equivalent concrete V4 prescription, despite different mutable template defaults |
| Silent automatic scaling | Fixed scheduling/selection tests show authored quantities unchanged; insufficient-fit path explicit |
| Draft deletion | Single/multiple steps show same actions; last deletion leaves invalid editable draft; Cancel restores original; Save cannot persist empty blocks |
| Field lifecycle | Done/Cancel/Back/scrim, stale callbacks, provisional additions, duplicate-no-popup and accepted-edit preservation |
| Text/rest loss | Distinct notes retained; overflow blocks conversion; timed rest remains timed and untargeted with no invented load |
| Hash/revision divergence | Core/API/SQL parity, versioned fingerprints, same-turn conflicts and repeated conversion no-op |
| Replay duplication | Direct scheduling and training-plan application replay preserve prior results; stale previews fail explicitly |
| Snapshot mutation | Source-plan edits do not alter captured prescriptions; ordinary DB updates remain forbidden after migration |
| Security | Existing owner/system-template boundaries and malformed/obsolete DTO rejection |
| Multisport regression | FIT/artifact parsing, ingestion, parent/leg composition, partial timing, duplicates and no double-counting |
| Provider/recording regression | Frozen-snapshot execution/export, unsupported untargeted export behavior, pending-job/recovery cutover rules |
| Complete removal | No active adaptive-plan imports, API/DB fields, resolver enumeration or UI; scoped dependency/dead-code checks |

Use `mise exec node@24 --` with package-owned commands. Run narrow tests during iteration, then Core/API/UI/web/mobile typechecks and relevant test suites. DB-owned changes require applicable local DB verification and generated-schema/fingerprint checks. Run `pnpm quality:agent` before final integration; do not weaken unrelated checks to claim success.

Existing checkpoint: the latest localized mobile change passed 191 activity-plan tests. Earlier repository gate failed six unrelated goal/recording terminology findings. Neither result verifies this proposed migration. Re-establish evidence on the implemented final state.

Pair web journeys and native component tests with available runtime checks for sheets, wrapping targets, keyboard, drag, Delete and screen-reader focus. If no device/runtime is available, report that gap explicitly; component classes alone do not prove visual acceptance.

## 13. Documentation reconciliation

Update these current references during implementation, preserving unrelated requirements:

- `docs/integrated-training-activity-planning-specification.md`: remove active adaptation requirements, replace V3 planning hierarchy, retain frozen prescriptions.
- `docs/training-plan-ux-parity-specification.md`: fixed candidate policy, no adaptation controls, retain completed multisport summaries.
- `docs/training-plan-builder-implementation-audit.md`: distinguish new verified behavior from historical adaptive implementation.
- `docs/form-ux-remediation.md`: uniform rows, always-visible Delete, empty draft and superseded last-step protection.
- Projection/system-integrity documents: explicitly retain completed multisport contracts.

Historical SQL remains historical. Do not rewrite applied migrations to make text searches empty; add authorized forward changes. Use scoped removal assertions rather than banning the word `adaptation` globally and accidentally deleting unrelated concepts.

## 14. Decisions and remaining gates

Recommended decisions in this specification: V4 blocks/steps; optional step name; one instructions field; zero-to-three targets; default conversion of current templates; concrete-snapshot conversion of selected sessions; hard cut without a permanent V3 runtime; no new atomic brick scheduling.

Before implementation reaches dependent phases, resolve with evidence:

- Exact template and stored-record counts, long-text exceptions and functional purpose consumers.
- New manifest version and existing fingerprint/idempotency storage coverage.
- Provider readiness for untargeted steps and equivalent rest execution.
- Whether the authorized target environment contains active recordings, queued exports or older clients.
- Approval for concrete DB schema changes and any stored-data mutation.

Missing remote evidence blocks remote cutover, not local source inventory or conversion fixtures. Final delivery reports must distinguish specification, code implemented, checks executed, migration rehearsed and environment actually converted.

## 15. Definition of done

All source templates use the fixed V4 model; active activity-plan adaptation is gone across all owners; UI behavior is consistent for all step counts; stored content has a tested, explicit preservation path; scheduling/execution use immutable concrete prescriptions; completed multisport contracts remain intact; all relevant checks pass or integration is clearly marked blocked. No silent fallback to V3, unapproved data reset, inferred migration success or unexplained template loss is acceptable.

## 16. Execution evidence — initial checkpoint

These are pre-cutover checks, not evidence that V4 has been delivered:

- Core completed-artifact/ingestion composition baseline: 3 files, 45 tests passed (`fit-sdk-parser`, `decoded-artifact`, `effective-composition`).
- API parsed-file ingestion baseline: 1 file, 29 tests passed.
- DB static verification passed, including disposable-target safety and guarded reset workflow tests.
- Full DB verification was attempted against disposable local targets. Schema parity, fingerprint, RLS/ACL, storage and lint checks passed before the fresh-target diff gate failed. The CLI returned a JSON completion envelope with `diff: "\n"`; `verify-fresh-target.ts` currently treats any nonempty stdout as a schema diff. This is a verification-tool compatibility issue to resolve with explicit empty/nonempty/error-output tests, not permission to bypass the diff gate. Full DB verification is not green.
- No repository-managed persistent database reset has been executed at this checkpoint.

## 17. Execution evidence — V4 integration checkpoint (2026-09-30)

- The conversion inventory covered 94 system activity templates, 40 adaptation-bearing definitions and 49 controls. All 94 converted at declared defaults without reported catalog exceptions. Timed rest conversion was separately exercised because the source catalog had no rest segments.
- Active Core structure/authoring/compiler/estimate/resolution contracts now use fixed V4 blocks/steps. Manifest resolver and policy are V2; activity-plan semantic hashes are V2, while structure/training-plan/fingerprint V1 hashes remain distinct contracts. Recording compiler/snapshot epochs are V2. Removed activity-plan adaptation symbols have no active app consumers.
- Package checkpoints: Core 262 files / 2,265 tests passed (one skipped); API 225 files / 2,099 tests passed; mobile 256 native suites / 1,376 tests passed (two skipped), plus 85 Vitest files / 506 tests; web 172 Vitest files / 865 tests. Package typechecks passed at their respective handoffs; final integrated reruns remain authoritative.
- Recorder review found and corrected automatic trainer-load persistence into untargeted steps. Automatic navigation now waits for confirmed release, failure prevents committing the boundary, manual control is retained, and no synthetic zero-power target is fabricated. Service and encoder tests cover one FIT session across V4 blocks with occurrence laps. API regression coverage preserves one completed session across same-category blocks while retaining explicit genuine multisport transitions.
- Full `db:verify` passed on Node 24 after the strict CLI JSON empty-diff handling correction, including disposable schema/determinism, security, storage, lint and benchmark gates. The prior shadow-creation failure did not recur in the successful guarded rerun.
- User-authorized `db:reset:mvp` ran once against the guarded repository-managed local target. The forward V4 migration applied and seed verification confirmed 94 activity templates plus 6 training-plan templates. No hosted/production database was changed.
- Architecture, guidance and test-structure checks pass. Current-contract checking still reports six pre-existing goal/recording terminology findings; two newly introduced messages were corrected. The repository-wide quality gate is not yet claimed green.
- Native hardware, physical-device accessibility and real BLE/FTMS command execution remain unverified. OpenChamber browser interaction was unavailable because no controllable desktop client was connected; browser acceptance needs another available runtime.
- Independent authoring and Core/DB review is in progress. Local files remain uncommitted; no push, release or deployment occurred.

## 18. Final delivery evidence (2026-09-30)

This section supersedes the intermediate failures and pending gates in sections 16–17.

- **Repository gate passed:** `TURBO_CONCURRENCY=1 mise exec node@24 -- pnpm quality:agent`. This is the same changed-scope full QA profile, with package tasks serialized to avoid the observed parallel test timeouts; no tests, timeouts, schema checks or QA requirements were disabled. It includes generated-artifact checks, Biome, architecture/guidance/test-structure/current-contract checks, all workspace typechecks and strictness ratchet, workspace tests and parity, dependency checks, DB verification, public-share live-DB visibility and the selected browser recovery smoke journey.
- **Database verified and reset/reseeded:** both forward V4 migrations are installed on the guarded local environment. The initial reset was followed by a second authorized reset after the strict-manifest corrective migration, ensuring the actual development target matches the final code. The catalog contains 94 system activity templates and 6 training-plan definitions. The separate disposable E2E project was recreated using its existing guarded `db:e2e:recreate` workflow and confirmed at all 15 migrations. No hosted/production database was modified.
- **Real scheduling boundary proved:** disposable tests resolve a real Core candidate and insert its manifest into PostgreSQL. Activity-plan semantic hashes are V2; manifest fingerprints and structure/training-plan hashes remain V1. SQL rejects missing/unknown manifest fields (including retired adaptation values) and nil block/step IDs. The corrective migration is `20260930000000_strict_v4_resolution_manifest.sql`; applied earlier migrations were not rewritten.
- **Post-review parity correction (local, forward-only):** `20261001000000_activity_plan_authoring_parity.sql` preserves the V1 structure/training-plan/fingerprint contracts while requiring a resolved-structure hash that equals `activity_plan_core_structure_hash(resolved_structure)`. It also brings SQL new-authoring validation into parity with Core (no `untilFinished`, category duration policy, repetition/RPE-only policy, cadence-only targets, half-step RPE, `%MaxHR` ≤100, and positive distance speed), and measures the 1 MiB limit from compact Core-compatible UTF-8 JSON rather than PostgreSQL storage size. The guarded disposable authoring test passed these SQL rejections plus exact-limit and one-byte-oversize Core/SQL boundary checks; the documented `db:verify` disposable migration, fingerprint, security, lint, schema-diff, and dependent DB suites passed after the correction. Scheduling projections now advertise scheduling only for owner/system plans; a public read remains readable/recordable but is not represented as directly schedulable. Resolver evidence gaps return an actionable `PRECONDITION_FAILED`, while actual authorization failures remain `FORBIDDEN`.
- **Catalog and estimate review closed:** all 94 active templates use the captured fixed materialization and are compared for executable/text parity. `%MaxHR` resolution retains the fresh MaxHR and LTHR evidence required for Common Load. Latest Core checkpoint: 262 files, 2,267 tests passed, one skipped.
- **Web authoring review closed:** raw invalid drafts remain visible and prevent save; target drafts survive deletion/reindexing and duplication without leaking into another target; category incompatibilities require confirmation and remain repairable; target type changes use valid defaults; successful persistence is latched independently of navigation failure; same-turn duplicate submits are rejected; failed saves focus the re-enabled Save button. Latest web unit checkpoint: 172 files, 873 tests passed.
- **Browser authoring passed:** `apps/web/e2e/specs/activity-plans.spec.ts`, two journeys each on Desktop Chrome and Mobile Chrome 390×844. The journeys cover discovery, fixed V4 create/edit, raw invalid-input recovery, explicit zero target persistence, duplicate/delete, comments, UI scheduling with stored-manifest verification and planned-history deletion protection. Parity registry references the actual current journey identity.
- **Other package checkpoints:** API 225 files / 2,099 tests; mobile 256 native suites / 1,376 tests (two skipped), plus 85 Vitest files / 506 tests; shared UI 68 web files / 201 tests and 65 native suites / 214 tests. The final repository gate is authoritative over these individual earlier checkpoints.
- **Operational reliability:** Supabase CLI failures now retain bounded, credential-redacted diagnostics rather than only a generic command error. The earlier intermittent shadow-create failure could not be retrospectively explained; subsequent fresh/determinism/full verification and the final repository gate passed without masking failures or skipping the diff check.
- **Verification limits:** no physical iOS/Android device, VoiceOver/TalkBack session, or actual BLE/FTMS trainer command/reconnect was exercised. Recorder release/failure behavior has service-level regression coverage and the FIT encoder has a single-session round-trip test. Browser coverage does not substitute for native-device acceptance.
- **Delivery:** all changes remain local and uncommitted. No push, publication, hosted migration or deployment occurred. Existing unrelated checkout work was preserved; small integration repairs were limited to strict optional-field construction, canonical first-party terminology and a reviewed explicit UI ownership inventory.

Evidence locations:

- Final repository gate log: `/home/deancochran/.local/share/opencode/activity-plan-v4-final-quality-serial.log`.
- Final full DB verification/reset logs: `/home/deancochran/.local/share/opencode/activity-plan-v4-final-db-verify.log` and `activity-plan-v4-final-reset.log`.
- Template conversion inventory: `artifacts/activity-plan-simplification/phase-1-catalog-summary.json`.
- Desktop authoring capture: `apps/web/test-results/run-538504/activity-plans-V4-authorin-b846a-chedules-its-fixed-manifest-Desktop-Chrome/v4-authoring-recovered.png`.
- Mobile-browser authoring capture: `apps/web/test-results/run-540935/activity-plans-V4-authorin-b846a-chedules-its-fixed-manifest-Mobile-Chrome-390x844/v4-authoring-recovered.png`.

## 19. Approved UX revision — derived naming and progressive interval inspector (2026-10-03)

**Status: implementation in progress; Core/API/SQL naming support is available and the mobile inspector now has the app-owned peek/expanded gesture transaction path. Native visual acceptance remains a gap.** This section supersedes conflicting earlier naming, authoring-default, and interval-sheet requirements. Section 18 remains historical execution evidence, not evidence for this revision. An interval is the user-facing presentation of a V4 block; this does not introduce another execution hierarchy.

### 19.1 Naming hierarchy

Targets inform automatic step labels; effective step labels inform automatic interval labels. Use deterministic, localized Core presentation rules shared by detail, preview, and editing, not AI-generated prose or per-screen heuristics.

- Effective step label: non-empty custom step name, otherwise the automatic label derived from its authored targets.
- Effective interval label: non-empty custom interval name, otherwise a short composition of its effective step labels and repetition count.
- Persist only explicit overrides. Never write computed labels into authored name fields, including on save, duplication, or hydration.
- Accepted target/step/repetition edits recompute automatic labels. Custom names remain unchanged. Clearing an override restores automatic naming immediately; cancelling its edit restores the prior accepted state.
- Labels do not replace prescriptions: duration/distance, exact targets, and entered instructions remain readable beneath them. Do not duplicate the same single-step name in both an interval heading and its child row.

### 19.2 Automatic step labels

| Authored information | Label policy |
| --- | --- |
| No targets | `Untargeted`; never infer zero effort or a mandatory target |
| RPE | Use a supported effort-band label, such as `Easy effort` or `Hard effort` |
| Absolute speed / running pace | `Pace effort` for running; appropriate category-aware speed wording elsewhere |
| Absolute power | `Power effort`, not an inferred physiological zone |
| Absolute heart rate | `Heart-rate effort`, not an inferred physiological zone |
| Cadence | `Cadence effort` where part of a valid prescription; naming does not relax authoring policy |
| Explicit relative intensity | More specific effort wording only where an existing documented domain rule supports it |
| Multiple targets | One primary automatic label using a documented stable precedence; retain all targets in the prescription |

Automatic names must be stable across viewers. Do not classify an absolute pace, power, or heart rate from the viewing athlete's thresholds. Athlete-personalized target interpretation remains separate from naming. Do not infer workout purpose such as `Warm-up` or `Cool-down` from position alone.

The approved Core naming rule uses the accepted RPE range (1–10, including fractional values) with inclusive bands: 1–3 `Easy effort`, >3–6 `Moderate effort`, >6–8 `Hard effort`, and >8–10 `Very hard effort`. Its primary-target precedence reuses the existing stable presentation order: RPE, %FTP, %ThresholdHR, %MaxHR, watts, bpm, speed, cadence; ties remain semantically identical. Relative power and heart-rate targets intentionally retain neutral `Power effort` and `Heart-rate effort` wording because no existing documented domain rule supports a more specific classification. This rule uses only authored category and targets, never viewer facts or a step's position.

### 19.3 Automatic interval labels

- One step, one execution: use its effective step label.
- A short distinct sequence: compose concise effective labels in execution order, e.g. `Easy / Hard`.
- A repeated short sequence: prefix the repeat count, e.g. `5 × Hard / Easy`.
- Homogeneous multi-step content: use a concise family label such as `Pace sequence`.
- Long or varied content: use `Mixed sequence`, or `5 × Mixed sequence` when repeated; do not concatenate the full workout into the title.
- Custom step names participate in interval naming, without altering or stripping meaning from user-authored text. The Core composition budget is at most three step labels and 48 Unicode code points (not UTF-16 code units); exceeding either uses the deterministic `Mixed sequence` fallback. The compact interval form may remove the ` effort` suffix only from a known automatic label, never from a custom name; preserve full names in the expanded rows and accessible descriptions.
- Do not generate an interval description that merely restates its title or step list. The compact prescription preview supplies that information. Existing step instructions remain owned by their steps.

### 19.4 Interval selection and sheet states

| State | Presentation and behavior |
| --- | --- |
| No selection | Main draggable interval list; no interval sheet |
| Selected / peek | Highlight selected interval; reveal only the shallow sheet header with its effective title and side-by-side `Add step` / `Duplicate interval` actions. The editor body is not partially rendered while the native sheet is dragging. |
| Expanded | After the sheet settles at its expanded snap point, render the full interval editor: optional name override, repetitions, and draggable step rows laid out like the main interval rows. |
| Editing a field | Edit within the same sheet with a contextual field title; a downward close gesture accepts only a valid field and snaps the native sheet back to its visible index. No stacked sheets or Done buttons. Header Cancel/Back discards that field transaction. |

When a settled expanded sheet collapses to peek, validate and commit the interval once; invalid drafts remain expanded and retain their raw input. A guarded pan-to-dismiss is routed to the transaction owner once and then snapped back to the actual visible index, so it cannot unmount content before the decision. Header Cancel/Back discards unaccepted interval edits and clears selection. Switching away from a dirty interval requires an explicit apply/discard decision; clean selection switches update the same inspector. Preserve existing stale-callback, provisional-addition, deletion, and capacity guards.

Add step creates an incomplete local step requiring explicit completion input, not a five-minute prescription. Duplicate interval remains staged until the valid collapse commit; Cancel discards the staged copy, and the UI must make this pending state clear. A successful commit clears the staged request so duplicate callbacks cannot repeat the copy. Duplication preserves explicit overrides and content, creates fresh identities, and does not open another editor.

### 19.5 Visual invariants and scope

- Leave the existing Distance / Duration / Load / Intensity metric row unchanged.
- Standalone interval and step rows put the drag handle at the far left, readable content in the flexible middle, and visible copy/delete actions at the far right. Content wraps inside the middle, not below a separate action header.
- Repeat groups expose their child steps inline with a compact repeat heading and disclosure; avoid repeated `Edit block` labels and generic review placeholders.
- Keep blank creation free of implied names, categories, durations, target quantities, or repeat prescriptions. An explicit launch context or selected template is not an implicit default. Safe privacy defaults remain separate.
- Persisted step-name overrides already exist. Interval-name overrides are an optional, explicitly authored V4 block `name`: it is trimmed, bounded like a step name (1–100 Unicode code points), omitted when cleared, and never auto-populated from a derived label. The override participates in Core structure and semantic hashes and therefore a structure revision; compiler/execution output intentionally does not carry it. Core/API/SQL accept the field and reject unknown fields; older unnamed blocks and frozen snapshots remain valid. The forward migration is additive and does not backfill names or rewrite rows.

### 19.6 Implementation order and acceptance evidence

1. Specify and test deterministic naming rules, effort bands, target precedence, category wording, composition budgets, and fallback behavior in Core.
2. Implement the separately approved optional interval-name storage contract across Core/API/SQL and prove hashes, revisions, strict-field rejection, and older unnamed snapshots.
3. Reuse the naming presentation in detail, the main editor, and the inspector. Implement no-selection/peek/expanded/field states without replacing proven transactional logic.
4. Add regression fixtures for targetless, multi-target (including reversed authored ordering), relative targets, custom names, clears, duplicates, long names, repeated sequences, and different viewing-athlete contexts. Same authored content must produce the same automatic names across viewers.
5. Prove selection switching, swipe collapse versus dismissal, dirty apply/discard, provisional additions, staged duplication, limits, stale callbacks, and field cancellation. Verify names never enter payloads unless explicitly overridden.
6. Compare actual native screenshots at peek and expanded heights against the agreed hierarchy, including narrow screens, keyboard, drag, and accessibility. Component tests alone do not establish sheet-height or visual acceptance. Report unavailable runtime evidence explicitly and run the final repository gate for implemented changes.
