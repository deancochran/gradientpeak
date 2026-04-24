# Activity Plan Route Coverage Implementation Task

## Objective

Implement the smaller MVP described in `activity-plan-route-coverage-spec.md` so saved activity plans require a real saved effort model, derived metrics come from structure, and route attachments remain non-authoritative unless they are converted into the saved effort model before save.

All work for this task should be performed in the `dev` worktree and land on development flow from there.

## Immediate Constraint Update

This task starts with one enforced product rule:

- every saved activity plan must include `structure`
- every structure must contain at least one interval
- every interval must contain at least one step
- every saved activity plan must be able to produce trustworthy IF and TSS

This removes plans that rely only on a route attachment from the validation model.

## Why This Task Exists

The current system still mixes:

- structure-derived load estimates
- route-derived fallback estimates
- UI that presents both as one coherent plan

This task closes that gap by making the saved activity plan structurally complete and by treating route attachments as non-authoritative in MVP.

Additional product rule:

- if a route-driven or partial-route authoring case cannot be expressed as trustworthy saved structure, it must not be allowed to save as an `activity_plan`

## Scope

### In scope

- tighten validation schemas so all saved activity plans require non-empty structure
- make all persisted plan metrics derive from structure
- update tRPC activity-plan and event validation flows to use structure-first estimation
- clean up mobile and API behavior so route attachments stay non-authoritative unless converted into the saved effort model before save
- prevent misleading route-derived summaries when structure is short or incomplete
- block ambiguous route-driven save cases that would make IF/TSS untrustworthy

### Out of scope for the first pass

- large database redesign beyond what is required for validation or cached derived outputs
- persistence of normalized structure if recomputation on read/write is sufficient
- route-to-structure generation
- route-fit warnings or coverage summaries
- route remainder semantics for `untilFinished`
- advanced route-aware authoring or validation UX

## Workstreams

## 1. Core Schema And Modeling

### Goal

Make the shared `@repo/core` activity-plan schemas represent the real product contract.

### Tasks

1. Replace permissive `activityPlanCreateSchema.structure` typing with `activityPlanStructureSchemaV2`.
2. Require non-empty structure in saveable form schemas.
3. Remove route-attachment-only save assumptions from shared schema contracts.
4. Keep normalization helpers structure-first for estimation.
5. Add save-time refinement for trustworthy IF/TSS derivability.

### Candidate files

- `packages/core/schemas/index.ts`
- `packages/core/schemas/form-schemas.ts`
- `packages/core/schemas/activity_plan_v2.ts`
- `packages/core/estimation/types.ts`
- `packages/core/estimation/strategies.ts`

### Acceptance criteria

- route-attachment-only save payloads fail validation
- empty `intervals` fail validation
- intervals with empty `steps` fail validation
- shared contracts no longer imply that an attached route can substitute for missing structure
- saveable contracts reject plans whose saved effort model is too incomplete or ambiguous to support trustworthy IF/TSS

## 2. Derived Metrics And Normalization

### Goal

Ensure derived metrics come from normalized effective structure, not route-derived heuristics for persisted plans.

### Tasks

1. Add `normalizeActivityPlanForEstimation()`.
2. Update estimation helpers to normalize before computing derived metrics.
4. Stop using route-derived fallback estimation for persisted plans with route attachments once normalization is available.
5. Make metrics and summaries avoid falsely claiming that an attached route defines the saved plan.
6. Distinguish planned metrics from attached route facts where needed so route distance does not masquerade as planned effort.

### Candidate files

- `packages/api/src/utils/estimation-helpers.ts`
- `packages/api/src/utils/activity-plan-derived-metrics.ts`
- `packages/core/estimation/index.ts`
- `packages/core/estimation/metrics.ts`

### Acceptance criteria

- a saved plan with valid structure produces coherent duration, IF, TSS, and distance
- a short structure attached to a long route no longer silently reports contradictory metrics
- derived metrics no longer imply route completion or route-defined load
- authoritative IF and TSS are never produced from route-derived heuristics for saved plans
- route facts shown in summaries are clearly non-authoritative and never substituted for saved-effort-derived metrics
- saved-plan responses expose authoritative metrics under `activity_plan.authoritative_metrics`
- attached route facts are exposed under `activity_plan.route`
- old duplicate top-level plan metric fields such as `activity_plan.estimated_tss` are removed from activity-plan responses

## 3. tRPC Validation And Mutation Flow

### Goal

Move plan validation from shape-only checks to structure-first validation without over-constraining route attachment.

### Tasks

1. Validate activity-plan inputs with structure-first save rules.
2. Remove route-derived estimation as a persisted-plan mutation path.
3. Fix event scheduling validation to use the same structure-first estimation context.
4. Consider output validators for normalized plan summaries returned to the client.
5. Reject route-driven save paths that would require authoritative IF/TSS to come from loose heuristics.

### Candidate files

- `packages/api/src/routers/activity-plans.ts`
- `packages/api/src/routers/events.ts`

### Acceptance criteria

- `activityPlans.create` rejects route-attachment-only persistence
- create/update runs structure-first normalization before estimation
- scheduling validation uses the same structure-first estimation path as plan detail
- create/update rejects route-attached payloads that still leave the saved effort model ambiguous

## 4. Mobile Composer UX

### Goal

Keep the existing composer structure-first while making route attachment clearly non-authoritative unless converted into the saved effort model before save.

### UX contract for this implementation

Add:

1. save-state gating when the plan cannot produce trustworthy IF/TSS
2. inline route copy explaining that route attachment does not replace required structure
3. form-level validation messaging for route-driven cases that are recognized but not yet saveable
4. summary presentation that separates saved-effort-derived metrics from attached route facts
5. clearer empty-state guidance when a route is attached without saveable structure

Remove:

1. any implied route-only authority in save flows
2. any metric presentation that makes route-derived estimates look like authoritative saved IF/TSS
3. any ambiguous copy that suggests the route defines the saved plan load by default
4. any save path that allows route-driven ambiguity to pass without explicit explanation

### Tasks

1. Keep the existing structure builder as the primary authoring surface.
2. Allow route attachment without changing authored structure.
3. Make route copy and summaries clearly non-authoritative unless route-derived intent has been converted into the saved effort model before save.
4. Preserve authored structure when routes are attached or removed.
5. Show route input only where useful and already supported.
6. When the user appears to be trying to create a route-goal or partial-route plan that cannot yet be represented as trustworthy structure, block save with explicit guidance instead of silently estimating.
7. Distinguish authoritative plan metrics from route facts in the composer summary UI.
8. Ensure route-attached empty or invalid structure states steer the user toward adding structure instead of implying the route is enough.

### Candidate files

- `apps/mobile/components/activity-plan/ActivityPlanComposerScreen.tsx`
- `apps/mobile/components/activity-plan/structure/StructureBuilderCard.tsx`
- `apps/mobile/components/Routes/RouteSelector.tsx`
- `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts`
- `apps/mobile/lib/stores/activityPlanCreation.ts`

### Acceptance criteria

- attaching a route does not change structure validity rules
- route UI no longer implies that the route defines the plan or its load
- saveable plans always have at least one interval and one step
- save is blocked when the entered data would make IF/TSS untrustworthy
- users can still edit drafts freely when save is blocked, but the blocked reason is visible in the composer
- route facts remain visible where useful, but are not presented as authoritative saved metrics
- the composer clearly distinguishes supported structure-plus-route flows from unsupported route-driven save attempts

## 5. Validation And Error Presentation

### Goal

Make validation helpful at the draft stage while keeping shape/type validation strict and route messaging truthful.

### Tasks

1. Keep draft editing permissive where needed.
2. Use save validation to enforce complete non-empty structure and type-safe payloads.
3. Map nested Zod issues into interval/step UI errors.
4. Use route-specific copy only to clarify that route attachment does not replace required structure.
5. Preserve the distinction between attached route context and canonical structure in error and warning copy.
6. Explain clearly when a route-driven scenario is not saveable because the app cannot yet produce trustworthy IF/TSS for it.

### Acceptance criteria

- users see interval/step-local errors clearly
- errors explain that attached routes do not replace required structure
- route-attached plans no longer show misleading completion or route-defined load summaries
- errors explain when route-driven intent cannot be saved yet because canonical load would be ambiguous
- route-attached empty states and blocked-save states use explicit guidance rather than silent failure or misleading metrics

## Suggested Order

1. enforce non-empty structure in shared schemas
2. update tests for new schema requirements
3. remove route-derived estimation and route-substitutes-structure assumptions in core/api
4. route activity-plan create/update through structure-first normalization before estimation
5. fix scheduling validation path
6. update mobile composer UI and form-state handling
7. add focused tests for structure-first estimation and required structure validation

## Verification

Minimum verification for this task:

- `packages/core` schema tests covering required structure
- `packages/api` router tests for create/update validation
- targeted mobile tests for route attachment behavior where practical

Shared merge gate expectation after broader implementation:

- `pnpm check-types`
- `pnpm lint`
- `pnpm test`

## Done Definition

This task is done when:

- all saveable activity plans require non-empty structure
- route attachments remain optional non-authoritative data and do not substitute for structure
- derived metrics are computed from normalized plan structure
- derived IF and TSS for saved plans come from structure, not route-derived fallback
- event scheduling uses the same structure-first validation model
- the mobile composer keeps structure primary and routes non-authoritative by default
- route-driven or partial-route cases that cannot produce trustworthy IF/TSS are blocked from saved-plan creation
- all resulting work exists in the `dev` worktree and is ready for continued development there
