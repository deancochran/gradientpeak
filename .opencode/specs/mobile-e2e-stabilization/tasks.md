# Tasks

## Coordination Notes

- The coordinator owns delegation, fan-in, and repo-memory updates.
- Reproduction, log reading, code changes, Maestro edits, and reruns should be delegated when practical.
- After each failed run, capture the exact failing boundary before issuing the next fix task.

## Open

### Phase 1 - Reproduce And Triage

- [x] Run delegated `pnpm run test:e2e` reproduction and capture the first concrete failure.
- [x] Read the relevant Maestro and script logs through delegated analysis.

### Phase 2 - Targeted Fix

- [x] Apply the smallest code or Maestro change needed for the current blocker.
- [ ] Resolve the current external environment blocker: local Supabase auth is unreachable from the mobile E2E runtime, so authenticated flows stop on `The authentication service is not responding` before app navigation.

### Phase 3 - Verify And Iterate

- [ ] Re-run delegated `pnpm run test:e2e` after each fix until it passes or an external blocker remains.
- [x] Batch-ran all non-reusable Maestro flows one by one; `auth_navigation` and `sign_in_invalid_spam_guard` passed, while the remaining flows were blocked first by stale hardcoded fixture defaults, then by the external auth-service outage.

## Pending Validation

- [ ] `pnpm run test:e2e` after local Supabase/Docker health is restored.

## Completed Summary

- Active spec created to drive delegated reproduction, triage, repair, and rerun loops for the slim mobile E2E workflow.
- Maestro catalog cleanup landed for broader interaction coverage: catalog drift was corrected, own-profile navigation gained a reusable helper, and draft coverage flows/selectors were added for account settings, integrations, routes, and training-plan creation surfaces.
- Added recorder route-navigation selectors plus stronger scaffold flows for recurring calendar reschedule scope prompts and route-based recording starts; also added a continue-without-metrics recorder scaffold with explicit fixture expectations.
- Ran 62 non-reusable mobile Maestro flows sequentially; only `apps/mobile/.maestro/flows/main/auth_navigation.yaml` and `apps/mobile/.maestro/flows/journeys/resilience/sign_in_invalid_spam_guard.yaml` passed in the current environment.
- Fixed stale Maestro flow defaults to use the seeded fixture accounts again, repaired the YAML parse error in `apps/mobile/.maestro/flows/journeys/plans/goal_entry_open.yaml`, and made `apps/mobile/.maestro/flows/reusable/login.yaml` recover from sign-up and forgot-password screens before attempting sign-in.
