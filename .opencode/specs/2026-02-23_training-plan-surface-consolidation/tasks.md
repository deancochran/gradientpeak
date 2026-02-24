# Tasks - Training Plan Surface Consolidation

Last Updated: 2026-02-23
Status: Implemented (telemetry follow-up pending)
Owner: Mobile + UX + QA

Implements `./design.md` and `./plan.md`.

## Phase 0 - Route Inventory and Guardrails

- [x] Create keep/consolidate/retire matrix for all training-plan routes.
- [x] Document canonical destination per user intent (view, edit, manage, adjust).
- [x] Confirm no capability loss in consolidated IA.

### Phase 0 Artifacts

| Route                            | Decision                  | Notes                                               |
| -------------------------------- | ------------------------- | --------------------------------------------------- |
| `/(tabs)/plan`                   | Keep                      | Canonical daily Plan Hub surface.                   |
| `/training-plan`                 | Keep (deep-link)          | Secondary deep-link view for selected plan context. |
| `/training-plan-create`          | Keep                      | Canonical create composer flow.                     |
| `/training-plan-edit?id=`        | Keep                      | Canonical structure editing flow.                   |
| `/training-plan-settings`        | Consolidate               | Manage/lifecycle actions only.                      |
| `/training-plan-adjust`          | Consolidate (legacy path) | Quick adjust now promoted via Plan Hub sheet.       |
| `/training-plan-method-selector` | Retire (redirect window)  | Legacy create-flow compatibility route.             |
| `/training-plan-wizard`          | Retire (redirect window)  | Legacy create-flow compatibility route.             |
| `/training-plan-review`          | Retire (redirect window)  | Legacy create-flow compatibility route.             |
| `/training-plans-list`           | Retire (redirect window)  | Legacy list compatibility route.                    |

Canonical intent mapping:

- View today/day-to-day usage -> `/(tabs)/plan`
- Edit structure -> `/training-plan-edit?id=`
- Manage lifecycle/metadata -> `/training-plan-settings`
- Quick adjust -> `QuickAdjustSheet` from `/(tabs)/plan`

No capability loss confirmation:

- Core intents (view, edit, manage, adjust) remain available from Plan Hub + composer/settings surfaces.
- Legacy route constants and route files remain in place for temporary redirect compatibility.

## Phase 1 - CTA and Navigation Alignment

- [x] Audit all training-plan CTAs in `/(tabs)/plan` and standard routes.
- [x] Fix mislabeled actions where destination does not match intent.
- [x] Ensure "Edit Structure" always routes to composer edit (`/training-plan-edit?id=`).
- [x] Ensure "Quick Adjust" routes to quick-adjust interaction, not settings.
- [x] Ensure "Manage Plan" routes to settings/manage surface only.

## Phase 2 - Shared Snapshot Data Layer

- [x] Add shared hook for plan/status/insights/curves and refresh helpers.
- [x] Migrate `/(tabs)/plan` to shared hook.
- [x] Migrate `/training-plan` to shared hook.
- [x] Standardize loading and error states for shared data dependencies.

## Phase 3 - Shared UI Component Extraction

- [x] Extract shared plan summary header component.
- [x] Extract shared KPI row component (progress/adherence/fitness).
- [x] Replace duplicated summary blocks in tab and standard plan routes.
- [x] Keep deep-link-specific content only where necessary.

## Phase 4 - Quick Adjust and Settings Consolidation

- [x] Promote quick-adjust sheet/modal as canonical quick-adjust flow.
- [x] Integrate quick-adjust action in Plan Hub primary path.
- [x] Reduce or remove standalone `training-plan-adjust` from primary nav flow.
- [x] Remove duplicated overview/status sections from settings route.
- [x] Keep lifecycle/basic metadata actions in settings route.

## Phase 5 - Legacy Route Deprecation

- [x] Mark deprecated route constants in `ROUTES.PLAN.TRAINING_PLAN`.
- [x] Keep temporary redirects for legacy paths during migration window.
- [x] Remove deprecated stack entries from standard layout when safe.
- [x] Add layout stack declaration guard test for canonical vs deprecated training-plan routes.
- [x] Remove legacy route files after telemetry confidence.

## Phase 6 - Validation and Telemetry

- [x] Validate Plan Hub create/edit/manage/adjust flows via route tests (full runtime E2E still pending telemetry).
- [x] Verify deep-link behavior for library-selected training plans via route tests.
- [x] Confirm no broken navigation/back behavior after route cleanup via replace/push routing tests.
- [ ] Capture before/after metrics: route depth, bounce/back frequency, flow completion.

### Phase 6 Metrics Snapshot (2026-02-23)

| Metric / Check                                                           | Before                                | Current                                                                     | Evidence (this phase)                                                                                               | Telemetry dependent |
| ------------------------------------------------------------------------ | ------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Plan Hub intent coverage (create/edit/manage/quick adjust)               | Not captured in telemetry             | Route tests cover all four intents                                          | `app/(internal)/(tabs)/__tests__/plan-navigation.test.tsx`                                                          | No                  |
| Library-selected training plan deep-link behavior (`/training-plan?id=`) | Not captured in telemetry             | Route test confirms id-preserving deep-link path avoids create redirect     | `app/(internal)/(standard)/__tests__/training-plan-deeplink.test.tsx`                                               | No                  |
| Legacy route retirement completeness                                     | Legacy compatibility redirects active | Legacy training-plan compatibility routes removed from standard surface     | `app/(internal)/(standard)/_layout.tsx`, `app/(internal)/(standard)/__tests__/training-plan-layout-routes.test.tsx` | No                  |
| Route depth (static UX path)                                             | Legacy paths existed in primary stack | Primary stack keeps canonical surfaces only; deprecated route files retired | `app/(internal)/(standard)/_layout.tsx`, `app/(internal)/(standard)/__tests__/training-plan-layout-routes.test.tsx` | Partially           |
| Bounce/back frequency + flow completion rates                            | Not available                         | Pending runtime analytics instrumentation + production traffic sampling     | N/A                                                                                                                 | Yes                 |

Telemetry note: before/after bounce-back and completion metrics remain pending because no production analytics pipeline currently captures per-route depth/back-stack events for these surfaces.

## Quality Gates

- [x] Run `pnpm check-types`.
- [x] Run `pnpm lint`.
- [x] Run targeted tests for affected mobile plan routes/components.
- [x] Run full `pnpm test` when feasible; document unrelated baseline failures if present.

## Definition of Done

- [x] Training-plan UX is anchored around Plan Hub, Composer, and Manage surfaces.
- [x] Duplicate training-plan overview experiences are removed or minimized.
- [x] Quick adjust is available from Plan Hub without separate full-screen dependency.
- [x] Legacy routes are deprecated with a clear removal path.
- [x] Shared data/component architecture reduces duplication and improves maintainability.
