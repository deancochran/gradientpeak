# Activity plan editor redesign

Latest screenshot correction implementation: mobile/web guard Rest/non-Time
transitions at selection, track selected Time separately from unfinished numeric
values, and preserve legacy mismatch repair. Compact distance type/value/unit
siblings and inline metadata replace stacked controls; first-target copy is fixed.
Native quantity error visibility is opt-in so duration owns one consolidated error
without disabling invalidity callbacks. Rest removal shares the selector row.

Coordinator found Picker.Item.enabled is not implemented in installed iOS picker
source. Disabled alternatives are omitted from native picker items, not merely
rejected by callbacks; existing disabled selections may remain visible for repair.
Added omission/callback/repair regression. Corrected exact-optional option typing
and asserted a single duration error in dialog coverage. Node24 coordinator checks:
mobile editor59 tests, native picker/choice/quantity37 tests, web activity-plan43
tests and UI exact-optional types passed. Browser acceptance and independent review
are pending. Rendered iPhone appearance remains unverified. No dependencies,
native binaries, schemas or preserved data changed.

## User corrections — authoritative over the earlier concept

### Follow-up iPhone screenshots: prevent invalid choices, not only saves

The user's next screenshots reject the current interaction: Distance can still
select Rest, distance controls wrap into a tall panel, empty values immediately
show duplicate errors, and zero targets show Add another target. Step metadata
also remains oversized/stacked rather than the requested compact rows. Prior
automated row checks did not establish rendered iOS acceptance.

Rest must be unavailable when duration is Distance, Repetitions or unset. While
Rest is selected, non-Time duration choices must be unavailable until Rest is
changed/removed. Guard handlers as well as picker options; never silently rewrite
values. Legacy inconsistent drafts must retain a repair path, including changing
or removing Rest. Keep authoritative save validation as defense in depth.

Use a compact distance selector/value/unit row at normal phone widths, intentional
large-text wrapping, directly editable label/value metadata, less redundant cue
copy, Add target for the first target, and one duration error after interaction
or save rather than immediate duplicate blank errors. Investigate native overlay
spacing without claiming class-name assertions prove iPhone geometry. Publication
was paused again before these changes; current preview checkpoint2597cddf remains
live but does not satisfy this latest correction. Coordinator owns new checkpoint
verification/integration; implementation in progress, not live.

Correction checkpoint evidence: mobile plan metadata now uses always-visible
semantic fields; creation state supplies a real New plan title once and permits
clearing. Step metadata is first; duration/target selectors and values share rows.
Required targets are enforced by Core and API write boundaries; legacy structures
remain readable/editable for repair, with save blocked until targets are supplied.
Review found and repaired legacy web initialization and API consolidation using
strict authoring too early (which prevented repair and misclassified validation
as server errors). Pace value-only triggers retain their unit and accessible value.

Coordinator checks on the correction: mobile activity-plan100 tests, store6 tests,
UI native58 tests, Core activity-plan141 tests, API router86 tests, web activity-plan
42 tests passed; mobile/API types and UI exact-optional types passed. Disposable
browser run acceptance-1890618-1793662948355 passed4 desktop/mobile-width journeys,
including directly editable fields, targetless save rejection, zero intensity and
timed Rest persistence. Native fixture now supplies explicit Rest rather than an
invalid targetless step; native runtime remains unverified due prior startup block.
These checks do not establish actual iPhone geometry; fresh iPhone comparison is
still required. No preserved data, schema, dependencies or native modules changed.

- Direct editing is the default. Routine fields must not require an Edit button
  or disclosure before typing. Plan name is an always-visible controlled input
  with a real prefilled new-plan value; existing names/user edits must never be
  overwritten by that default. Step name, description and coaching cue are compact
  directly editable inputs too. Keep them near the top. Reserve disclosure for
  optional complexity or repeat-group navigation, not ordinary field access.
  This supersedes the earlier recommendations to collapse plan/step metadata.
- Actual iPhone screenshot showed the duration selector far right, its value on
  another line, and optional step metadata at the bottom. This is NOT accepted
  reference fidelity. Move step info first; align Name/value and Cue/value as
  compact rows. Put duration type and value on the SAME line, and target type and
  value on the SAME line, removing redundant visible labels but preserving
  semantic accessibility labels. Large accessibility text may wrap intentionally.
- A step MUST have at least one target to be valid. No-target drafts may be edited
  but cannot be committed as valid steps/plans. Rest targets are valid ONLY with
  Time duration, never Distance or Repetitions. Enforce in shared validation and
  both clients; do not silently invent a target or change an explicit duration.
- Existing targetless data should remain readable for repair; no data migration
  or rewriting existing saved plans is authorized by this correction. All new or
  edited saves must meet the new invariant. Earlier acceptance of targetless
  timed steps is superseded, including relevant fixture expectations.
- Previous push attempt was cancelled before applying these corrections so a
  moving source tree is not presented as verified. Whole-repo unit tasks had
  passed9/9 serially before this new behavior change; that evidence does not cover
  the correction. Coordinator owns fresh review, focused acceptance and preview.

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

Status: first slice live in preview; full redesign still in progress. Coordinator owns review, exact
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

### First checkpoint preview disposition

Checkpoint `1154370ad3e5dbeb4429cebfab2b055ab28fd1f1` integrated under the preview
lock from `f6e1eab3535b16f567c92b541e4bafd7963156e4` to
`a5430a6f2f59ca513ca36e23a217ba7a0d74d9da`. Ancestry checker passed, integrated
native51/web22 tests passed, API health and Metro status passed. Actual served iOS
bundle contains the overflow action and optional-detail markers. No data/schema,
native binary, environment, or dependency version changes.

Independent review findings: mobile repeat width and missing expanded state fixed
in1154370a; optional detail label now reads current draft fields. Shared Disclosure
web coverage and shared type/export were repaired before integration. Web outline
action parity remains a second-slice requirement, not accepted as complete.

Broad quality retry passed static checks and all eight package type checks but
the command timed out at120seconds during the strictness ratchet. This is not a
passing broad gate; rerun with adequate time after the next stable checkpoint.

Second slice in progress: compact semantic field pairs, contextual guarded step
editor, compact meaningful metadata, and web overflow/collapse parity. Coordinator
owns its review, integration and publication; no final mobile fidelity claim yet.

### Second slice acceptance in progress

Implemented web overflow actions/repeat collapse, compact 40px timeline, mobile
duration/target panels, compact ChoiceField density shared across platforms,
pageSheet editing using the existing keyboard-aware modal, and available-only
inline estimates (including legitimate zero). Existing full-height Android native
modal behavior differs from iOS pageSheet and is not claimed pixel-identical.

Worker verification: mobile62 tests, UI native18 tests, web23 tests and all three
owning type checks passed. Coordinator disposable browser acceptance run
`acceptance-1672091-1793657043058` passed4 journeys on Desktop Chrome and Mobile
Chrome390x844, including invalid draft recovery, zero-target persistence and
scheduling the UI-edited plan. Runner owned all synthetic DB/storage/server
resources and cleanup; preserved/shared data was not mutated.

Native preparation: designated gradientpeak-e2e emulator started with retained
data. Current Expo prebuild generated ignored Android source without package
changes. Two CLI flag attempts failed before compilation (device selector and
mutually exclusive port/no-bundler); reassessed using installed help and switched
to generated Gradle assembleDebug, x86_64 only, two workers, dev port8083. No shared
Metro restart or native installation is implied by build preparation.

### Second checkpoint preview disposition

Checkpoint `30e87d89b92ed1a6286e2a5df51c86b1e9d5aee4` integrated at preview
`d9f621efbf88f24bb93b03b507d62b5995aa258f`. Initial post-merge checks timed out
under host memory contention. After stopping only this task's broad quality
process tree, a locked rerun passed integrated native62/web23 tests, ancestry,
API/Metro health and served iOS compact-panel marker. Second independent source
review found no additional actionable findings. This checkpoint is live in preview.

Native Gradle build succeeded (x86_64,776 tasks). The designated emulator crashed
while host memory/swap were saturated; restarted with two cores after build
completion, retained its data, verified boot and installed current APK with `-r`.
The guarded native acceptance runner is executing separately; build/install is
not native authoring or visual acceptance. Broad gate was deliberately interrupted
to relieve memory contention after static checks and all package types passed;
strictness/full suites/publication still require an uninterrupted serial run.

### Native startup diagnosis

Runs `acceptance-1699419-1793658479001` and
`acceptance-1710394-1793658715115` stopped at the sign-in visibility assertion,
before entering credentials or activity-plan UI. First cold bundle had not
finished by the UI deadline. Warming the runner-owned Android bundle alone did
not resolve the second run: native logs show React `main` starting about44seconds
after openLink, after the existing30second startup wait. Blank startup screenshots
are not editor failures or visual acceptance.

Reassessment: retain the compile readiness check in the disposable runner and
allow90seconds only for cold initial sign-in startup. Subsequent interaction
timeouts and all data assertions remain unchanged. Third guarded run is in
progress; no claims about editor runtime until it reaches and verifies that UI.

Native run `acceptance-1717389-1793658879713` also failed before sign-in,
this time with the outer Maestro process timeout. Review identified the outer
150second budget could preempt the startup plus onboarding waits; it is now
240seconds for onboarding only (other flow limits remain150seconds). That final
timeout adjustment has not been runtime verified. No further blind retries:
native acceptance remains blocked on reliable emulator app startup. All three
runs retained their semantic assertions, and none proves editor behavior.
Runner-owned ports3100/8083 and ADB reverse mappings were confirmed cleaned;
task-owned emulator stopped without clearing app data. A current debug APK is
retained in the ignored Android output directory for the next bounded diagnosis.

Owner: activity-plan editor coordinator. Next native evidence required: stable
synthetic sign-in startup, then completion of the maintained native authoring
flow and screenshot comparison. Physical iOS page-sheet/keyboard fidelity is
still unverified. Publication is attempted through the normal push gate; no hook
bypass or preserved database repair is authorized by this UI task.
