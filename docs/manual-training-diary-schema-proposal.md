# Manual activity completion: approved storage direction

Status: activities-based local schema implementation approved; implementation and verification remain incomplete. The user reaffirmed using `activities`, not a separate manual-report table. Local migration files exist; no migration application is authorized. This supports D1-D2 of the [planner specification](training-plan-ux-parity-specification.md), not a new analytics product.

UX correction: completion belongs directly in the existing planned-session detail screen on web/mobile. Use "Mark complete", "Mark partially complete", and "Skip" with existing shared controls. Do not introduce standalone completion modals or user-facing "diary" terminology. Technical names containing `diary` are internal and do not require unrelated storage renames.

Manual confirmation is allowed for today or past sessions in the athlete's planning timezone. It must not prevent a later recorded/imported activity from being associated with the same planned session. That reconciliation must preserve the confirmation and provider provenance while preventing double-counting; it remains a required, not yet verified implementation path.

## Decisions already made

- Quick scheduling remains catalog-based. A user explicitly selects an owned/system workout; no hidden interval selection or ad-hoc execution contract is introduced.
- Recorded/imported and manually entered completed training should share one canonical activity authority where feasible. Do not introduce another executable calendar or a parallel manual-activity store merely to bypass current constraints.
- A completion click is not a measurement. Unknown actual duration/distance stays unknown. No planned metric is automatically promoted to observed data.

## Current blockers verified in source

- `packages/db/src/schema/tables.ts` activity records require start/finish times, positive elapsed time, and distance defaulting to zero. Those constraints cannot honestly represent a status-only completion.
- Recording/import entrypoints require artifacts/segments. The current "manual import" is a file upload, not scalar manual diary entry.
- `packages/core/calendar/planned-session.ts` and planned-session DB constraints model scheduled/cancelled/completed with linked-activity or deleted-activity completion. Partial and skipped outcomes have no explicit contract.
- `activities/record-session-rpe.ts` already supports idempotent manual RPE evidence, but requires an activity identity.

## Proposed minimal model changes

These are semantic requirements to translate into a reviewed migration; field names are proposed, not existing APIs.

### 1. Manual provenance and optional actual values on canonical activities

- Add explicit manual-entry provenance distinct from recording, file import and provider sync. Inspect existing source references and use them where possible; a manual entry needs a known source even without an ingestion artifact.
- Allow actual duration/distance to be null for manual entries. Present numbers remain finite, nonnegative, unit-normalized actual reports; retain stronger checks required for recorded/imported activities. Removing the distance default must not relabel historical zeroes as unknown.
- A status-only entry needs a performed civil date plus timezone without pretending midnight was a measured start. Propose a diary date field for manual entries and nullable exact start/finish timestamps when not reported. Do not fabricate finish time from the plan. Assess all timestamp-required readers before adopting this change.
- Do not force a segment or artifact for a manual report. Keep artifact/stream checks for recording/import paths. Notes use existing storage where appropriate.
- RPE uses the existing evidence path once the canonical manual activity is created; mark it reported, not sensor-measured.

This is a meaningful nullable-contract change, not a tiny DB patch. Generated types, sorting, list/detail cards, analytics, provider export and aggregate readers must be audited and tested together. If the migration footprint is too large, return with a revised proposal rather than silently inventing values.

### 2. Completion outcome separate from measurement source

- Full/partial describe the athlete's reported outcome; manual/recorded/imported describe evidence source. Do not encode both concepts into one overloaded status.
- Manual full/partial completion creates one canonical manual activity and links it transactionally to the planned session. Store the reported outcome without changing the frozen prescription.
- Skipped is an explicit planned-session outcome with no performed activity and no actual duration/load. It is distinct from cancelling/removing a planned session.
- Existing recorded/imported linking stays supported. A completion with no activity because the athlete skipped must not be disguised as `activity_deleted`.
- Completion correction uses expected revisions and explicit authorization. Detaching a mistaken completion does not delete a recorded/imported activity. Keep historical provenance; never use plan-edit commands to erase actual training.

### 3. Idempotent creation and correction

- Manual submission carries owner scope and a stable operation ID. Same ID and payload returns the original durable result; changed payload conflicts. Use an existing operation mechanism if its semantics fit, otherwise propose the minimum unique owner/operation constraint and request fingerprint.
- Creating activity, linking full/partial outcome, and recording initial RPE must be one transaction or a recoverable idempotent sequence with truthful result states. No UI success until durable acceptance is known.
- Recheck planned-session revision and start/completion ownership before linking. A race against an import or another completion returns a reviewable conflict, not a second completion.

### 4. Later import/recording reconciliation

- Never automatically merge records based only on similar date/distance. Preserve existing provider/artifact identity deduplication.
- When the same workout has a manual report and an imported recording, offer explicit association/reconciliation. The accepted result must contribute once to summaries while preserving manual notes, reported outcome and original provenance.
- Before implementing, specify which canonical identity survives and how existing source references, RPE and planned-session links are transferred without deletion. Do not add a merge button until transaction/uniqueness and retry tests cover that transfer.
- While unresolved, show a possible duplicate rather than suppressing a valid activity silently. Do not claim complete diary functionality until the reconciliation acceptance test passes.

## Summary contract

Calendar and weekly summaries retain separate components:

- Planned: frozen expected values from the scheduled prescription.
- Actual: known reported/measured values only, with source and missing-value counts.
- Outcome: scheduled, full, partial, skipped or cancelled, with explicit meaning.

Full/partial counts can be known when actual duration is unknown. Zero is included only if explicitly reported and valid for that field. RPE without actual duration cannot yield a duration-based load. Planned values may be compared, never substituted.

## Affected ownership

- Core: activity observation and planned-session outcome schemas, summary rules and null handling.
- DB: approved activity nullability/provenance/diary-date changes, lifecycle checks and operation uniqueness; preserve nonmanual constraints.
- API: new manual entry/completion orchestration, existing activity/RPE/linking repositories, calendar/timeline/period review readers, import reconciliation.
- Web/mobile: small manual log/completion form, optional actual fields, explicit skipped action, actual-versus-planned presentation and correction/reconciliation review.
- Existing recorder/imports: regression protection only; no new recording modes or provider integrations.

## Required evidence before release

1. Manual status-only completion produces no fabricated elapsed time, distance, load or start/finish measurement.
2. Partial training and skipped outcomes differ in counters; skipped produces no actual activity.
3. Manual create retries and completion/import races cannot double-count or link twice.
4. Planned values remain unchanged after manual completion/correction.
5. Recorded/imported constraints, evidence and source references remain valid after schema changes.
6. Missing metrics remain visible in both apps and all affected summaries; no null-to-zero coercion.
7. Explicit reconciliation preserves original provenance and yields one counted activity; retry is safe.
8. Owner/delegated access and stale revisions are checked server-side.

## Remaining implementation and application gate

The canonical-activity nullable observation model and local changes are approved. Complete the exact schema/reader impact tests and reconciliation before claiming readiness. Applying any migration to a database requires separate explicit approval. Other schema-independent planner work can continue.

Local schema and migration changes are present and must be reviewed and verified before application. No production readiness claim is made.
