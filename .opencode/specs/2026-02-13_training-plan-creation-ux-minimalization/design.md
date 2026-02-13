# Design: Training Plan Creation UX Minimalization

Date: 2026-02-13
Owner: Mobile + Product Design + Core Planning
Status: Proposed

## Problem

The current training plan creation experience is powerful but cognitively heavy. Users encounter too many concepts at once, including advanced planning controls and internal model semantics, before they reach a usable plan.

Observed friction in the current mobile flow:

- High information density across tabs and sections creates decision fatigue.
- Advanced controls (locks, provenance, safety tuning) are mixed with first-run essentials.
- Nested interactions (goal cards + target modal + review conflicts) increase context switching.
- Validation mostly resolves at submit time, which makes correction late and error-prone.

## Goals

1. Reduce cognitive load so first-time users can create a valid plan in under 2 minutes.
2. Make the default flow minimal and progressive, with advanced controls hidden by default.
3. Prevent common errors earlier with inline validation and clear corrective guidance.
4. Preserve all existing planning power for expert users via explicit opt-in advanced mode.
5. Keep backend contract compatibility for preview/create endpoints.

## Non-Goals

- No changes to projection math, readiness scoring, or safety model logic.
- No removal of advanced controls from the product; only visibility and sequencing changes.
- No API contract rewrite for creation config payloads.
- No redesign of post-create plan refinement flows.

## Design Principles

1. **Progressive disclosure first:** basic users should only see inputs required to generate a solid default plan.
2. **One decision at a time:** reduce branching and avoid introducing planning jargon early.
3. **Inline prevention over late failure:** surface errors at field-level as soon as they become invalid.
4. **Meaning over mechanics:** communicate plan quality in plain language, not internal state names.
5. **Advanced is optional:** expert controls stay available behind a clear "Advanced settings" entry point.
6. **Input modality fit:** each field must use an input component designed for its data type (date, duration, pace/speed, numeric count).

## Target UX Structure

### Step 1: Primary Goal (Required)

Collect only:

- Goal name
- Goal date
- One primary target definition

Optional goals remain available but are moved behind "Add another goal" after primary goal completion.

### Step 2: Weekly Availability (Required)

Collect only:

- Training days per week (simple day toggles)
- Sessions per week range (min/max)

Use conservative smart defaults from suggestions without exposing provenance details.

### Step 3: Review and Create (Required)

Show concise summary:

- Goal(s) snapshot
- Weekly training footprint
- Feasibility and safety status in plain-language banding

Primary CTA remains "Create". Blocking issues appear in a focused "Fix before create" card with direct actions.

## Advanced Settings Model

All advanced controls move into a collapsed "Advanced settings" section, accessible from Step 3 (and optionally Step 2):

- Availability template and fine-grained day windows
- Recent influence mode and manual score
- Constraint tuning (difficulty, max session duration, rest-day specifics)
- Safety cap tuning (weekly TSS ramp, CTL ramp, post-goal recovery days)
- Lock controls (for expert override consistency)

Default state: collapsed and never auto-expanded.

## Information Architecture Changes

1. Replace current tab-heavy single-page mental model with a lightweight 3-step flow.
2. Keep projection chart optional and collapsed by default ("Show forecast").
3. Remove internal labels from default view:
   - Hide raw source/provenance badges.
   - Hide lock-state mechanics unless advanced is open.
4. Replace target edit modal with inline expandable target editor to reduce navigation/context loss.

## Input Component Standards (Best Practice UX)

To reduce format errors and improve confidence, the create flow must use type-compatible input components rather than generic text fields.

### Component-to-Data Mapping

- **Date values** (goal date, plan start date): native date picker (`DateTimePicker`) with min/max constraints.
- **Duration values** (completion time, test duration): structured duration input (`h:mm:ss`) with segmented fields or mask.
- **Pace values** (`mm:ss`): dedicated pace input with unit label (`/km` default) and normalized seconds output.
- **Speed values** (if shown in future targets): decimal numeric input with unit suffix (`km/h` or `mph`) and bounded range.
- **Distance values**: decimal numeric input with `km` suffix plus quick-select chips for common distances.
- **Session counts / rest day counts**: stepper or bounded integer input, not free text.
- **Percent caps** (weekly load ramp): slider + numeric fallback with clamped range.

### UX Rules for Typed Inputs

1. Keep display format and stored format explicit (for example: display `1:35:00`, store seconds).
2. Apply validation at the component boundary (invalid keystrokes or impossible ranges are blocked early).
3. Show unit context inline (`km`, `%`, `min/km`, `CTL/week`) to prevent interpretation ambiguity.
4. Provide keyboard type aligned to entry pattern (`numeric`, `numbers-and-punctuation`) where native picker is unavailable.
5. Provide accessible labels and hints that include expected format.

## Validation and Error Handling

### Validation Strategy

- Field-level validation on blur/change for high-risk inputs:
  - Target date must be future date.
  - Time/pace format validation through typed components.
  - Min sessions cannot exceed max sessions.
- Step-level gating: user cannot continue until required fields are valid.
- Submit-level validation retained as final guardrail.

### Error Communication

- Show immediate inline messages near offending fields.
- At review step, aggregate only top blocking issues (max 3) with "Fix" actions.
- Disable create CTA only when blocked, with explicit reason copy.

## Content and Copy Simplification

- Replace technical labels with user-centered language:
  - "Recent influence" -> "How much recent training should affect this plan"
  - "Max weekly TSS ramp" -> "Maximum weekly load increase"
- Keep explanatory microcopy short (one line per control in default flow).
- Move long educational bullets to contextual "Learn more" disclosures in advanced mode.

## Technical Implementation Direction

### UI Layer

- Refactor `SinglePageForm` into composable step sections:
  - `GoalStep`
  - `AvailabilityStep`
  - `ReviewStep`
  - `AdvancedSettingsSection`
- Introduce a lightweight step state machine (`currentStep`, `canContinue`, `canCreate`).
- Introduce reusable typed input controls for domain-specific values:
  - `DateField`
  - `DurationInput`
  - `PaceInput`
  - `BoundedNumberInput`
  - `IntegerStepper`
  - `PercentSliderInput`

### State and Mapping

- Preserve existing form data and config schema shapes.
- Continue using existing adapters and `buildCreationInput` mapping.
- Add derived display model for plain-language review summaries.

### Backward Compatibility

- Do not modify `createFromCreationConfig` and `previewCreationConfig` contract shape.
- Keep conflict resolution code paths and quick-fix behaviors; remap presentation only.

## Rollout Plan

### Phase 1: Structural UX Refactor

- Introduce 3-step shell and move current controls to appropriate steps.
- Keep advanced controls intact but hidden in collapsed section.

### Phase 2: Validation + Messaging

- Add inline validation triggers and step gating.
- Simplify copy and review conflict presentation.

### Phase 3: Interaction Polish

- Replace target modal with inline expansion.
- Make chart optional/collapsed by default.

## Acceptance Criteria

1. Default user flow exposes only goal, availability, and review essentials.
2. Advanced controls are hidden by default and accessible via explicit expansion.
3. Users can create a valid plan without touching advanced settings.
4. Blocking issues are surfaced before submit with direct corrective actions.
5. Create/preview endpoint payload compatibility remains unchanged.
6. Date/time/pace/distance/count fields use type-compatible input components with units and format-safe validation.

## Success Metrics

- Reduced abandonment rate on training plan creation.
- Reduced average correction loops (failed create attempts per successful create).
- Reduced median time-to-create for first-time users.
- Increased completion rate without advanced settings edits.
