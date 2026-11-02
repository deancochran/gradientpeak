# Activity plan editor redesign

## Approved reference and scope

The user approved the coordinator's two-panel outline/editor concept on November
2, 2026 and requested implementation with shared web/native components and mobile
visual fidelity. The concept is the design reference, not merely inspiration.

Outcome: scan the workout, select a step, change duration/target, and return to the
outline without a wall of optional fields or persistent destructive actions.
No database, provider, prescription-default, or native dependency changes are
required. Existing target types, validation, drafts, and repeat operations must
remain available. Do not replace semantic fields with decorative raw inputs.

## Visual acceptance reference

- Use project tokens: dark background #0a0a0a, card #171717, secondary #262626,
  foreground #fafafa, muted foreground #a1a1a1, primary #e5e5e5.
- Compact navigation with back, Create plan, and Save; editable title below.
- Category chip and one short summary line (duration and meaningful step count).
  Omit unavailable estimates rather than allocating space to dashes.
- Timeline approximately 40px high; do not render a large solid single-step bar.
- Workout is the dominant surface: rounded rows, approximately 64px minimum,
  name and duration/target summary, one trailing actions menu. No always-visible
  duplicate/delete/move button cluster.
- Repeat header has count, collapse control, and actions; a subtle left rule
  groups children. Editing a child must communicate that all repetitions change.
- Add step is a one-tap primary action; Add repeat is secondary.
- Step editor groups duration selector/value and target selector/value into two
  compact surfaces. Additional targets and optional name/coaching cue progressively
  disclose; populated optional values must not disappear behind an empty label.
- Prefer a contextual, keyboard-aware sheet, expanding for keyboard, large text,
  or complex values. Preserve accessibility rather than force fixed heights.
- One Apply changes/Add step action per editor; Cancel leaves original unchanged.
- Reduce visual chrome, not touch targets (minimum 44 points), contrast, text
  scaling, keyboard behavior, or screen-reader semantics.

Illustrative reference data only: Morning intervals, Run, warm-up 10min at120bpm,
3 repetitions of work3min at155bpm plus recovery2min at120bpm, cool-down5min at
120bpm. Total30min,8 executed steps. Never seed this as a real user's prescription.

## Behavior and evidence contract

- Reuse shared UI contracts/renderers across web and native; app composition owns
  navigation, domain data, and mutations. Shared domain logic remains in Core.
- Preserve malformed/partial edits until correction; field errors identify the
  affected input. Cancel/close must not accidentally save drafts.
- Switching target types must not silently overwrite an explicit duration.
- Keep multiple targets, repeat count/ungroup/movement, and accessible reorder.
- Check empty and populated optional disclosure, invalid input recovery, cancel,
  add/edit/duplicate/delete, and repeat scope with focused component tests.
- Run owning types and static checks plus independent review before publication.
- Compare rendered mobile against the approved composition where a compatible
  device is available. Bundle compilation and native Jest are not visual proof.
- Independently verify feature acceptance; shared-preview health alone does not
  prove correctness or pixel fidelity. Report missing runtime/device evidence.

## Baseline and delivery

Feature branch `feat/activity-plan-editor` starts at fetched origin/main
`c7072ca839ca646f9a8db470af26756b8327cbe7`. The approved non-preview reconciliation
checkpoint `a4ed7ea22b2b52272908a3e2cf7311abd63c290d` is merged as a prerequisite
at `69469b0ffaa689578e2d962d064be274be104e49`; this is not a claim that the
reconciliation has reached remote main. Preview is never a feature source.

Status: implementation in progress, not live. Coordinator owns review, exact
checkpoint integration under SHARED-PREVIEW.md, affected-runtime verification,
publication and final evidence. Workers must not mutate preview or its services.

### First slice evidence

Implemented shared controlled Disclosure (explicit native/web export and one prop
contract), mobile overflow actions/collapsible repeats/optional details, equivalent
web description disclosure, and preservation of duration when selecting rest.
The timeline receives a true 40px layout height, not a clipped 92px chart. Native
icons use theme-aware shared Icon. Full contextual editing and compact field pairs
remain follow-up work; this checkpoint is not full reference acceptance.

Coordinator checks: native activity-plan 51 tests, web composer/edit-session 22
tests, Disclosure web 2/native 1 tests passed; UI/mobile types and test-structure
passed. Native row/icon checks were rerun after theme repair (3+1 tests passed).
Initial broad quality gate found missing Disclosure web coverage; coverage was
added and the structure gate passed. Broad rerun in progress.

No attached adb device; shared browser is signed out. Neither native visual
fidelity nor authenticated end-to-end save is claimed from component evidence.
