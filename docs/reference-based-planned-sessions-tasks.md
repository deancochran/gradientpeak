# Reference-based planned sessions and provider synchronization

## Approved direction and boundaries

Use the current dirty `dev` branch as the implementation baseline. Preserve existing work; do not stash, reset, make a cleanup commit, deploy, mutate a live provider, or destructively reset a database. Do not introduce multisport activity-plan authoring, a revision-history system, or a history system.

Planned sessions reference their current activity plans instead of storing immutable scheduled prescriptions. Future session reads and provider desired state follow plan edits. Keep lifecycle optimistic concurrency, owner/access checks, cancellation/completion semantics, and provenance. Recording execution is stable once started: captured execution evidence remains independent of later plan edits, and completed measurements never change when a plan changes. Historical linked-plan displays may reflect current definitions.

Garmin synchronization is one-way and on demand for upcoming referenced sessions; it is not whole-library mirroring. It requires connection, permission, generation, and compatibility fences. The rolling window has an explicit bounded product policy (14 days proposed), not a Garmin-imposed requirement. Sport-specific export extensions and incoming activity ingestion are separate scope.

## Tasks and todos

- [x] 1. Establish reference-based Core/API contracts and shared current-plan resolution; inventory all snapshot-dependent consumers and define compatibility during transition.
- [x] 2. Align DB schema, baseline SQL, validation and tests: replace required session snapshots with owner-safe activity-plan references; preserve lifecycle concurrency/provenance and prevent dangling plan deletion.
- [x] 3. Update direct/training-plan scheduling, repositories, idempotent creation and DTOs to persist references, not frozen prescriptions.
- [x] 4. Update calendar projections, planned-load calculations, completion candidates and manual completion to resolve current plans consistently.
- [x] 5. Update recording launch/submission and clients: current plan at start, stable execution payload thereafter; edits mid-recording must not invalidate legitimate submission.
- [x] 6. Support an explicit single-occurrence edit through plan duplication/repointing where existing UI/API supports editing; otherwise record the missing UI operation rather than silently editing all occurrences.
- [x] 7. Adapt Wahoo export and refresh triggers to current-plan resolution; protect against stale jobs and retain existing lifecycle guarantees.
- [x] 8. Integrate Garmin durable scheduled-workout delivery: workout/schedule remote IDs, permission/generation fences, partial successes, ambiguous-create recovery, date moves, cancellation and bounded reconciliation. Export only referenced eligible prescriptions; do not infer end-to-end support from the HTTP adapter.
- [x] 9. Add plan-edit propagation to eligible upcoming sessions/provider jobs with deduplication and stale-payload protection. Do not retarget started recordings or change recorded activity facts.
- [x] 10. Remove obsolete snapshot-authority paths after consumers migrated; retain nullable legacy-read provenance without making it current-plan authority, and align documentation and fixtures.
- [x] 11. Verify local DB invariants and Core/API/mobile/web/provider regressions; independently review concurrency, ownership, deletion, partial failures and recorded-execution stability. Report existing baseline failures separately.
- [x] 12. Record remaining operational work: protected webhook registration, live OAuth, Garmin delivery/device proof and sport-specific export gaps. No live operations are authorized by this task.

## Evidence required

Plan edits affect future session reads and provider desired state. Date moves do not duplicate workouts. Cancellation cannot be undone by an older job. Wrong-owner plans fail closed. Referenced-plan deletion has explicit safe behavior. Concurrent edits use lifecycle/desired-state fences, not a revision-history feature. A recording started before a plan edit can submit its original execution evidence. Duplicate scheduling remains idempotent despite mutable plan content. Garmin successful workout creation followed by schedule failure resumes safely; uncertain POST outcomes are not blindly retried.

## Consolidated implementation and evidence status

### Delivered local behavior

New planned-session writes are reference-only: `planned_sessions.activity_plan_id` is the non-null owner-safe `ON DELETE RESTRICT` reference. The former `activity_plan_revision`, `resolution_manifest`, and `prescription_captured_at` fields remain nullable legacy-read provenance for existing rows; they are all absent on new writes and are not current-plan authority. Their deletion is deliberately deferred because preserving existing data requires a separate procedure.

Calendar, effective-load, completion, provider projection, and recording launch resolve the referenced current plan. Recording launch always captures a fresh current-plan resolver output as recorder-owned execution evidence; it does not merge an old manifest. Submission validates the actor/session association and captured payload internal consistency, not a cryptographically attested server-launch receipt. A repoint after recording starts may cause an explicit association conflict; the captured execution is never silently retargeted or discarded.

The single-occurrence edit duplicates the current plan into a private owner copy and atomically repoints only a scheduled session with its lifecycle revision fence. Completed and cancelled sessions are not repointed. There is no durable active-recording marker: a still-scheduled session can be repointed after recording launch, producing an explicit association conflict on submission rather than silently retargeting captured evidence. Plan edits transactionally admit eligible future Wahoo and Garmin desired-state work; cancellation and newer desired state fence stale work. Wahoo and Garmin projection resolves current authorized plan content.

Garmin has a locally registered durable scheduled-workout runner for eligible run/bike sessions, with 14-day admission, permission and generation checks, workout/schedule remote links, projection hashes, leases, receipts before remote effects, bounded reconciliation, move and cancellation handling, and partial-success recovery. Unknown create effects are recovery-required and are never blindly replayed. Reconnect permits a new generation when old jobs are clean, but old pre-effect/recovery receipts remain an explicit recovery block and cannot authorize reuse or duplicate remote writes. No live Garmin request, device proof, OAuth roundtrip, protected webhook setup, or deployment has occurred.

### Current verification

All evidence below is local and used injected transports, synthetic/disposable fixtures, or disposable databases; no existing data-bearing database was upgraded, reset, or changed.

- Under Node 24.19.0, final root `pnpm check-types` passed: all 8 Turbo package checks and the strictness ratchet. `exactOptionalPropertyTypes` reports 3 current, 0 added diagnostics; `noUncheckedIndexedAccess` reports 0 current, 0 added. No baseline was widened. Strict API, UI, and web compilation also passed.
- Focused coordinator tests passed: API 170, web 73, shared worker loop 6, disposable planned-session/Wahoo 5, and disposable Garmin 21. Earlier relevant evidence remains Core 36 and mobile 16 passing; neither area received changes beyond formatting in the owned set.
- `SUPABASE_DB_SHADOW_PORT=25420 pnpm db:verify` passed in full under Node 24. The override used the official CLI shadow-port mechanism to avoid a local 54320 conflict; it stopped no stacks and changed no existing database.
- Bounded optional-property cleanup in native picker, native quantity, segmented-duration, and distance-catalog export passed 24 catalog-export, 201 UI web, and 232 UI native tests.
- Follow-up outstanding-issue cleanup passed the full `pnpm quality:agent:static` gate under Node 24.19.0: generated checks, formatting/lint, architecture/current contracts, typing and strictness, workspace/parity/tooling tests, and Knip. Non-failing existing warnings remain. No strictness baseline was widened. This is the static gate, not the broader `pnpm quality:agent` runtime/E2E profile.
- Follow-up fixes include real Garmin worker registration, restored mobile builder controls/session inspection, pending-session cancellation and working picker filters, root-step instruction rendering, authored target-index mapping, catalog consistency, and current disposable-DB fixtures. Independent review findings were repaired with regression coverage. Final Garmin and planned-session/Wahoo disposable suites passed again (21 and 5 tests).

### Task 11 and operational boundary

Task 11's local verification and independent review are complete. The full static gate and disposable DB verification passed; browser/device end-to-end and live-provider acceptance remain unverified. The broader changed-workspace `pnpm quality:agent` plan includes runtime/E2E work and was not executed. The matching schema is a prerequisite for reference-only inserts; any existing data-bearing database upgrade needs a separately approved preservation procedure.

Garmin release work remains outside this refactor: protected webhook sender registration and ingestion, account-holder-consented live OAuth, live Garmin Connect/device delivery proof, and sport-specific extensions such as swimming/strength. Provider workers with real credentials may perform writes when deliberately run; verification did not start a real worker.

## Local DB verification command

Use the temporary shadow-port override only for this local verification when port 54320 is occupied; do not make it permanent configuration:

```sh
SUPABASE_DB_SHADOW_PORT=25420 pnpm db:verify
```
