# Design: Training Plan Creation UX Minimalization (In-Place Refactor)

Date: 2026-02-13
Owner: Mobile + Product Design + Core Planning
Status: Proposed

## Clarification

This specification intentionally improves the **existing create experience** rather than introducing a new process architecture. The work is an in-place simplification of the current screen and flow.

## Problem

The current training plan creation form is powerful but cognitively heavy. Users face too many simultaneous decisions and internal-system concepts before they can submit a valid plan.

Observed friction:

- Too many visible controls in the default view.
- Advanced controls appear alongside essential controls.
- Error discovery is late (often at submit time).
- Generic text inputs increase formatting mistakes for typed values (date, duration, pace, counts).

## Goals

1. Simplify the current form without replacing the overall create process.
2. Keep essential inputs visible by default and progressively disclose advanced controls.
3. Reduce input errors through type-compatible controls and earlier validation.
4. Preserve all current backend behavior and payload contracts.
5. Preserve existing power-user capabilities.
6. Reduce visible component count and on-screen text while keeping decision quality high.

## Non-Goals

- No new route architecture or multi-screen wizard flow.
- No API contract changes for preview/create endpoints.
- No changes to projection, safety, or feasibility calculations.
- No removal of advanced controls; only placement and default visibility changes.

## Design Principles

1. **In-place simplification:** optimize the current surface, do not replace it.
2. **Progressive disclosure:** show essentials first, reveal advanced only on demand.
3. **Typed input fit:** input component must match data type.
4. **Early prevention:** inline errors before submit.
5. **Plain-language copy:** user intent over internal terminology.
6. **Information compression:** summarize by default, expand for details.
7. **Component budget:** avoid rendering every control at once.

## Updated UX Model (Current Process, Simplified)

Maintain the existing create screen and orchestration, but simplify presentation:

1. Keep current tabbed/single-page structure, but make default user journey:
   - Goals
   - Availability
   - Review
2. Move influence/constraints complexity into collapsed "Advanced settings" inside the existing flow.
3. Keep chart available, but collapsed behind "Show forecast" by default.
4. Keep existing conflict quick-fixes, but surface top blockers near Create CTA.

## Content and Component Consolidation Rules

### Default View Budget

- Show only the minimum controls required to create a valid plan.
- Keep helper text to one short line per section in default view.
- Do not show long explanatory paragraphs unless user expands "Learn more".
- Limit visible blocking messages to top 1-3 actionable items.

### Consolidation Patterns

1. Replace repeated field groups with compact summary rows (value + edit action).
2. Group related controls into expandable cards (for example, "Training limits", "Safety caps").
3. Use "Show details" and "Advanced settings" disclosures instead of always-rendered subcomponents.
4. Use chips/tags for quick context (days selected, sessions/week) instead of verbose text blocks.
5. Keep one primary CTA area with concise status; avoid duplicate warnings in multiple sections.

### Data-Driven Minimalism

- Auto-populate recommended values from available athlete data.
- Show recommendations as prefilled defaults, not long narrative explanations.
- Let user override only when needed via inline edit or expansion.

## Input Component Standards (Required)

Use type-compatible inputs to reduce formatting errors:

- **Date fields** -> native `DateTimePicker` with min/max constraints.
- **Duration fields** -> structured `h:mm:ss` input.
- **Pace fields** -> structured `mm:ss` input with `/km` label (or configured unit).
- **Distance fields** -> decimal numeric input with `km` suffix and common-distance chips.
- **Count fields** (sessions/rest days) -> integer stepper or bounded integer input.
- **Percent fields** -> slider + numeric fallback with clamped range.

Rules:

1. Show units inline (`km`, `%`, `min/km`, etc.).
2. Keep display formatting and stored values explicit.
3. Apply validation at component boundary (not only on submit).
4. Provide accessibility hints with expected format.

## Validation and Error Handling

- Add field-level validation on blur/change for high-risk fields.
- Add section-level validation cues before create attempt.
- Keep submit-time validation as final guardrail.
- In review area, show top 1-3 blocking issues with direct fix actions.

## Progressive Disclosure Requirements

1. Every non-essential section must be collapsed by default.
2. Advanced detail opens only by explicit user action.
3. Expanded sections must be independently collapsible.
4. State must persist when users expand/collapse or switch tabs.
5. A minimal path must remain fully functional without opening any advanced section.

## Technical Direction

1. Refactor existing `SinglePageForm` in place; avoid introducing parallel form architecture.
2. Extract reusable typed inputs under existing create component tree.
3. Keep `training-plan-create.tsx` orchestration and adapter mapping intact.
4. Preserve existing quick-fix conflict handlers and preview/create mutation paths.

## Acceptance Criteria

1. Current create process remains intact (no new process architecture required).
2. Default view is materially less dense and advanced controls are collapsed by default.
3. Date/time/pace/distance/count fields use type-compatible components.
4. Blocking issues are visible before create and have direct correction paths.
5. Preview/create payload compatibility remains unchanged.
6. Default view contains consolidated summaries with expandable details instead of fully expanded control groups.
7. Users can complete creation on the minimal path while still being able to expand for deeper control.

## Success Metrics

- Lower create-form abandonment.
- Fewer correction loops per successful create.
- Lower input-format validation errors.
- Higher completion rate without opening advanced controls.
