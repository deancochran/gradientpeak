# Core acceptance status — 2026-10-29

Final closeout (2026-10-30): native-to-web run
`acceptance-3646355-1793323603575` passed in 5.6 minutes after independent-review
corrections. `pnpm quality:agent` subsequently passed on Node 24.19.0 (private
shell record `sh_18a716ce6001HjVlXXs8HY8B5q`); warnings remain non-blocking.
See `docs/disposable-acceptance.md` for exact evidence and limits: one explicit
UI retry proves in-process recovery, not app-kill recovery. Task-owned emulator
stopped; preserved data, preview installation, and unrelated edits retained.
Changes are local/uncommitted, not a release or live-provider signoff.

The five one-off preservation-operation scripts have been archived byte-for-byte
under `~/.local/share/opencode/core-acceptance-rehearsal-20261029/operational-source/`
with private permissions. They are historical operational evidence, not supported
product modules or repeatable migrations. Removing their temporary checkout copies
does not remove backups, verification records, or alter architecture policy.

## Verified historical evidence

- Local E2E preservation cutover: exact managed schema matched the reference; all 117 table digests unchanged at cutover. Protected backup and successful cutover record retained under the user's local OpenCode data directory. No normal-development or production cutover.
- Browser run `core-reviewed-20261029`: three Desktop Chrome tests passed in 55.2 seconds, including connected no-metric onboarding, scheduling/move/cancel, offline repeated-save/retry, lost-response manual completion retry, GPX replacement, reopened calendar/detail/projection agreement, immutable recording-start plan, and one persisted partial recording despite double-save.
- Persisted RPE was verified independently of absent threshold evidence and unavailable Common Load. Numeric UI-summary correctness and live providers were not established.
- Scoped Biome, diff whitespace checks, and web TypeScript check passed after the strengthened browser tests.
- Original current development APK built and installed alongside the preserved preview app; E2E sign-in launched. This is not full native journey evidence.

## Exact failed-fixture recovery

Read-only inspection confirmed the two failed connected-run accounts were already absent. The older diagnostic fixture remained with its expected 22 seeded library plans, no activities/sessions/artifacts/groups/organization memberships, and one authored comment plus one like.

A first exact-user cleanup transaction failed on the comment FK and rolled back. Read-only inspection checked the other restrictive profile/user dependencies. A second guarded transaction removed only that exact fixture's comment, like, and user (with fixture identity, creation timestamp, expected seed names, and dependency/count guards). Cascading fixture-owned seed cleanup completed.

Post-cleanup verification across all three known failed actor IDs: zero users, activities, planned sessions, or activity plans. No database reset or broad cleanup was performed.

## Ownership and candidate limitation

Another active session owns ongoing native acceptance, private-cache Metro preparation, and disposable-runner cleanup changes in the same development checkout. Do not manipulate its emulator, processes, or owned source paths concurrently.

The checkout and APK have changed since the passing runs. HEAD alone (`2a0f32794c78c606c2f2c24d1ea29c3b8b400911`) cannot identify this dirty candidate. A retrospective whole-tree fingerprint cannot honestly identify the earlier tested source. Capture a stable content manifest before the final coordinated verification run.

Our old web server on 3001, Metro on 8082, and rehearsal container are stopped. Rehearsal container and backups are retained; emulator, other lane, and Supabase services were left intact.

## Current native-candidate evidence

- The later disposable full-native run `acceptance-3594613-1793322494271` passed
  `e2e/native/current-candidate.spec.ts` in 5.6 minutes on the designated
  `emulator-5554`. It covers native onboarding, UI-authored executable plan,
  schedule, manual completion, timer-backed recording, retained offline save,
  one retry, manual-to-recorded replacement, native reopened activity summary,
  cross-month reschedule, and cancellation. The Android previous-month control
  completed before the final-day selection. It also checks the corresponding
  disposable DB state after each durable transition.
- The browser portions reopen exact activity IDs in detail, history, calendar,
  and plan-summary read surfaces. The superseded manual completion is absent
  from active history/calendar/projection entries. For the no-threshold actor,
  Common Load remains explicitly unavailable; no numeric threshold claim is
  made.
- Before the run, HEAD was `2a0f32794c78c606c2f2c24d1ea29c3b8b400911`; the
  private candidate manifest is
  `~/.local/share/opencode/current-candidate-20261030T010813Z.manifest`; and
  the debug APK SHA-256 was
  `551bdd98a20ea690b80041d50363b875e640443105778d320689685716ff1233`.
  The manifest covers the dirty candidate/task sources; the development-client
  APK is a shell while the test loads JavaScript from its run-owned Metro.
- This evidence remains a disposable synthetic-account result. It does not
  establish live providers, numeric Common Load, real-device coverage, or a
  release signoff.

## Remaining acceptance gate

1. Establish a single owner for full native acceptance and collect its actual device-runtime evidence.
2. When concurrent edits settle, capture source content and APK identities and rerun affected acceptance checks against that exact candidate.
3. Consolidate final limitations and update the durable plan; no release signoff follows from historical browser evidence alone.

No commit, push, deployment, live-provider operation, or backup deletion is authorized by this work.
