# Tasks

## Completed

- Added a web `Switch` in `@repo/ui` and adopted it from `apps/web/src/app/(internal)/settings/page.tsx`.
- Extracted goal draft helpers from `apps/mobile/lib/goals/goalDraft.ts` into `packages/core/goals/draft.ts` and left the mobile file as a compatibility re-export.
- Extracted parsing helpers from `apps/mobile/lib/training-plan-form/input-parsers.ts` into `packages/core/forms/input-parsers.ts` and reused them from `packages/core/plan/trainingPlanPreview.ts`.
- Extracted training-plan validation/adapters from `apps/mobile/lib/training-plan-form/validation.ts` into `packages/core/plan/formValidation.ts` and left the mobile file as a compatibility re-export.
- Replaced the local schema in `apps/web/src/app/(internal)/settings/page.tsx` with a shared profile update contract derived from `profileQuickUpdateSchema`.
- Added shared notification adapters in `packages/core/notifications/index.ts` and adopted them from `apps/web/src/app/(internal)/notifications/page.tsx`, `apps/web/src/components/notifications-button.tsx`, and `apps/mobile/app/(internal)/(standard)/notifications/index.tsx`.
- Added package-level tests for the new core helpers and the new web `Switch`.
- Centralized mobile consumers on `@repo/ui` for parsed inputs and shared shell components, adopted shared `Alert`/`ToggleGroup` primitives in key mobile flows, and removed the app-local proxy wrappers those consumers previously depended on.
- Expanded mobile adoption of existing `@repo/ui` components by replacing more hand-rolled empty/error/auth/progress/comment-input states with shared `EmptyStateCard`, `ErrorStateCard`, `Alert`, `Progress`, and `Textarea` components.
- Continued the mobile centralization pass by replacing additional warning/divider/progress layouts with shared `Alert`, `Separator`, and `Progress` primitives and by adopting `RadioGroup` for training-plan schedule anchor selection.
- Migrated `GoalEditorModal` choice-group UI to shared `RadioGroup` and `ToggleGroup` primitives so mobile goal editing now relies more directly on `@repo/ui` selection controls.

## Open

- Define the `@repo/core` boundary policy for Supabase-derived types versus package-owned domain types and clean up remaining legacy schema imports.
- Promote reusable parsed field components from mobile into `packages/ui`.
- Promote generic shell components that are shared by both apps into `packages/ui`.
- Continue re-homing app-owned tests so package-level behavior lives primarily in `packages/core` and `packages/ui`.
