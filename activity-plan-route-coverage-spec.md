# Activity Plan Route Coverage Specification

## Goal

Redefine `activity_plan` so derived metrics come from a saved effort model instead of from a loose mix of `structure` heuristics and attached route heuristics.

The target model is:

- `activity_plan` is the canonical training definition.
- `route` may be optional geographic context or a route-scoped planning input.
- every saved `activity_plan` must still resolve to a saved effort model that is sufficient to produce trustworthy IF and TSS.
- attached routes do not define authoritative training load by themselves.
- derived values such as duration, TSS, IF, calories, and distance projections must be computed from the saved effort model, not from route presence alone.

## Terms

- `saved effort model`
  - the data the system trusts to compute authoritative plan load
  - in v1, this is a valid non-empty `structure`
- `route attachment`
  - a route linked to the plan without load authority by default
  - it can inform planning and display, but it does not define authoritative IF/TSS unless first converted into the saved effort model before save
- `trustworthy IF/TSS`
  - IF and TSS computed from explicit saved effort data, not from loose route-only heuristics
- `saveable activity_plan`
  - an activity plan whose saved inputs are sufficient to produce trustworthy IF/TSS

## Problem Statement

Today the codebase allows:

- structure-only plans
- plans with only a route attachment
- structure-plus-route plans

But the system does not model what it means for a structure to cover a route.

That creates contradictory outputs such as:

- a one-hour structured bike workout attached to a 100 mile route
- a plan with a route attachment but no explicit intensity assignment for most of the route
- a route-follow structure with `untilFinished` estimating to roughly five minutes instead of the full route

This is not primarily a route-vs-structure precedence problem. It is a plan-completeness and modeling problem, but the product should solve it with the smallest useful amount of validation and UI complexity.

## V1 Scope

This specification is intentionally trimmed to a simpler v1.

Keep in v1:

- all saved activity plans require a saved effort model sufficient for trustworthy IF/TSS
- route upload onto a plan is allowed as an optional attachment
- route attachments are non-authoritative in MVP unless first converted into the saved effort model before save
- the app must not imply that attaching a route makes a plan complete

Leave out of v1:

- route-to-structure generation
- route-fit warnings and coverage summaries
- route-aware normalization before estimation
- route remainder semantics for `untilFinished`
- advanced route-aware validation or authoring UX

## Save-Time Invariant

Every saved activity plan must persist a valid saved effort model that can produce trustworthy IF and TSS.

In v1, that saved effort model is a valid non-empty `structure`.

- include at least one interval and one step
- include a valid intensity target on every saved step
- be sufficient to compute duration, IF, and TSS without route-derived fallback
- reject any save path where the route role or authored data makes IF/TSS materially ambiguous or untrustworthy

The route is a route attachment in v1.

The structure remains the saved effort model.

The route does not define the activity-plan structure by itself.

Non-negotiable product rule:

- if the system cannot produce trustworthy IF and TSS for the saved plan, it must not allow the plan to be saved as an `activity_plan`

## Current Repo State

### Database and input contract

- `activity_plans` only requires that at least one of `structure` or `route_id` exists.
- It does not require route coverage, route-aware structure, or consistency between structure duration and route distance.
- References:
  - `packages/db/src/schema/tables.ts:192-195`
  - `packages/core/schemas/form-schemas.ts:735-745`

### Estimation contract

- estimator priority is currently:
  - structure first
  - route second
  - template fallback third
- References:
  - `packages/core/estimation/index.ts:48-81`

### Structure estimation today

- `estimateFromStructure()` computes duration, IF, and TSS from explicit step durations and targets.
- This is the most correct current path for training load because effort is explicitly modeled.
- References:
  - `packages/core/estimation/strategies.ts:66-148`

### Route estimation today

- `estimateFromRoute()` infers duration and load heuristically from route distance, ascent, and user anchors.
- This is useful as a temporary projection aid but is not sufficient as a canonical activity-plan model because a route alone does not tell the system how hard the athlete will ride or run.
- References:
  - `packages/core/estimation/strategies.ts:219-294`

### Metrics leakage today

- `estimateMetrics()` always returns route distance when a route is present, even when duration, IF, and TSS were derived from a short structure.
- This is the main source of contradictory detail output.
- References:
  - `packages/core/estimation/metrics.ts:31-32`
  - `packages/core/estimation/metrics.ts:166-176`

### `untilFinished` fallback problem

- `untilFinished` resolves to a fixed sport heuristic of 300 seconds.
- A route-follow structure therefore does not actually cover the route in the estimation system.
- References:
  - `packages/core/duration/seconds.ts:16-37`
  - `packages/core/sports/run.ts:18-35`
  - `packages/core/sports/bike.ts:18-35`
  - `packages/core/schemas/activity_plan_v2.ts:160-182`

### Scheduling validation gap

- one scheduling validation path estimates load from `activity_plan` input but does not hydrate route data into the estimation context.
- this means route-attachment-driven validations can diverge from the main derived-metrics path.
- Reference:
  - `packages/api/src/routers/events.ts:1896-1919`

### Composer and form gaps

- the composer supports independent structure editing and route attachment, but not route coverage modeling.
- validation focuses on step validity, not route completeness.
- the current strict validation requires every step to have a positive duration and a target, which is useful for step quality but does not answer whether the full route has been assigned effort.
- References:
  - `apps/mobile/components/activity-plan/ActivityPlanComposerScreen.tsx:103-113`
  - `apps/mobile/components/activity-plan/ActivityPlanComposerScreen.tsx:198-229`
  - `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts:165-227`
  - `apps/mobile/components/Routes/RouteSelector.tsx:26-177`

## Core Design Recommendation

In MVP, model planning around explicit structure and treat routes as optional route attachments.

Longer term, the product may distinguish multiple user intents for a route, but they all share one gate for saved activity plans:

- the saved plan must resolve to a trustworthy saved effort model
- route intent alone is not enough unless the system can convert it into the saved effort model before save

### Canonical concepts

The system should treat these as separate concepts:

- `route`
  - geographic course
  - distance
  - elevation
  - terrain context
  - preview geometry
- `structure`
  - effort assignments over time or distance
  - duration model
  - target intensity model
  - repeat structure

### Canonical truth

- route distance and terrain remain canonical route facts for route display
- effort assignment remains canonical structure truth
- derived metrics are computed from saved structure

This means a route alone should not directly define authoritative duration, TSS, or IF for a saved activity plan.

This also means that different route intents must not collapse into one ambiguous `route_id` interpretation.

Examples of distinct user intents that the product should model explicitly over time:

- route as non-authoritative attachment
- route as the course for only part of the workout
- route as the completion goal

But in v1, if the system cannot map one of those intents into the saved effort model before save, that case is out of scope for saved activity plans.

## Proposed Plan Model

### Plan modes

The product should support these MVP user cases:

1. structure-only plan
2. plan with explicit structure and an optional route attachment

The product should not support these as saved `activity_plan` modes in v1 unless they are converted into the saved effort model before save:

1. route completion goal with no trustworthy effort model
2. route attached only to imply partial-route coverage with no explicit segment or effort definition
3. route-as-structure interpretation where the route alone would be used to infer authoritative IF/TSS

### One authoring method

The product should keep one activity-plan structure authoring method.

Do not introduce multiple composer modes or parallel creation experiences.

Recommended rule:

- every saved plan uses the same structure model
- every plan with a route attachment uses the same structure builder already present in the app
- attaching a route does not auto-populate or repair the structure in MVP
- the UI stays fundamentally the same, with route shown as a route attachment and supporting input

Important product rule:

- structure remains visible
- the chart remains visible
- the editing surface stays the existing structure-builder flow
- the system becomes smarter behind the scenes, not heavier in the UI

### Normalized invariant

For estimation, every saved plan should be normalized to an effective structure model.

- no route:
  - estimate from explicit structure
- route + explicit structure:
  - estimate from explicit structure

Authoritative saved-plan metrics must come from structure, not from route-derived estimation.

## Route Attachment Model

### Attachment requirement

If `route_id` is present, the route is a route attachment in v1.

It may be shown in the UI as a supporting input, but it does not change the save contract or the authoritative derived metrics contract in MVP unless it has first been converted into the saved effort model before save.

### Attachment semantics

In MVP:

- a route can be attached to a structured plan
- a route does not imply route completion
- a route does not generate authoritative duration, IF, or TSS
- a route does not repair missing structure

If a future route-driven authoring flow is added, it must still end in a saved structure that preserves trustworthy IF/TSS.

Until then, route-driven cases that cannot be expressed as trustworthy structure should be blocked from saved-plan creation rather than estimated loosely.

### Route intent and edge cases

The product needs to acknowledge that an attached route can mean different things in real use:

- the workout happens somewhere along a route but not necessarily for the full route
- the route is unrelated to the effort structure and is just attached for reference
- the route itself is the user's completion goal

Those are real edge cases, but they do not all have the same save semantics.

The v1 rule is:

- if the user intent can be represented as a trustworthy explicit structure, it can be saved as an `activity_plan`
- if the user intent cannot be represented as a trustworthy explicit structure yet, the app must not save it as an `activity_plan`

That is preferable to allowing loosely inferred saved plans whose IF and TSS would not be trustworthy.

### Applying a route to an existing activity plan

When a user uploads or attaches a route to an activity plan that already has structure, the system should not silently assume compatibility.

Recommended flow:

1. keep the existing structure draft intact
2. keep route display and stats available as route attachment detail
3. do not change structure automatically

The system should not silently mutate a carefully authored structure.

Important save/edit rule:

- users should be allowed to upload or attach a route to a draft that already has structure without interruption
- attaching the route should never destroy the existing structure draft automatically
- editing continues through the existing structure flow

This means:

- draft editing is permissive
- save can remain flexible, with warnings used where the plan is still saveable

### Adjusting structure after route attachment

If a user uploads a route first and then changes targets, duration blocks, or interval structure, the app should:

- keep the attached route visible as an attachment
- recompute derived metrics from structure only

This should behave like the current structure editor with an optional route attachment, not a route-aware constraint system.

## Derived Metrics Contract

### New rule

Derived metrics should be produced from the normalized effective structure.

They should not be produced from a route-derived heuristic once the plan has been normalized.

### Resulting metric behavior

- duration comes from structure durations and normal structure estimation rules
- TSS comes from normalized step targets and duration
- IF comes from normalized step targets and weighted duration
- planned distance comes from structure-derived estimation, not from attached route alone
- attached route distance remains a route fact, not a substitute for planned effort
- elevation comes from the route when attached

### Response contract

For saved activity-plan responses in MVP:

- authoritative saved-plan metrics should be returned under `activity_plan.authoritative_metrics`
- attached route facts should be returned under `activity_plan.route`
- do not return duplicate top-level saved-plan metric fields like `activity_plan.estimated_tss` or `activity_plan.intensity_factor`

Preferred response paths:

- `activity_plan.authoritative_metrics.estimated_duration`
- `activity_plan.authoritative_metrics.estimated_tss`
- `activity_plan.authoritative_metrics.intensity_factor`
- `activity_plan.route.distance`
- `activity_plan.route.ascent`
- `activity_plan.route.descent`

Attached route facts remain non-authoritative for IF and TSS.

### Important distinction

Route facts are still inputs to estimation.

They affect:

- total distance
- terrain cost
- pace assumptions
- climbing penalty

But they should influence structure-derived estimation, not replace the structure model.

Trust rule:

- if route context would require the system to guess too much about the intended effort model, the plan must not be saved as an `activity_plan`

## Validation Model

### Validation goals

Validation should move from step-local correctness only to plan-level completeness.

The system should validate:

1. shape validity
2. step validity
3. estimation resolvability
4. trustworthy IF/TSS derivability

### Shape validity

- valid activity category
- valid route reference when present
- valid intervals and steps
- valid target types for sport

### Step validity

- no empty step names
- positive duration unless using an allowed route-remainder duration type
- valid target intensity bounds
- sport-specific target compatibility

### Route compatibility

- route attachment validity can remain lightweight in MVP
- but route usage must never create a save path that bypasses trustworthy IF/TSS derivation

### Validation stance

Recommended v1 stance:

- use hard validation for structure shape and type safety
- keep route attachment out of authoritative save validation in MVP

Recommended save gate:

- reject any plan whose saved inputs are not sufficient to produce trustworthy IF and TSS
- reject any route-driven or partial-route interpretation that would require authoritative load to come from loose heuristics alone

That means the app should avoid implying route completion, but save validity is still driven by structure.

### Error wording

Errors should be user-explanatory, for example:

- `Add at least one interval and one step before saving this activity plan.`
- `Each saved step needs a valid duration and target.`
- `This route is attached to the plan, but it does not make the plan complete by itself.`

## Zod Schema Recommendations

## Research notes

The official Zod docs support the exact patterns needed here:

- `z.discriminatedUnion()` for structured duration and step modes
- `.superRefine()` for multi-issue plan completeness checks
- `.safeExtend()` for extending schemas that already contain refinements
- `z.treeifyError()` or `z.flattenError()` for mapping nested coverage issues into UI-friendly output
- Sources:
  - `https://zod.dev/?id=discriminated-unions`
  - `https://zod.dev/?id=error-formatting`

### Recommended schema restructuring

Keep one canonical activity-plan input schema, but separate three layers:

1. raw editor draft schema
2. saveable plan schema
3. normalized estimation input schema

### 1. Raw editor draft schema

Purpose:

- allow in-progress incomplete form state
- support partial route matching workflows
- avoid overusing ad hoc local validation objects

Suggested shape:

- allow partial steps while editing
- include optional route attachment metadata

### 2. Saveable plan schema

Purpose:

- validate that the plan can actually be persisted
- guarantee that every saved plan has a canonical structure suitable for derived metrics

Implementation guidance:

- use `z.strictObject()` for save payloads so unknown keys fail loudly
- use discriminated unions for duration variants instead of broad `z.any()`
- add `.superRefine()` at the plan level only for structure completeness and estimation resolvability

Current gap to remove:

- `activityPlanCreateSchema` still uses `structure: z.any()` in the shared API input contract
- Reference:
  - `packages/core/schemas/index.ts:110-120`

This should be replaced by an explicit structure schema plus structure-completeness refinement.

### 3. Normalized estimation schema

Purpose:

- convert saveable plans into a predictable estimation input
- remove route-derived ambiguity before estimation logic runs

Suggested additions:

- `normalized_structure`
- `estimation_strategy: "structure-normalized"`

Add a normalization result schema:

```ts
const normalizedActivityPlanSchema = z.strictObject({
  activity_category: z.enum(["run", "bike", "swim", "strength", "other"]),
  route_id: z.string().uuid().nullable().optional(),
  structure: activityPlanStructureSchemaV2,
});
```

### Recommended Zod usage changes in this repo

- replace `z.any()` plan structure inputs with explicit schema references
- use `.superRefine()` in save schemas for structure completeness and trustworthy IF/TSS derivability
- use `.safeExtend()` when layering tRPC input schemas on top of refined base schemas
- use `z.flattenError()` or `z.treeifyError()` to produce interval and step issue maps for the mobile composer

## Form Validation Recommendations

## Research notes

React Hook Form guidance supports the patterns needed here:

- `useFieldArray()` for interval and step collections
- use `field.id` as keys, not indices
- avoid stacking field-array mutations in a single event
- use `useWatch()` for computed summaries and route coverage previews without rerendering the whole form
- use `trigger()` for dependent validation when route coverage changes after editing a step or attaching a route
- Sources:
  - `https://react-hook-form.com/docs/usefieldarray`
  - `https://react-hook-form.com/docs/usewatch`
  - `https://react-hook-form.com/docs/useform/trigger`

### Current repo issues

- the composer stores plan state in Zustand and only partially uses React Hook Form at the step-dialog level
- route attachment is not clearly modeled as non-authoritative state
- validation is split between local imperative checks and schema parse on submit
- References:
  - `apps/mobile/lib/hooks/forms/useActivityPlanForm.ts:130-271`
  - `apps/mobile/components/ActivityPlan/StepEditorDialog.tsx:31-59`

### Recommended direction

Model the composer as one route-aware draft instead of independent route and structure editors.
Model the composer as one structure editor with optional route attachment context.

### Form behaviors to add

1. route attachment should never satisfy missing structure requirements by itself
2. submit should remain driven by structure validity, not route presence
3. if the user's apparent route intent cannot be represented as a trustworthy structure, save should be blocked with clear explanation

### Suggested UX-safe validation tiers

- draft validation:
  - tolerant
  - helps while editing
  - warnings allowed
- save validation:
  - strict
  - strict for shape, type safety, and trustworthy IF/TSS derivability
  - block ambiguous route-driven save paths rather than allowing untrustworthy load estimates
- estimation validation:
  - strict plus normalization required

### Useful RHF changes if the composer is migrated or incrementally wrapped

- use `useFieldArray()` for intervals and steps instead of hand-rolled array mutation orchestration
- use `useWatch({ compute })` for structure summaries and quick stat badges
- use `trigger([fieldNames])` when route attachment changes any dependent UI copy or save gating
- keep default values complete when appending intervals and steps, matching RHF guidance

## tRPC And Server Logic Recommendations

## Research notes

The tRPC validator guidance reinforces using shared object validators at input and output boundaries and using output validators when the server is shaping trusted contracts for the client.

- Source:
  - `https://trpc.io/docs/server/validators`

### Current repo issues

- `activityPlans.create` and `activityPlans.update` validate structure shape but still allow route-driven ambiguity in derived metrics
- `computePlanMetrics()` still allows route-derived estimation fallback
- event scheduling validation uses a route-blind estimation path in at least one section
- References:
  - `packages/api/src/routers/activity-plans.ts:497-540`
  - `packages/api/src/routers/activity-plans.ts:543-628`
  - `packages/api/src/utils/estimation-helpers.ts:362-421`
  - `packages/api/src/routers/events.ts:1896-1919`

### Recommended server pipeline

Add an explicit normalization layer before estimation.

Suggested flow:

1. validate raw input
2. reject save if structure is missing, incomplete, or insufficient for trustworthy IF/TSS
3. normalize the plan into an effective structure
4. compute derived metrics from normalized structure
5. return both the saved plan and normalized derived summaries needed by the client

### Suggested helper split

- `normalizeActivityPlanForEstimation()`
- `estimateNormalizedActivityPlan()`

### Input and output contract recommendations

For activity-plan mutations:

- input should remain the user-authored payload
- output should include:
  - saved plan
  - normalization metadata
  - derived metrics

This reduces client duplication and removes the need for detail screens to infer what happened.

## UI/UX Recommendations

### Current UX problems

- route selection is visually optional but semantically disconnected from structure building
- structure builder shows duration, TSS, and distance from structure-only calculations
- route selector shows route stats, but the user is not told whether the structure covers the route
- References:
  - `apps/mobile/components/Routes/RouteSelector.tsx:65-175`
  - `apps/mobile/components/activity-plan/structure/StructureBuilderCard.tsx:46-107`

### Target UX model

Creating an activity plan should remain a structure-first flow, with route shown as an optional route attachment.

### Recommended composer interaction changes

1. Keep the existing structure builder as the primary authoring surface.
2. Allow route attachment without changing the authored structure.
3. Make route UI clearly non-authoritative unless it has been converted into the saved effort model before save.
4. On route removal, preserve authored structure.

### UI changes to add

The MVP should add only the minimum UI needed to make the save contract legible:

1. save gating that blocks persistence when the plan cannot produce trustworthy IF/TSS
2. inline copy near route attachment explaining that a route does not make the plan complete by itself
3. form-level validation messaging for route-driven cases the app recognizes but cannot yet save authoritatively
4. summary language that separates saved-effort-derived metrics from attached route facts
5. clearer empty-state guidance when a route is attached but saveable structure is still missing or incomplete

### UI changes to remove

The MVP should remove or stop rendering UX that implies more authority than the product can support:

- any save path that allows route attachment alone to look like a complete saved activity plan
- any summary presentation that makes route-derived estimates look like authoritative saved IF/TSS
- any copy that suggests the route defines the workout load by default
- any ambiguous wording that collapses route attachment, route goal, and authored structure into one concept

### Minimal UI additions

The recommended implementation should preserve the existing composer and add only a few route-aware surfaces:

1. route card or preview for attached-route input
2. optional elevation/profile context where already supported
3. copy that avoids implying route completion or route-defined metrics
4. save-state explanation when route intent is recognized but not yet saveable without explicit structure

Do not add:

- a separate simple mode
- a separate advanced mode
- a new dedicated route-planning wizard unless later proven necessary

### Recommended single-flow behavior

After route upload or selection:

1. attach the route
2. keep the existing structure untouched
3. continue editing structure through the existing flow
4. show the existing chart and structure builder as usual
5. if a route is attached, show route input only where useful
6. if structure is not yet saveable, keep editing available but block save with explicit guidance

This is the preferred implementation because it is:

- elegant
- developer-friendly
- minimal in UI churn
- fully compatible with a stricter type-safe model

### Edit screen route context

If a route is attached on the activity-plan structure edit screen, the screen should show:

1. activity-plan structure display
2. optional route context beneath or near it where useful

Reason:

- users may still want route input while editing a structure-first plan
- route display should stay supportive and lightweight without implying load authority

This should be treated as a supportive route attachment for structure editing, not as a second editor.

### Summary and metrics presentation

The UI should distinguish two categories of information whenever a route is attached:

1. authoritative saved-plan metrics derived from the saved effort model
2. non-authoritative route facts such as route distance, elevation, and preview context

The UI should not visually collapse those into one undifferentiated metric block if that would imply route-defined load.

### Recommended edge-case protections

- if the user changes activity category after route selection, require route compatibility revalidation
- if a route is attached to an incomplete plan, do not imply that the route satisfies save requirements
- keep route-aware protections limited to truthful copy and non-authoritative display
- if the user appears to be authoring a route-goal or partial-route plan that cannot yet be represented as trustworthy structure, prevent save and explain why

### Expected v1 behavior by scenario

1. structured workout with optional route attachment
   - save allowed
   - authoritative metrics come from structure
   - route remains supporting context
2. route attached with no valid non-empty structure
   - save blocked
   - UI explains that route attachment alone is not enough for a saveable activity plan
3. user intent appears to be only part of the route
   - save blocked unless the intent has been converted into trustworthy explicit structure
   - UI explains that partial-route intent is recognized but not yet a supported authoritative save path
4. user intent appears to be that the route itself defines the workout
   - save blocked unless converted into the saved effort model before save
   - route facts may still be displayed, but not as authoritative load

### Product simplicity rule

When deciding between a hard constraint and a warning, prefer the warning unless the app would otherwise state something materially false.

Examples of what should be prevented:

- allowing a route attachment to imply that a plan is saveable without structure
- presenting route-based metrics as authoritative plan load

Examples of what can remain flexible:

- attaching or removing a route without changing the authored structure
- showing route context in the editor without affecting plan metrics

Non-negotiable invariant:

- every saved plan must still persist a real structure with enough target information to compute IF and TSS

### UX research alignment

These recommendations align with established UX guidance:

- progressive disclosure:
  - keep new route-specific controls minimal and only disclose them when they solve a real mismatch
- simplicity over excessive choice:
  - do not introduce a large new set of modes or competing workflows when the existing structure-builder can be extended safely

Sources:

- `https://www.nngroup.com/articles/progressive-disclosure/`
- `https://www.nngroup.com/articles/simplicity-vs-choice/`

## Suggested Implementation Order

1. Require non-empty structure in shared schemas.
2. Remove route-derived estimation as an authoritative saved-plan path.
3. Update `computePlanMetrics()` to normalize plans from structure before estimation.
4. Fix route-driven contradictions in derived metric presentation.
5. Keep route attachment optional and non-authoritative in API and UI contracts.
6. Add tests for:
   - missing-structure save rejection
   - structure-driven metric derivation
   - route attachment without structure authority
   - long route plus short structure not leaking misleading route metrics

## Open Questions For Next Phase

- whether route-aware defaults should return in a later phase
- whether route-fit warnings should exist in a later phase
- whether route context should influence any non-authoritative preview metrics later
- whether the normalized effective structure should be persisted or recomputed on demand

## Source URLs

- https://zod.dev/?id=discriminated-unions
- https://zod.dev/?id=error-formatting
- https://react-hook-form.com/docs/usefieldarray
- https://react-hook-form.com/docs/usewatch
- https://react-hook-form.com/docs/useform/trigger
- https://trpc.io/docs/server/validators
- https://www.nngroup.com/articles/progressive-disclosure/
- https://www.nngroup.com/articles/simplicity-vs-choice/
