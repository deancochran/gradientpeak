# Integrated training and activity planning specification

> Activity-plan supersession (2026-09-30): the [fixed V4 activity-plan specification](activity-plan-simplification-specification.md) replaces this document's V3 segment/interval hierarchy and authored adaptation requirements. Active activity plans are single-sport fixed blocks/steps; templates no longer enumerate adaptive variants. Frozen concrete prescriptions, training intent, authorization and completed multisport ingestion remain required. Earlier adaptation sections below are historical design context, not current implementation requirements.

## Status and decision

Authoring correction (2026-09-17) takes precedence over any earlier durable-draft proposal or phase requirement: there is no persisted-draft product, table/service, save-draft/resume flow, or autosave requirement. Open-editor input, invalid text, and frozen retry requests are temporary form state. Web `TrainingPlanEditor` and mobile `TrainingPlanBuilderScreen` each own create/edit; detail is for viewing and canonical Edit/linked-read navigation. Visibility and session-definition edits require explicit editor Save; Cancel/back uses the standard discard guard. Preserve technical API `draft`/revision/source contracts, recording recovery, and authorized copy/apply/social/removal/delete operations. This UI correction authorizes no DB changes or recorded-data deletion. See [form experience contract](form-experience-contract.md).

This specification defines the hard-cut target for integrating GradientPeak training plans, activity plans, athlete evidence, scheduling, recording, and provider delivery.

The governing model is:

> Training plans define why and when. Activity plans define how. Planned sessions freeze exactly what the athlete will perform.

The implementation must converge on one deterministic server-side prescription resolver and one executable scheduling authority. Activity-plan variants, dose-only activity-plan copies, profile-level training preferences, executable calendar-event scheduling, parallel estimators, and compatibility paths are removed rather than maintained. Duration, distance, repetitions, recovery, or intensity changes are adaptations. A materially different protocol or structural topology is a separate activity plan.

This is a pre-production hard cut. Repository-managed local data may be reset and reseeded after the schema and application changes land. No legacy planning or scheduling data migration is required. Hosted or production database work remains a separate explicitly authorized operation.

The current implementation is not compliant with this specification and must not be treated as an intermediate production contract. Known starting-point defects include stale profile-preference consumers, a required activity-plan ID on every persisted training-plan session, training-plan application that creates unlinked event mirrors, provider delivery from mutable activity plans, and preview that requires a published athlete baseline. The phases below remove these paths rather than preserve them.

### Relationship to existing plans

For the planning surfaces named here, this approved pre-production hard cut supersedes compatibility and backfill guidance in broader integrity roadmaps. It does not weaken authorization, privacy, transaction, idempotency, provider-recovery, or verification requirements. Unsupported planning DTOs, queued planning operations, and persisted mobile planning state are invalidated at the contract-epoch boundary rather than migrated. Compatibility requirements for unrelated product areas remain unchanged.

## Implementation objective

Implement a hard-cut, fully integrated planning system in which a training plan owns all planning preferences and session demands, one deterministic server-side resolver combines those inputs with optional athlete evidence and versioned system defaults to select and safely adapt canonical activity plans, and each result is frozen as the sole executable planned-session prescription used by Calendar, recording, completion analysis, and provider delivery. Remove profile-level training preferences, all activity-plan variant contracts, dose-only activity-plan copies, executable event mirrors, recurring executable events, duplicate estimators, client-side planning authorities, and all associated legacy contracts and persistence. Keep materially different protocols or structural topologies as independently identified activity plans. The objective is complete when no-context, sparse-context, and rich-context plans resolve predictably through the same pipeline; preview and apply produce identical fingerprints; scheduled prescriptions remain immutable; the repository-managed database resets and reseeds into only the target model; and all specified contract, integration, performance, architecture, and end-to-end verification gates pass.

## Product outcome

GradientPeak must support useful planning when athlete context is absent, improve prescriptions as trustworthy evidence becomes available, and preserve the exact scheduled workout once it becomes executable.

The system must:

1. Produce conservative and explainable plans without athlete evidence.
2. Apply training-plan preferences consistently to schedule shape and session demand.
3. Use athlete evidence only when it is available, fresh, and relevant.
4. Adapt workouts only through curator-declared semantic controls and allowed states.
5. Return an explicit input-needed or unsupported result instead of inventing capability.
6. Use the same resolver for preview, apply, direct scheduling, estimation, and provider delivery.
7. Freeze every executable prescription in an immutable planned session.
8. Allow future planning algorithms to improve without rewriting historical prescriptions.

## Goals

- One understandable model for manual, template-based, and generated training plans.
- One plan-owned preference contract with observable behavior.
- One canonical activity-plan structure and one bounded adaptation model.
- One versioned system fallback policy.
- One deterministic resolution result and vocabulary.
- One executable resource: the planned session.
- One estimate calculated from the resolved prescription.
- One calendar read model combining planned sessions with non-executable events.
- Safe idempotency, concurrency, replacement, and provider delivery.
- Bounded execution and measurable performance at current and future catalog sizes.

## Non-goals

- Preserving profile-level training preferences or their data.
- Preserving any activity-plan variant contract, persistence, identity, or terminology.
- Preserving dose-only Base, Build, Advanced, Race, duration, intensity, or progression copies as independent plans.
- Preserving executable activity scheduling through generic events.
- Supporting recurring executable events outside training plans.
- Automatically rewriting already scheduled prescriptions when context changes.
- Inferring physiological thresholds from experience labels.
- Supporting arbitrary user-authored formulas or unconstrained activity transformations.
- Introducing machine learning, background optimization, or speculative recommendation services before the deterministic resolver is complete.
- Predicting future fitness, fatigue, readiness, FTP, pace, or heart-rate thresholds to alter prescriptions automatically.
- Encoding environment, equipment, modality, surface, pool length, or exercise taxonomy in the initial adaptation contract.
- Maintaining multiple contract versions for unsupported clients during this hard cut.

## Canonical vocabulary

Use these terms consistently in Core, API, database, applications, tests, and user-facing explanations.

| Term | Meaning | Authority |
|---|---|---|
| Activity plan | Reusable executable workout definition | Activity-plan revision |
| Training plan | Goals, plan preferences, and intended session demands | Training-plan revision |
| Session demand | Why a training session exists and what dose it seeks | Training plan |
| Athlete context | Timestamped evidence about current capability and state | Published athlete-state revision |
| System planning policy | Versioned defaults, fallback rules, and safety rules | Core policy version |
| Prescription resolution | Deterministic selection of an activity plan and adaptation values | Prescription resolver |
| Planned session | Immutable resolved prescription plus mutable scheduling lifecycle | Planned-session revision |
| Calendar event | Non-executable race, reminder, or custom calendar entry | Event revision |
| Resolution fingerprint | Stable identity of all inputs and policy versions affecting resolution | Core resolver |

Do not introduce synonyms such as variant, workout option, difficulty version, progression version, planning profile, effective event prescription, or builder-only plan shape. Resolved adaptation values are not an independently identified activity-plan definition.

## Authority model

### Training plan: why and when

A training plan owns:

- Name and description.
- Goals.
- Start date or reusable relative schedule.
- Plan-level preferences.
- Session demands.
- Revision and semantic hash.

A training plan does not own copied activity structures, athlete physiology, provider state, recording state, or mutable calendar mirrors.

### Activity plan: how

An activity plan owns:

- Canonical V3 structure.
- Training intent.
- Optional semantic adaptation controls and allowed states for the canonical structure.
- Revision and semantic hash.
- Recording and target capabilities that follow from the structure.

An activity plan does not own athlete-specific values, scheduled dates, training-plan preferences, projected physiology, or resolved prescriptions. A materially different protocol or structural topology receives a separate activity-plan identity rather than a nested variant identity.

### Athlete context: known facts

Athlete context owns timestamped evidence and provenance, including:

- Supported thresholds and performance targets.
- Recent and long-term training load.
- Relevant completed activity history.
- Wellness facts.
- Explicit manual evidence.
- Freshness, coverage, and confidence.

Unknown evidence remains unknown. Experience level is not physiological evidence.

The resolver accepts an explicit planning baseline union:

```ts
type PlanningBaseline =
  | { status: "available"; context: AthletePlanningContext; revision: number }
  | { status: "no_context"; asOf: string };
```

`no_context` is a supported resolver input, not an error or stale-state condition. A missing published athlete baseline must therefore select the versioned system fallback policy instead of blocking preview or application.

### System planning policy: product defaults

One versioned Core policy owns:

- No-context defaults.
- Preference default values.
- Hard safety bounds.
- Fallback order.
- Candidate ranking rules.
- Resolution reason codes.
- Intent validation dispatch.

Defaults must not be represented as an athlete profile. Replace `defaultAthletePreferenceProfile` semantics with a name such as `DEFAULT_TRAINING_PLAN_POLICY_V1`.

### Planned session: exact prescription

A planned session owns:

- Planning date and lifecycle.
- Source training-plan identity and revision, or direct scheduling operation identity.
- Activity-plan identity and revision.
- Resolved parameter values.
- Resolved structure and semantic hash.
- Resolved intent.
- Prescription estimate.
- Resolution fingerprint, fallback level, reason codes, and policy version.
- Athlete-context revision when evidence affected the result.
- Capture timestamp.

Calendar, recording, completed-activity comparison, and provider delivery use this snapshot. They never reload the mutable activity-plan structure to determine the scheduled prescription.

## Target domain contracts

The examples below define semantic shape, not required field spelling.

### Training plan

```ts
type TrainingPlanV1 = {
  schemaVersion: 1;
  id: string;
  name: string;
  description: string | null;
  goals: TrainingPlanGoal[];
  preferences: TrainingPlanPreferencesV1;
  sessions: TrainingPlanSessionV1[];
};
```

### Plan-owned preferences

The initial supported preference set is intentionally small:

```ts
type TrainingPlanPreferencesV1 = {
  weeklySessionCount: number | null;
  targetWeeklyDurationMinutes: number | null;
  maximumSessionDurationMinutes: number | null;
  preferredWeekdays: Weekday[];
  restDays: Weekday[];
  progressionStyle: "conservative" | "balanced" | "ambitious" | null;
  recoveryPriority: "low" | "balanced" | "high" | null;
};
```

Rules:

- `null` means use the system policy default.
- Hard constraints and soft preferences must be distinguished in resolver code.
- Every exposed preference must have an executable contract test proving its observable effect.
- Additional preferences are added only when a concrete planning behavior and acceptance test exist.
- Availability, dose, adaptation, calibration, and goal-strategy internals are derived policy, not independent user-facing schemas.

Initially remove or defer target surplus, priority tradeoff, systemic fatigue tolerance, key-session density, strength priority, double-day tolerance, long-session fatigue tolerance, detailed taper style, recency influence, and optimizer weights. Reintroduce only proven product controls.

### Training-plan session

Manual, generated, and template sessions share one shape:

```ts
type TrainingPlanSessionV1 = {
  id: string;
  offsetDays: number;
  demand: SessionDemandV1;
  activityPlanId: string | null;
};
```

### Session demand

```ts
type SessionDemandV1 = {
  activityCategory: ActivityCategory;
  trainingIntent: ActivityPlanTrainingIntent;
  targetDurationMinutes: number | null;
  targetCommonLoad: number | null;
  importance: "support" | "normal" | "key";
};
```

An explicit `activityPlanId` means validate and adapt that activity plan. A null reference means the resolver may select an exact compatible candidate from the catalog. Do not create separate manual, recommended, generated, or template session union members.

The persisted training-plan schema must allow the activity-plan reference to be null. The current required reference is removed during the hard cut.

### Semantic activity adaptation

Replace both generic arbitrary-field adaptation and fixed single-target volume/duration/recovery/intensity knobs with one hard-cut bounded semantic contract. There is no legacy adaptation version and no compatibility adapter: all producers, persistence, resolver inputs, tests, and clients move directly to this shape.

```ts
type ActivityPlanAdaptation = {
  controls: AdaptationControl[];
  allowedStates?: AdaptationState[];
};

type AdaptationControl = {
  id: string;
  key: string;
  label: string;
  kind:
    | "interval_repetitions"
    | "step_quantity"
    | "recovery_quantity"
    | "target_intensity";
  range: SemanticNumericRange;
  targets: AdaptationTarget[];
};

type SemanticNumericRange = {
  minimum: number;
  default: number;
  maximum: number;
  increment: number;
};

type AdaptationTarget =
  | {
      type: "interval_repetitions";
      activitySegmentId: string;
      intervalId: string;
    }
  | {
      type: "step_quantity";
      activitySegmentId: string;
      intervalId: string;
      stepId: string;
      quantityType: "time" | "distance" | "repetitions";
    }
  | {
      type: "rest_segment";
      segmentId: string;
    }
  | {
      type: "recovery_step";
      activitySegmentId: string;
      intervalId: string;
      stepId: string;
      quantityType: "time" | "distance" | "repetitions";
    }
  | {
      type: "target_intensity";
      activitySegmentId: string;
      intervalId: string;
      stepId: string;
      targetType: ActivityTargetType;
    };

type AdaptationState = {
  id: string;
  label: string;
  values: Record<string, number>;
};
```

Controls address exact authored segments, intervals, and steps by stable IDs, never array indexes. A curator may expose an interval repetition count, an exact step's time, distance, or repetition quantity, a recovery quantity, or an existing typed intensity target. Multiple controls of the same kind are allowed, and one control may target multiple compatible authored nodes. Untargeted warm-up, main-set, recovery, technique, or cooldown nodes remain fixed.

`allowedStates` is omitted only when every Cartesian combination of control values is valid. When values must move together, it enumerates the complete allowed tuples, such as coordinated work repetitions and recovery during progression or taper. Allowed states do not own structures or independent activity identities.

The contract follows the existing V3 structure primitives and is category-neutral:

- Bike may adapt time, distance, repetitions, recovery, power, heart rate, cadence, speed, or RPE already represented by the structure.
- Run may adapt time, distance, repetitions, recovery, speed, heart rate, cadence, or RPE already represented by the structure.
- Swim may adapt distance, repetitions, timed recovery, speed, cadence, or RPE already represented by the structure.
- Strength may adapt interval repetitions as sets, step repetitions, timed recovery, and RPE already represented by the structure.
- Other activities may adapt only quantities and targets already present in their validated structure.

The adaptation schema does not infer or require environment, equipment, modality, surface, pool length, exercise taxonomy, or athlete-profile capabilities. Those concerns are not invented as planning inputs. If a future product capability needs them, it receives a separate approved contract and evidence source.

The contract must not expose arbitrary object paths, array positions, user-authored formulas, untyped target indexes, or implicit name-based selectors. Core owns the finite transforms.

Required properties:

- Authored default is always valid.
- Applying all control defaults reproduces the authored structure exactly.
- Every target ID exists and matches the control kind, quantity type, semantic role, and target type.
- Target-intensity bounds use the selected target type's canonical unit and saveable limits.
- No two controls write conflicting values to the same field unless every permitted tuple resolves to the same value there.
- A recovery control targets only a rest segment or a step explicitly authored as recovery.
- Minimum and maximum preserve training intent.
- Domain cardinality is calculated before allocation.
- Every permitted state resolves to a valid complete V3 structure and preserves training intent before publication or system seeding.
- Numeric values are finite, bounded, unit-correct, and increment-aligned.
- Resolution is deterministic.
- Unsupported structure/adaptation combinations fail during activity-plan save.
- System-content seeding invokes the same structure-aware adaptation publication validation as normal saves.
- Scheduling selects from the already validated bounded domain and does not repeat publication validation.

### Structurally distinct activity plans

An activity plan always owns exactly one canonical structure. Changes to bounded values within that structure are adaptations. If two workouts require materially different protocols or structural topologies that cannot be expressed through the same curator-authorized controls and allowed states, they are separate activity plans with separate identities, revisions, semantic hashes, and adaptation contracts. They may share descriptive catalog metadata, but that relationship has no effect on prescription identity or resolution.

The initial system-catalog audit therefore retains the 25-by-400-meter Norwegian Controlled Threshold race protocol as a separate activity plan from the adaptive long-repeat protocol. Rønnestad block and repetition progression remains one activity plan expressed through coordinated adaptation controls and allowed states.

### Validation policy

Persist training intent on the activity plan. Resolve its validator from the system policy version. Do not persist freely selectable intent-policy pairs until two policies for one intent have meaningfully different executable behavior.

```ts
validateActivityPlan({
  structure,
  trainingIntent,
  systemPolicyVersion,
});
```

### Resolution result

Use one top-level result vocabulary:

```ts
type PrescriptionResolutionResult =
  | { status: "resolved"; manifest: ResolutionManifestV1 }
  | { status: "needs_input"; missing: MissingPlanningInput[] }
  | { status: "unsupported"; reasons: ResolutionFailure[] };
```

Stale, unavailable, degraded, incompatible, invalid, and blocked may remain reason codes where needed; they are not competing top-level result models.

### Resolution manifest

```ts
type ResolutionManifestV1 = {
  resolverVersion: string;
  systemPolicyVersion: string;
  trainingPlanId: string | null;
  trainingPlanRevision: number | null;
  trainingPlanHash: string | null;
  athleteContextRevision: number | null;
  activityPlanId: string;
  activityPlanRevision: number;
  activityPlanSemanticHash: string;
  sessionDemand: SessionDemandV1;
  adaptationValues: Record<string, number>;
  effectiveTargetDurationMinutes: number | null;
  effectiveTargetCommonLoad: number | null;
  evidenceFacts: PrescriptionEvidenceFact[];
  fallbackLevel: ResolutionFallbackLevel;
  reasonCodes: ResolutionReasonCode[];
  resolvedStructure: ActivityPlanStructureV3;
  resolvedStructureHash: string;
  prescriptionEstimate: PrescriptionEstimate;
  fingerprint: string;
};
```

The fingerprint includes every input and policy version capable of changing the output. Hash algorithms and prefixes are canonical and identical in Core, API, database constraints, provider payload ownership, tests, and generated fixtures. The activity-plan semantic hash includes the canonical structure, every adaptation control and allowed state, training intent, and every other execution-affecting field.

### Initial deterministic resolution policy

The initial resolver intentionally uses observed and authored inputs rather than speculative future physiology:

1. Require exact activity category and compatible training intent.
2. Preserve an explicitly selected activity plan when compatible; otherwise select from the exact compatible catalog lane with stable ordering.
3. Resolve effective target duration from session demand, then plan-owned preferences and system defaults.
4. Use `targetCommonLoad` when available; it is an authoritative numerical objective rather than fingerprint-only metadata.
5. Treat `importance` as a versioned policy input controlling acceptable duration/load shortfall and deterministic tie-breaking, not as an unrestricted user-authored multiplier.
6. Select only curator-authorized adaptation values or allowed states.
7. Estimate each resolved structure with the one canonical estimator.
8. Minimize bounded duration and Common Load error subject to hard duration, structure, intent, and publication-validated adaptation constraints.
9. Break ties deterministically by lower safety risk, lower intensity, lower duration, canonical adaptation-value ordering, semantic hash, stable ID, and revision.
10. Return the complete frozen manifest or an explicit needs-input/unsupported result.

The resolver may lazily evaluate a bounded adaptation domain or consume a deterministic publication-derived index. It must not perform unbounded optimization, accept arbitrary formulas, or make results depend on database row order.

### Threshold calibration and projection boundary

Fresh observed category-relevant thresholds may calibrate supported relative targets and prescription estimates. For example, an authored `%FTP` target remains the same relative intensity while a fresh observed FTP determines its corresponding wattage or load estimate. The resolver must not both raise the observed threshold and independently raise relative intensity unless the curator explicitly exposed a valid intensity control; doing both would double-count progression.

Projected future fitness, fatigue, readiness, FTP, pace, and heart-rate thresholds do not alter initial prescriptions. Plan simulation may display a projected trajectory after deterministic prescriptions resolve, but that output is not fed back into the initial resolver. The architecture may later accept a separately approved projected-state input without changing the reproducibility contract.

## Fallback policy

The resolver follows this order.

### Level 1: evidence-informed

Use fresh, relevant observed athlete evidence to calibrate supported targets and choose bounded activity parameters. The manifest records the athlete-context revision and exact evidence facts that affected the result. Forecasted future physiology is not evidence in the initial policy.

### Level 2: preference-informed

When physiology is incomplete but plan preferences exist:

- Respect hard schedule and duration constraints.
- Apply conservative progression and recovery behavior.
- Prefer relative or RPE targets when absolute targets are unsupported.
- Do not infer thresholds.

### Level 3: experience hint

Experience may influence complexity, conservative volume, and explanatory copy only. It is a weak prior and does not generate thresholds or assert capability.

### Level 4: no context

Use the versioned system policy and validated activity-plan authored defaults:

- Conservative session frequency, duration, density, and progression.
- Relative or RPE-based prescriptions.
- No invented FTP, pace, heart-rate threshold, VO2max, or readiness.
- Explicit `system_default_no_context` fallback status.

### Level 5: unresolved

Return `needs_input` or `unsupported` when:

- No exact category and intent candidate exists.
- Required execution targets are unavailable and no approved relative alternative exists.
- Hard plan constraints cannot be satisfied.
- Activity-plan adaptation cannot preserve intent.

Do not silently substitute a different category, fabricate evidence, or fall back to generic maintenance.

## Canonical workflows

### Training-plan preview

1. Validate the canonical training-plan draft.
2. Load the published athlete-context revision once.
3. Load and pre-index the accessible activity-plan catalog once.
4. Resolve effective plan preferences against the system policy.
5. Resolve every session demand through the Core prescription resolver.
6. Estimate each resolved prescription using the same resolved structure.
7. Simulate the plan from the resulting sessions.
8. Return the ordered per-session results and resolved manifests, one aggregate fingerprint, explanations, unresolved inputs, and an explicit `applicable` boolean.

Preview performs no writes.

A preview is applicable only when every session resolves. The initial contract does not support partial application: any needs-input or unsupported session makes the complete preview non-applicable.

### Training-plan apply

1. Require training-plan revision, semantic hash, athlete-state revision when evidence affected resolution, and preview fingerprint.
2. Recompute the same ordered manifests under transaction-safe locked inputs and verify the aggregate and per-session fingerprints.
3. Reject stale inputs or any non-resolved session atomically with an explicit result.
4. Create or replay planned sessions using full semantic idempotency.
5. Return the applied session IDs and changed-fact receipt.
6. Enqueue provider work after commit through a durable owner.

Training-plan application creates planned sessions only. It does not create mirrored executable event rows.

### Direct activity scheduling

1. Accept planning date, activity-plan ID, optional session demand, and operation ID.
2. Run the same resolver used by training plans.
3. Create one immutable planned session.
4. Reject operation-ID reuse when any semantic input differs.

Direct scheduling does not create a generic planned event.

### Calendar read

The calendar read model combines:

- Planned sessions for executable workouts.
- Completed activities.
- Non-executable events such as races and reminders.

The read model may normalize presentation fields, but it must preserve each resource identity and authority. It does not require mirrored storage.

### Recording

Recording launches only from a planned-session prescription snapshot or an explicitly unscheduled ad-hoc recording configuration. It verifies the snapshot hash and never resolves a mutable activity plan at launch time.

### Provider delivery

Provider publication reads the planned-session snapshot. Provider resource links reference the planned session for executable workouts. Activity-plan edits after scheduling cannot alter queued or delivered prescriptions.

### Plan editing and replanning

- Editing a training plan creates a new training-plan revision.
- Preview may propose replacements for future planned sessions.
- Applying the revision explicitly supersedes or cancels affected future sessions.
- Past, started, and completed sessions never change.
- Athlete-context updates may produce recommendations but never silently rewrite scheduled sessions.
- Replanning recalculates only eligible future sessions and presents the proposed changes for explicit confirmation.
- Applying a replan supersedes prior future prescriptions rather than mutating their snapshots.

## Calendar and recurrence simplification

### Planned sessions render directly

Remove the event mirror for executable prescriptions. Planned sessions contain the planning date, lifecycle, optional route, group-event association, source, and exact prescription needed by Calendar and Plan.

### Events are non-executable

Events retain races, reminders, and custom calendar entries. Remove activity-plan, training-plan, and planned-session prescription ownership from generic events after consumers move to the unified calendar read model.

### Executable recurrence is unsupported

Recurring executable workouts are represented by multiple planned sessions generated from a training plan. Generic event recurrence remains available only for non-executable entries if product requirements still justify it.

## Estimation simplification

Maintain one estimator:

```text
resolved structure + supported athlete evidence -> prescription estimate
```

The estimate returns explicit availability per fact. Missing athlete thresholds do not become zero and do not produce fabricated personalized load.

Remove independent raw-plan, catalog, builder, event, and provider estimators once their callers consume the canonical resolved estimate. Catalog summaries may store context-free facts that are deterministic from the authored default structure, but they are not athlete prescriptions.

## Sharing simplification

Public or shared resources may include authored activity plans and training-plan definitions. They never include:

- Athlete context.
- Athlete-specific parameter values.
- Planned-session snapshots.
- Provider state.
- Private resolution manifests.

A recipient resolves a shared training plan independently under their own context and the current supported system policy.

## Concurrency, idempotency, and integrity

### Semantic revision

Activity-plan concurrency covers structure, adaptation, training intent, and all execution-affecting metadata. Use an expected revision for writes. The semantic hash includes every field that changes a prescription.

Training-plan concurrency covers goals, preferences, session demands, and explicit activity-plan references.

### Duplication

Duplicating an activity plan preserves structure, intent, adaptation, and execution metadata while assigning new identity, ownership, visibility, revision, and timestamps.

Duplicating a training plan preserves goals, preferences, and session demands but not athlete-specific resolutions or planned sessions.

### Idempotency

An idempotency replay matches the full normalized semantic request fingerprint. Reusing an operation ID with different dates, sources, activity plans, parameters, demands, or policy inputs returns a conflict.

### Snapshot integrity

Planned-session validation proves:

- Structure hash matches the frozen structure.
- Activity-plan intent is valid for the structure.
- Parameter values match the declared resolution.
- Source and policy revisions are present.
- Capture time is a server instant.
- Prescription size and numeric values are bounded.

## Target persistence model

Keep four primary aggregates:

1. `activity_plans`: authored executable definitions.
2. `training_plans`: goals, plan preferences, and session demands.
3. `planned_sessions`: frozen prescriptions and scheduling lifecycle.
4. `events`: non-executable calendar entries.

Avoid a separate resolution-manifest table initially. Store the per-session manifest and fingerprint with the planned session. Return aggregate preview/apply summaries without duplicating them unless a demonstrated audit or operational requirement later justifies a training-plan-application aggregate.

Provider resource links for workouts point to planned sessions. Completion links connect planned sessions to completed activities. Routes may attach directly to planned sessions or non-executable events according to resource kind.

### System-catalog consolidation

The hard cut consolidates the audited 140 Base/Build/Advanced/Race progression documents into 35 canonical adaptive activity plans plus one independently identified Norwegian Controlled Threshold 25-by-400-meter activity plan. The 58 currently standalone activity plans remain standalone until a separate semantic review proves a stronger grouping. The target initial catalog is therefore 94 activity plans.

The consolidation preserves stable canonical plan identities, assigns stable adaptation-control identities, and removes redundant dose-copy identities from the reseeded repository-managed database. System training-plan definitions reference activity-plan identities only. Historical or hosted data conversion is outside this pre-production reset; any later authorized hosted cutover requires an independently reviewed transactional mapping and immutable-prescription preservation proof.

## Target API surface

Prefer a compact command/read API.

### Activity plans

- `activityPlans.list`
- `activityPlans.get`
- `activityPlans.save`
- `activityPlans.duplicate`
- `activityPlans.delete`

### Training plans

- `trainingPlans.preview`
- `trainingPlans.save`
- `trainingPlans.apply`
- `trainingPlans.get`
- `trainingPlans.delete`

### Planned sessions

- `plannedSessions.schedule`
- `plannedSessions.move`
- `plannedSessions.cancel`
- `plannedSessions.complete`
- `plannedSessions.range`

### Calendar

- `calendar.range`

Internal calculations are not separate public endpoints unless a distinct product capability requires them.

## Package ownership

### `packages/core`

- Canonical schemas and result unions.
- System planning policy and defaults.
- Preference resolution.
- Activity-plan validation and semantic adaptation.
- Prescription resolver and fingerprinting.
- Canonical estimation and plan simulation.
- Pure deterministic tests and golden scenarios.

Core has no database, network, React, ambient clock, or mutable module-state dependency.

### `packages/api`

- Authorization.
- Loading athlete context and accessible catalog data.
- Preview and apply orchestration.
- Transactions, revisions, idempotency, and conflict mapping.
- Planned-session lifecycle commands.
- Durable provider follow-up ownership.
- Explicit transport DTOs.

Routers remain thin and do not duplicate resolver logic.

### `packages/db`

- Four-aggregate persistence model.
- Ownership, uniqueness, revision, lifecycle, and completion constraints.
- Provider resource identities and durable work.
- Fresh baseline and reset/reseed verification.

### `apps/web` and `apps/mobile`

- Collect canonical training-plan inputs.
- Display authoritative previews, explanations, and unresolved inputs.
- Submit commands with expected revisions and operation IDs.
- Render calendar read models and frozen prescriptions.
- Never independently select, resize, estimate, or validate prescriptions.

## Hard-cut removal inventory

Remove all production code, schemas, tests, exports, migrations, fixtures, and UI that support:

1. Every activity-plan variant schema, nested variant document, variant identity, variant selector, variant persistence field, and variant compatibility path.
2. Dose-only difficulty, progression, duration, distance, repetition, recovery, intensity, Base, Build, Advanced, or Race activity-plan copies represented as independent system plans.
3. Profile-level training preferences or `profileTrainingSettings` persistence.
4. Profile-settings training-preference routers, hooks, forms, onboarding writes, and provider reads.
5. `defaultAthletePreferenceProfile` as a persisted or athlete-owned concept.
6. `builder_planning_snapshot` once canonical training-plan fields replace it.
7. The replaced single-target adaptation contract, generic arbitrary-path adaptation, array-index targeting, and cross-parameter formula contracts.
8. Separately selectable activity intent validation policies.
9. Executable generic events and activity-plan-backed event creation.
10. Mirrored event rows for training-plan planned sessions.
11. Recurring executable activity events.
12. Provider publication from mutable activity plans.
13. Client-owned candidate selection or prescription estimation.
14. Parallel raw-plan, event, catalog, builder, and provider estimators.
15. Automatic silent replanning.
16. Legacy planning compatibility DTOs, adapters, aliases, and pre-cut planning contract epochs.

Legacy tests are deleted or rewritten against the new product contract; they are not retained as skipped compatibility coverage.

## Performance requirements

### Required bounds

- Reject an adaptation domain whose cardinality exceeds policy before allocating it.
- Traverse accepted adaptation domains lazily or consume an equivalent deterministic bounded index.
- Validate adaptation surfaces when activity plans are saved, not when each session is scheduled.
- Cap activity-plan payloads, structure expansion, training-plan sessions, catalog candidates, and preview horizon.
- Pre-index candidates by activity category and training intent.
- Load athlete context and candidate rows in bounded batches.
- Avoid one database query or insert per session when applying large plans; use bounded batch operations while preserving idempotency.
- Keep provider I/O outside planning transactions.
- Do not estimate an entire catalog synchronously on the mobile render path.

### Initial benchmark budgets

Benchmarks must use deterministic fixtures and report p50, p95, maximum memory, and output fingerprint stability.

| Operation | Fixture | Initial budget |
|---|---|---|
| Fixed activity-plan resolution | Maximum supported normal workout | p95 under 10 ms |
| Activity-plan publication validation | Largest accepted normal adaptation surface | p95 under 250 ms |
| Training-plan preview | 52 weeks, up to 366 sessions, 1,000 indexed candidates | p95 under 250 ms Core time |
| No-context resolution | Same training plan without athlete evidence | No slower than evidence-informed resolution |
| Calendar range read | 90 days of mixed planned/completed/custom entries | Fixed query budget with no per-item queries |
| Mobile picker update | Visible page only | No full-catalog synchronous recalculation |

Budgets may change only with representative evidence and a recorded rationale.

Database integration tests must count statements at the repository executor boundary. Initial budgets are:

- Training-plan preview: at most six statement groups, independent of session count.
- Training-plan apply: at most ten fixed statement groups plus one statement per configured write chunk, never one statement per session.
- Planned-session calendar range: at most four statement groups, independent of returned item count.
- Direct planned-session scheduling: at most six statement groups before durable provider follow-up.

The benchmark fixture owner is `packages/core/testing` for pure resolver fixtures and `packages/api` for statement-count integration fixtures. CI runs the normal-scale benchmark on every affected change and the maximum-scale benchmark on the scheduled or release gate. A budget failure blocks integration unless the budget change includes representative evidence and explicit review.

## Observability

Capture privacy-safe resolution telemetry:

- Resolver and system policy versions.
- Resolved, needs-input, and unsupported counts.
- Fallback-level counts.
- Candidate count and resolution duration.
- Adaptation-validation duration and cardinality.
- Adaptation control count, allowed-state count, and resolution fallback reason.
- Preview fingerprint mismatch and stale-write counts.
- Planned-session idempotency replays and conflicts.
- Provider delivery source revision and terminal status.

Do not log athlete measurements, raw structures, private goals, notes, or parameter values unless an explicit privacy review approves a narrowly scoped diagnostic.

## Implementation sequence

### Phase 0: restore a coherent build

1. Remove stale profile-level preference consumers and persistence references.
2. Remove corresponding onboarding, Wahoo, router, hook, form, and test paths.
3. Make Core, API, database constraints, providers, tests, and generated fixtures use one canonical semantic-hash algorithm and prefix.
4. Restore API, mobile, web, Core, and DB typechecks.
5. Preserve unrelated worktree changes.

**Exit criteria**

- No `profileSettings`, `profileTrainingSettings`, or profile preference production reference remains.
- Relevant package typechecks pass.
- The hard-cut inventory has no legacy identifier matches.

### Phase 1: land canonical contracts

1. Add canonical plan-owned preferences.
2. Add session demand and the single training-plan session shape.
3. Add the system planning policy and unified result vocabulary.
4. Hard-cut semantic activity adaptation to curator-defined multi-control, multi-target, unit-aware controls and optional coordinated allowed states.
5. Add resolution manifest and semantic fingerprint contracts.
6. Replace builder snapshots with canonical inputs.
7. Delete every activity-plan variant contract and represent materially different protocols as separate activity plans.

**Exit criteria**

- Every persisted training-plan field is an authoritative input.
- Every preference has an observable behavior test.
- Omitted and explicitly defaulted preferences produce identical fingerprints and outputs.
- Every activity category can adapt the time, distance, repetitions, recovery, and typed targets already represented by its structure.
- A curator can expose only an exact main interval or step while leaving warm-up and cooldown fixed.
- No adaptation version, compatibility reader, dual write, or legacy adaptation alias remains.

### Phase 2: implement the resolver

1. Build one pure Core prescription resolver.
2. Resolve explicit activity-plan references.
3. Resolve catalog-selected sessions.
4. Implement the fallback ladder.
5. Integrate the single estimator and plan simulation.
6. Add deterministic no-context, sparse-context, and rich-context golden scenarios.
7. Replace the current fresh-published-baseline prerequisite with the explicit `PlanningBaseline` union.
8. Make the training-plan activity-plan reference optional so catalog resolution is a real production path.
9. Use target duration and target Common Load to select the nearest safe allowed adaptation state.
10. Use session importance through explicit versioned policy behavior and tests.
11. Use fresh observed thresholds for supported calibration without projected-physiology feedback.

**Exit criteria**

- Identical normalized inputs produce identical manifests.
- Richer evidence changes only supported decisions.
- Missing evidence never becomes a fabricated value.
- Unsupported demands return explicit reasons.
- Preview and application succeed through the system fallback policy when the baseline status is `no_context`.
- `targetCommonLoad` and `importance` have observable deterministic effects whenever supplied.
- Plan simulation consumes resolved prescriptions but does not feed projected future physiology back into the initial resolver.

### Phase 3: converge preview and apply

1. Make API preview call the resolver.
2. Make apply verify the same fingerprint and create planned sessions.
3. Add full semantic revision and idempotency checks.
4. Preserve complete activity-plan semantics during duplication.
5. Add batch persistence for bounded plan application.
6. Add architecture checks that forbid preview, apply, direct scheduling, estimation, or provider adapters from bypassing the canonical resolver contract.
7. Return ordered per-session manifests from preview and verify those exact fingerprints during apply.

**Exit criteria**

- Preview and apply produce identical session manifests.
- Stale plan, activity-plan, athlete-state, or policy inputs fail explicitly.
- Reapplication is idempotent; changed semantics conflict or create a new revision.

### Phase 4: remove executable event duplication

1. Render planned sessions directly in calendar reads.
2. Move direct scheduling to planned-session commands.
3. Remove activity-plan-backed event creation and updates.
4. Remove training-plan event mirrors and linking constraints made unnecessary by the new model.
5. Keep events only for non-executable entries.
6. Remove executable recurrence.

**Exit criteria**

- Every executable calendar item has exactly one planned-session identity.
- Calendar, Plan, and recording agree on date, lifecycle, structure hash, and estimate.
- No mutation must synchronize an event and planned session representing the same workout.

### Phase 5: converge recording and providers

1. Launch recording from planned-session snapshots.
2. Validate completion against the frozen prescription.
3. Publish providers from the same snapshot.
4. Move provider resource links to planned-session identity.
5. Add durable post-commit provider work and reconciliation.

**Exit criteria**

- Editing an activity plan after scheduling cannot change recording or provider output.
- Provider retries remain bound to the original planned-session prescription.
- Provider failures do not roll back accepted planning state and have a durable recovery owner.

### Phase 6: delete transitional code and reset

1. Delete replaced schemas, adapters, routes, hooks, repositories, tests, and exports.
2. Consolidate the audited 140 dose-copy system documents into 35 canonical adaptive plans plus one independent 25-by-400-meter protocol, and retain the 58 standalone plans.
3. Remove temporary dual reads and dual writes.
4. Regenerate the fresh database baseline or approved forward artifacts according to the DB package workflow.
5. Reset and reseed the repository-managed local database with the 94-plan target catalog.
6. Regenerate fingerprints and generated types.
7. Run the full quality and database gates.

**Exit criteria**

- No compatibility path remains.
- Fresh reset and seed produce only the target model.
- Architecture checks prevent reintroducing profile preferences, executable event prescriptions, or client-side planning authorities.
- The system catalog contains no variant contract or dose-only progression copies; materially different protocols have independent activity-plan identities.

## Acceptance scenarios

The implementation is incomplete until all scenarios pass through real public boundaries.

### No athlete context

- A training plan previews and applies using the versioned conservative policy.
- Relative/RPE prescriptions remain executable.
- Unsupported absolute targets produce needs-input or approved alternatives.
- The manifest reports `system_default_no_context`.

### Sparse athlete context

- Available evidence influences only related targets.
- Missing thresholds remain unavailable.
- Plan preferences still affect schedule, duration, progression, and recovery.

### Rich athlete context

- Supported targets and bounded activity parameters respond deterministically.
- The manifest records the exact athlete-context revision.
- The manifest identifies each observed threshold fact that affected calibration or estimation.
- Relative intensity is not raised merely because its observed threshold increased.
- Repeating against the same revision produces the same fingerprint.

### Category-neutral adaptation

- Bike, run, swim, strength, and other activity plans adapt only quantities and targets already represented by their structures.
- Time, distance, and repetition quantities remain distinct and unit-correct.
- A three-interval activity can expose only its main-set interval and steps while leaving warm-up and cooldown unchanged.
- One control may coordinate multiple compatible targets, and multiple controls of the same kind may coexist.
- Invalid target IDs, target types, semantic roles, conflicting writes, and disallowed tuples fail before publication or seeding.

### Structurally distinct activity boundary

- Dose, difficulty, progression, and taper changes resolve as adaptations within one activity plan.
- A materially different protocol or topology is a separate independently valid activity plan with its own adaptation contract.
- No activity-plan variant identity appears in authored definitions, training-plan sessions, resolver inputs, resolution manifests, planned sessions, persistence, or client DTOs.

### Manual activity selection

- The selected activity plan remains selected when compatible.
- Incompatible demand, intent, or hard constraints return an explicit failure.
- Adaptation cannot leave the activity plan's intent.

### Automatic activity selection

- Selection uses exact category and compatible intent.
- Ranking is stable regardless of database row order.
- Missing catalog coverage is explicit.

### Plan revision

- Editing preferences or session demand changes the plan semantic hash.
- Applying a new revision explicitly replaces only eligible future sessions.
- Past, started, and completed sessions remain unchanged.
- New athlete evidence may produce a future-session replan proposal, but no scheduled prescription changes without explicit application.

### Projected physiology boundary

- Plan simulation may display projected fitness, fatigue, form, or threshold trajectories after prescriptions resolve.
- Projected future physiology does not change initial activity selection or adaptation values.
- Adding projected-state optimization later requires a separately approved policy, uncertainty contract, provenance contract, and acceptance suite.

### Activity-plan revision

- Existing planned sessions retain their prior structure and provider payload.
- New sessions use the new activity-plan revision.
- Concurrent stale edits are rejected.

### Idempotency

- Exact replay returns the original result.
- Reusing an operation ID with different semantic input returns conflict.

### Calendar

- Planned sessions appear without event mirrors.
- Completed activities and non-executable events compose into the same range read.
- Movement and cancellation update one lifecycle authority.

### Sharing

- Shared definitions contain no athlete evidence or resolved prescriptions.
- A recipient resolves the plan independently.

### Provider delivery

- Provider output matches the planned-session snapshot.
- Activity-plan edits cannot change queued delivery.
- Retry and reconciliation preserve the same prescription identity.

## Verification requirements

### Core

- Schema and invalid-state tests.
- Deterministic fingerprint goldens.
- Preference effect tests.
- No-context, sparse-context, and rich-context scenario tests.
- Property tests for bounds, monotonicity, and stable ordering.
- Adaptation cardinality and maximum-work tests.
- Per-category time, distance, repetition, recovery, and target-unit adaptation tests.
- Multi-interval targeting tests proving exact main-set customization and fixed untargeted warm-up/cooldown behavior.
- Coordinated allowed-state, conflicting-target, default-reproduction, and structurally distinct activity-boundary tests.
- Current-threshold calibration tests that prevent double-counting intensity progression.
- Resolver and simulation benchmarks.

### API

- Authorization and ownership tests.
- Preview/apply parity tests.
- Expected-revision and stale-input tests.
- Full semantic idempotency tests.
- Batch query/write budget tests.
- Real database application, replacement, cancellation, and completion tests.

### Database

- Fresh reset and seed verification.
- Hard-cut proof that no adaptation-version column, legacy adaptation reader, or dose-copy system row remains.
- Seed parity for the 94-plan target catalog with no variant persistence or identifiers.
- Planned-session ownership, uniqueness, lifecycle, and completion constraints.
- No executable prescription columns or foreign keys remain on generic events.
- Provider resource links enforce the correct resource kind.
- Security and performance advisors reviewed after DDL changes.

### Web and mobile

- Equivalent plan preference and preview behavior.
- Direct scheduling creates planned sessions.
- Calendar renders planned sessions without event mirrors.
- Recording launches the frozen prescription.
- Unsupported and needs-input states are accessible and actionable.
- No client-side resolver or estimator remains.

### Repository-wide

- Package typechecks.
- Relevant unit and integration tests.
- Architecture and dependency checks.
- Legacy identifier searches.
- `git diff --check`.
- `pnpm quality:agent` when the full integration is ready.

## Completion definition

The integration is complete when:

1. Training plans own all planning preferences and session demands.
2. Each activity plan owns exactly one executable structure and bounded curator-defined semantic adaptations.
3. One deterministic resolver connects training plans, observed athlete evidence, and activity plans using target duration and Common Load without depending on projected future physiology.
4. Preview, apply, direct scheduling, estimation, recording, and providers consume the same resolution contract.
5. Planned sessions are the only stored executable prescription.
6. Generic events contain no executable activity or training-plan prescription.
7. No-context behavior is conservative, useful, versioned, and explicit.
8. Rich context improves supported decisions without destabilizing scheduled work.
9. Activity-plan variants, legacy profile preferences, dose-only plan copies, executable event scheduling, and duplicate estimators are absent.
10. The hard-cut adaptation contract works across every activity category and no adaptation compatibility version remains.
11. Fresh database reset, the 94-plan system catalog, full verification, and architecture enforcement pass.

## Guiding rule

Every new planning feature must answer one question:

> Is this training-plan intent, activity-plan execution, athlete evidence, system resolution policy, or an immutable planned-session result?

If it does not fit one of those authorities, it is likely duplicate state, presentation detail, or misplaced logic and should not become a new domain model.
