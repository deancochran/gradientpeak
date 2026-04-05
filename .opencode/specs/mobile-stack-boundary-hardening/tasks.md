# Tasks

## Open

- [x] Remove `@repo/db` from `apps/mobile/package.json` and `apps/mobile/tsconfig.json`.
- [ ] Migrate `packages/db` validation generation imports/dependency from `drizzle-zod` to `drizzle-orm/zod`.
- [x] Replace or narrow the safest remaining direct mobile Supabase usage paths.
- [x] Run focused verification for touched mobile/db/api files.

## In Progress

- [ ] Continue migrating the training-plan creation config tabs from ad hoc local state to RHF-owned subforms. The Limits, Tuning, and Availability tabs now use bounded local sections (`ConstraintsConfigSection.tsx`, `BehaviorControlsConfigSection.tsx`, and `AvailabilityConfigSection.tsx`); next bounded seam is another config tab or the remaining auth-boundary cleanup.

## Completed

- [x] Apply a conservative mobile dependency refresh wave that keeps Expo/RN/Router majors pinned while updating low-risk packages that verified cleanly (`react-native-ble-plx`, `superjson`, `victory-native`, `zustand`, `@swc/core`, `@types/lodash`).
- [x] Add a stronger `TrainingPlanComposerScreen` metadata regression test that proves the user-visible mount-time validation state through the rendered Plan tab (`Plan name is required.` and `Needs attention: Plan`).
- [x] Add focused hook-level regression coverage for `useAuth` optimistic onboarding/profile precedence so stale query data cannot override optimistic local state again.

## Notes

- This phase is intentionally boundary-first and low-risk.
- Remaining direct auth-account operations may stay temporarily if there is no stable API-safe replacement seam yet.
- Low-risk migration is currently blocked in the live repo: `drizzle-orm@0.44.7` does not export `drizzle-orm/zod`, and bumping Drizzle further caused package-level type errors around existing `relations` imports outside this bounded slice.
- Mobile now reads bearer-token request headers from `lib/auth/auth-headers.ts`; the legacy `lib/supabase/client.ts` file was removed after confirming no live app imports remained and updating the stale verify test.
- Focused verification for this slice: `pnpm run test:jest:file "verify.jest.test.tsx"` passed; `pnpm run check-types` is currently blocked by unrelated pre-existing mobile/api type errors (for example `app/(internal)/(standard)/activities-list.tsx` and `packages/api/src/infrastructure/repositories/drizzle-activity-analysis-repository.ts`).
- Additional Phase 2 progress: the composer Limits tab now routes editable CTL/recovery fields through a small RHF-owned `ConstraintsConfigSection`, and focused mobile typecheck plus `SinglePageForm.blockers.jest.test.tsx` pass with regression coverage for parent reset sync and projected CTL fallback semantics.
- Additional Phase 2 progress: the composer Tuning tab now routes `behaviorControlsV1` through a bounded RHF-owned `BehaviorControlsConfigSection`, and the reset wiring now targets behavior controls instead of unrelated hidden calibration state.
- Additional Phase 2 progress: the composer Availability tab now routes `planStartDate` plus weekly availability toggles through a bounded RHF-owned `AvailabilityConfigSection`, preserves the parent reset path, and marks availability provenance as user-owned for local edits.
- Additional Phase 2 progress: `TrainingPlanComposerScreen.metadata.jest.test.tsx` now asserts the user-visible mount-time validation chain through the rendered composer path, not just the `metadataForm.trigger()` call.
- Additional Phase 2 progress: `useAuth.ts` no longer calls the Better Auth client directly for delete-account or update-password; those operations now go through `apps/mobile/lib/auth/account-management.ts`, and optimistic onboarding/profile returns are preserved in the hook, though a focused hook regression test is still pending.
- Additional Phase 2 progress: `apps/mobile/lib/hooks/__tests__/useAuth.jest.test.tsx` now locks the optimistic onboarding/profile precedence behavior so stale query data cannot override optimistic local state again, and the auth adapter layer has direct delegation coverage in `apps/mobile/lib/auth/__tests__/account-management.jest.test.ts`.
- Package freshness audit results: the truly low-risk bump wave was narrower than the full outdated list. `react-hook-form`, `@tanstack/react-query`, and `@types/react` upgrades were attempted but rolled back after they exposed current repo compatibility gaps; Expo 55, navigation majors, Storybook 10, broad RN primitive waves, and Drizzle modernization remain deferred to dedicated upgrade slices.
