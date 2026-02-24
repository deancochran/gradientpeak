# Tasks - Training Plan Create/Edit Parity

Last Updated: 2026-02-22
Status: Ready for implementation
Owner: Mobile + tRPC + QA

Implements `./design.md` and `./plan.md`.

## Phase 0 - Guardrails

- [x] Document mode contract for shared composer (`create` / `edit`).
- [x] Document invariant: edit save updates training plan structure only.
- [x] Add explicit user-facing copy in edit mode: completed history is unaffected.

## Phase 1 - Shared Composer Container

- [x] Extract create orchestration from `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx` into shared composer container.
- [x] Keep `SinglePageForm` as shared UI surface.
- [x] Add mode-based header/CTA labels (`Create` vs `Save changes`).
- [x] Preserve existing preview, conflict, and validation behavior for create mode.
- [x] Ensure create route remains behaviorally unchanged after extraction.

## Phase 2 - Edit Initialization Adapters

- [x] Add reverse adapter: `training_plan.structure` -> `TrainingPlanFormData`.
- [x] Add reverse adapter: `training_plan.structure(+metadata)` -> `TrainingPlanConfigFormData`.
- [x] Prefer metadata snapshot fields when available (calibration/config context).
- [x] Add fallback rules for missing metadata (defaults + suggestion-safe values).
- [x] Add adapter determinism tests (modern + partial/legacy shapes).

## Phase 3 - Edit Save Mutation

- [x] Add `updateFromCreationConfig` mutation in training plans router/use-case layer.
- [x] Reuse create pipeline stages (evaluation, projection, conflicts, override audit).
- [x] Enforce ownership and validation semantics consistent with create.
- [x] Update existing plan row (no insert) and preserve plan identity.
- [x] Ensure no writes to `activities` occur in edit-save path.
- [x] Return creation/edit summary payload for UI parity.

## Phase 4 - Routing and Entry Points

- [x] Add edit route using shared composer in edit mode.
- [x] Wire plan dashboard/adjust/settings entry points to new edit route.
- [x] Keep `training-plan-settings` focused on activation/deletion/basic metadata or remove duplicate structure-edit controls.
- [x] Add fallback handling for missing/invalid plan id in edit mode.

## Phase 5 - UX/Parity Validation

- [x] Verify Create/Edit visual parity across tabs and section ordering.
- [x] Verify mode-specific text only differs where intended (title/CTA/save copy).
- [x] Verify blocker surfacing and override interaction parity.
- [x] Verify edit mode communicates "future structure updates only".

## Phase 6 - Tests

- [ ] Add/extend mobile tests for composer parity (`create` vs `edit` mode).
- [x] Add tests for reverse adapter mappings and fallback behavior.
- [x] Add/extend tRPC tests for `updateFromCreationConfig`.
- [x] Add integrity test asserting edit-save does not mutate completed activities.
- [x] Add stale preview token / conflict rejection tests for edit save (if token required).

## Quality Gates

- [x] Run `pnpm check-types`.
- [ ] Run `pnpm lint`.
- [x] Run targeted mobile + trpc tests for modified areas.
- [ ] Run full `pnpm test` when feasible; document unrelated baseline failures if any.

## Definition of Done

- [x] Create and Edit use one shared composer UI.
- [x] Edit save uses create-equivalent evaluation and safety semantics.
- [x] Past activity history remains unchanged by edit saves.
- [x] Existing defaults and advanced controls are preserved.
- [x] Tests validate parity, integrity, and mutation behavior.
