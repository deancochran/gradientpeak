# E2E-led product delivery checklist

This is the accepted delivery checklist for building the behavior represented by
the existing web Playwright and mobile Maestro suites. A check is complete only
when the named user outcome passes at its real boundary. Static contracts,
syntax, and type checks support that proof but do not replace it.

## Delivery rules

- Start each item by running its focused test and preserving its meaningful
  failure. Implement the smallest correct behavior, then rerun the same test.
- Do not make a test pass by skipping it, weakening a persistence/reopen
  assertion, or resetting shared data.
- Playwright proof uses the local database and browser. Maestro proof uses an
  E2E-enabled installed client, Metro, and a device or emulator.
- Mobile primary variations require a unique fixture run, a runtime pass, and
  scoped cleanup proof before they count as green.
- Provider OAuth and physical GPS, BLE, FTMS, system-picker, and other hardware
  behavior stay explicitly environment-bound. They are never represented as a
  false local pass.

## Priority 0 — baseline and trust-critical journeys

- [x] **Protect the starting point.** Record the active working-tree changes;
  do not overwrite unrelated work.
- [x] **Web baseline.** Run P0 Playwright specs one at a time and classify each
  result as product gap, test/fixture issue, or environment blocker.
- [x] **Mobile static baseline.** Pass fixture-contract and flow syntax checks.
- [ ] **Mobile runtime baseline.** Run the maintained smoke flows on a real
  E2E device environment.
- [ ] **Mobile fixture service.** Provide local-only, run-scoped provisioning
  and exact cleanup so primary mobile variations can execute safely.
- [ ] **Auth and recovery.** Sign in, sign out, protected entry, recovery, and
  session restoration retain the expected state after relaunch/reload.
- [ ] **Recording lifecycle.** Start, pause, resume, finish, review, submit,
  retry failed submission, and discard behave correctly and retain/recover
  state where the journey requires it.
- [ ] **Routes and data recovery.** Attach a route to a recording and calendar
  event; deletion and recovery behavior persist after reopening.
- [ ] **Privacy and sharing.** Visibility changes and public activity, activity
  plan, and training plan links enforce the intended access after reload.
- [ ] **P0 integration check.** Run focused web and mobile proofs for changed
  P0 journeys, then the relevant package/static checks.

## Priority 1 — planning and activity completion

- [ ] Activities and imports, including processing and deletion safety.
- [ ] Activity plans and training plans: create, schedule, duplicate, remove,
  and persistence after reopening.
- [ ] Calendar and day agenda: event lifecycle, visibility, series overrides,
  and inaccessible-event fallback.
- [ ] Goals, preferences, and synchronization.
- [ ] P1 domain regression pass.

## Priority 2 — social, discovery, and communication

- [ ] Profiles and social relationships.
- [ ] Groups, membership, events, and access rules.
- [ ] Feed and discovery.
- [ ] Messaging search, conversations, and request handling.
- [ ] Notification unread/all filters and read state.
- [ ] P2 domain regression pass.

## Priority 3 — onboarding and product polish

- [ ] Onboarding people and group selection/completion.
- [ ] Settings, coaching, shell navigation, responsive behavior, and keyboard
  paths.
- [ ] P3 domain regression pass.

## Final evidence

- [ ] Web Playwright suite passes in its required projects, with serial shared
  database execution until parallel isolation is repeatedly proven.
- [ ] Mobile smoke journeys pass on a real device/emulator.
- [ ] Each supported mobile primary variation has a matching runtime PASS and
  CLEAN receipt.
- [ ] The intentional-red mobile count is zero, or any remaining item has a
  newly accepted product decision explaining why it is excluded.
- [ ] Broad static integration checks pass without hiding runtime failures.

## Current baseline evidence

- Web P0 baseline, Desktop Chrome: 3 journeys passed and 6 failed. The focused
  sign-in/reload/sign-out journey is now green. Route-preview handoff is green;
  carrying its route into the persisted recording and saved activity remains a
  product gap.
- Mobile static baseline: 22 fixture-contract tests and all maintained Maestro
  syntax checks passed. Mobile smoke runtime is blocked because the launched
  dev client never reaches the sign-in screen; no supported mobile flow has
  runtime proof yet.
