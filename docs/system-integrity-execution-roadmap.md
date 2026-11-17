# System integrity execution roadmap

## Outcome

Deliver the approved [System integrity and standards enforcement implementation plan](./projection-integrity-implementation-plan.md) in a risk-first sequence that produces visible user improvements early, establishes durable security and data boundaries before broad migration, and prevents the program from becoming an unbounded rewrite.

This roadmap assigns accountable ownership by role and package area. A named person must be recorded for every accountable role before that phase begins.

## Priority definitions

- **P0 — protect trust and data:** security, privacy, false user-facing facts, concurrency, abandoned external work, and the controls needed before other migration.
- **P1 — establish canonical truth:** activity, plan, Calendar, Home, route, goal, capability, and embedded-resource authorities.
- **P2 — prevent recurrence:** cache/offline/telemetry integrity, UI enforcement, package/runtime boundaries, and executed delivery checks.
- **P3 — simplify and retire debt:** clarify overlapping models and remove temporary adapters, dual contracts, and approved exceptions safely.

P3 is still required when it closes fixed inventory. Its lower priority reflects sequencing, not optional status.

## Ownership model

| Owner role | Accountable scope |
|---|---|
| Product decision owner | Dean; profile visibility, account deletion/retention promises, supported-client policy, user-facing provider failure behavior, and exceptional public behavior |
| Program delivery owner | Phase sequencing, finding ledger, dependency management, integration gates, and final reconciliation against this roadmap |
| Identity and security owner | `packages/auth`, session transport, recovery, trusted origins, OAuth/webhook ingress, credential policy, account closure security |
| API policy owner | Authorization, redaction, capabilities, public contracts, mutation protocol, application services, provider/storage operation receipts |
| Core domain owner | Transport-neutral fact contracts, calculations, date/time/unit semantics, readiness vocabulary, and deterministic policy rules |
| Database owner | Relational constraints, revisions, durable jobs/receipts, migrations, RLS/ACL, indexes, and live-database proof |
| UI system owner | `packages/ui`, canonical presentation contracts, form/state/accessibility primitives, UI resource registry, and exception policy |
| Web owner | Web routes, web presentation adapters, Playwright journeys, and web-specific runtime validation |
| Mobile owner | Mobile screens, offline/session lifecycle, secure persistence, native accessibility, and Maestro journeys |
| Provider and storage owner | Integration adapters, generations, jobs, remote-effect reconciliation, artifacts, storage cleanup, and external-fetch safety |
| Observability owner | Cache/telemetry dependency policy, safe correlation, sanitization, sampling, retention, and leakage tests |
| Tooling and CI owner | Architecture checks, package exports, runtime-boundary coverage, generated artifacts, changed verification, CI matrix, and standards reporting |

The API is the sole owner of whether an action is permitted. UI owners decide only how an API-supplied capability is presented.

## Phase summary

| Phase | Priority | Primary accountable owner | User-visible outcome | Depends on |
|---|---|---|---|---|
| 0. Stabilize the starting point | P0 | Program delivery owner | Work can be reviewed without mixing unrelated changes | None |
| 1. Install the standards control plane | P0 | Tooling and CI owner | New work stops introducing unowned bypasses | Phase 0 |
| 2A. Secure trust and identity boundaries | P0 | Identity and security owner | Sessions, providers, public data, and closure paths have enforceable protection | Phase 1 |
| 2B. Repair immediate falsehoods | P0 | API policy owner | Users stop seeing false zeroes, wrong dates/goals/policies, misleading actions, and unsafe public metadata | Phase 1; policy decisions where noted |
| 3. Make mutations and external work recoverable | P0 | API policy owner | Concurrent edits are safe; provider/storage failures are visible and recoverable | Phases 1 and 2A |
| 4. Establish activity and planned-work truth | P1 | API policy owner | Detail, Feed, Calendar, Plan, and Home agree about completed and planned work | Phases 1–2; Phase 3 for migrated writes |
| 5. Complete secondary fact authorities | P1 | Core domain owner | Routes, goals, capabilities, engagement, and embedded resources agree across surfaces | Phase 4 |
| 6. Make cache, offline, and telemetry identity-safe | P2 | Observability owner | Refreshes are dependable and account changes cannot expose retained private data | Phases 2A, 3, and relevant Phase 4/5 facts |
| 7. Make UI standards contractual | P2 | UI system owner | Web and mobile use consistent cards, formats, states, forms, actions, and accessibility | Phases 2B, 4, and 5 |
| 8. Enforce architecture and delivery confidence | P2 | Tooling and CI owner | Future changes cannot quietly bypass standards; critical journeys execute | Phases 1–7 incrementally |
| 9. Clarify models and remove compatibility debt | P3 | Core domain owner | Readiness language is clear and temporary paths do not become permanent | Phases 4–8 |

## Phase 0: stabilize the starting point

**Priority:** P0
**Primary owner:** Program delivery owner
**Supporting owners:** Every package owner with pending changes

### Work

1. Reconcile the current heavily modified dev checkout.
2. Integrate intentional existing work, assign it to a named owner, or isolate it in a clean task worktree.
3. Record the exact base commit and supported contract epoch for roadmap execution.
4. Preserve unrelated work; do not normalize the checkout by discarding unknown changes.

### Acceptance criteria

- Every modified or untracked path has an owner and disposition.
- Each execution task can start from a known base in one clean writable worktree.
- No roadmap task needs to edit or test a different checkout from the one it owns.
- Existing targeted checks are captured before behavioral changes begin.

## Phase 1: install the standards control plane

**Priority:** P0
**Primary owner:** Tooling and CI owner
**Supporting owners:** API policy, Identity/security, Core, UI system, Database

### Work

1. Create the machine-readable finding ledger from the immutable audit IDs.
2. Assign owner, severity, evidence, target phase, target release/date, acceptance test, and closure evidence to every finding.
3. Add the read-only standards report and typed authority, policy, projection, mutation, UI-resource, dependency, and verification registrations.
4. Land minimum blocking checks:
   - no new client-capable database imports;
   - no new package-internal export bypasses;
   - authorization/redaction registration for touched protected procedures;
   - named input/output parsers for touched public boundaries;
   - owner, approver, reason, exact scope, expiry, target removal release, and replacement for unsafe/UI exceptions.
5. Establish canonical database-backed fixtures and failing regression tests for the fixed inventory.
6. Record the supported web/mobile contract policy and offline-client behavior, including the current web deployment, minimum mobile version/contract epoch, owner, sunset date, dual-contract window, incompatible offline-client behavior, queue/persisted-state migration, and rollback criteria.

### Acceptance criteria

- All finding IDs in the closure map have named owners and executable acceptance tests.
- No fixed finding is silently bundled into optional modernization.
- New unregistered protected procedures, public contracts, unsafe exceptions, and client DB imports fail checks.
- Every confirmed defect has failing or preserved regression evidence before its behavior changes.
- Breaking contracts have a server-first compatibility and rollback plan.
- Contract retirement cannot occur until the registered minimum version and sunset pass, compatibility tests succeed, offline/persisted-state migration is proven, and rollback review is recorded.
- The standards report is reproducible and cannot silently increase its baseline.
- Exceptions may be renewed once. Any exception increasing security, privacy, public-contract, or data-integrity risk requires explicit Product decision owner and relevant security/API owner approval before use.

## Phase 2A: secure trust and identity boundaries

**Priority:** P0
**Primary owner:** Identity and security owner
**Supporting owners:** API policy, Provider/storage, Database, Mobile, Web

### Work

1. Land the Slice S0 trusted-origin, CSRF, session transport, secure mobile credential storage, recovery-token, and provider-encryption policies.
2. Fence OAuth callbacks, webhook receipts, token refresh, reconnects, and delayed jobs by user/integration generation.
3. Register resource authorization, visibility, redaction, capability, and not-found masking policies for the known affected resources: profiles, social search, public shares, Feed, Groups and Group Events, organizations/delegated athletes, Activities, Activity Plans, Training Plans, Routes, Goals, and Calendar projections.
4. Register the public-share field classification and sensitive-metadata policy used by the Phase 2B correction.
5. Define account closure terminology, recent re-authentication, immediate revocation/write blocking, data disposition, retention, provider cleanup, and reconciliation behavior.
6. Add safe external-feed fetching and provider response parsing.

### Acceptance criteria

- Cross-site writes, untrusted origins, credential leakage, reset-token replay, recovery enumeration, OAuth/webhook replay, and stale integration generations are rejected.
- Unauthorized viewers do not trigger sensitive loaders and protected fields are absent.
- Provider credentials remain encrypted, rotatable, redacted, and generation-fenced.
- Closure cannot claim completion while required cleanup remains unowned or unresolved.
- Every known affected resource listed above has a registered policy and owner/follower/member/delegated/public/denied viewer-matrix test as applicable.

### Decision gates

Dean approves before closure implementation advances:

- the account deletion, anonymization, retention, and backup promise;
- the public-share disposition after closure;
- the intended default profile visibility;
- the minimum supported mobile contract policy.

## Phase 2B: repair immediate falsehoods

**Priority:** P0
**Primary owner:** API policy owner
**Supporting owners:** Web, Mobile, UI system, Core, Database

This phase may run in parallel with Phase 2A where files and policies do not overlap. Privacy-sensitive changes wait for the relevant 2A policy.

### Work

1. Preserve unavailable Planning Ledger intensity and duration instead of rendering zero.
2. Load or explicitly mark activity comment-count availability.
3. Select the next active goal rather than an expired goal.
4. Filter group-event eligibility before pagination.
5. Preserve `request_to_join` as a distinct group policy.
6. Honor API-supplied activity capabilities.
7. Format group events in their event timezone.
8. Route mobile activity-detail measurements through preferred-unit formatters.
9. Correct static/interactive resource-card accessibility semantics.
10. Replace misleading profile placeholders with an honest state or bounded canonical data connection.
11. Apply one approved profile-default visibility policy.
12. Remove unapproved user-provided artifact filenames from public responses and add leakage tests.

### Acceptance criteria

- No unknown or unavailable value in scope appears as zero.
- Comment summaries and comment content agree.
- Past goals are never labeled as the next goal.
- Eligible group events are not skipped by page-window filtering.
- Group policies, dates, units, actions, profile visibility, and card roles agree with registered contracts.
- Error, empty, unavailable, private, and not-yet-implemented states remain distinct.
- Public responses contain no unapproved user-provided artifact filenames.

## Phase 3: make mutations and external work recoverable

**Priority:** P0
**Primary owner:** API policy owner
**Supporting owners:** Database, Identity/security, Provider/storage, Core

### Work

Migrate in this order:

1. Goal updates.
2. Group and group-event policy/update paths.
3. Activity-plan updates and provider publication.
4. Profile and settings writes.
5. Training-plan revisioned writes.
6. Route upload/deletion and artifact cleanup.
7. Account closure/deletion and provider disconnection.

Every migrated mutation declares authorization, expected revision, idempotency, transaction, changed facts, durable follow-up, generation fence, retry classification, terminal states, reconciliation, and client receipt.

### Acceptance criteria

- Stale goal and group-event writes are rejected or intentionally merged by a documented rule.
- A locally saved plan cannot silently lose required provider publication work.
- Older jobs cannot publish, delete, or reconnect after a newer revision/generation wins.
- At-least-once provider/storage execution converges safely after ambiguous or duplicate attempts.
- Every pending operation has a worker/lease owner, retry behavior, terminal failure, and reconciliation path.
- Account closure can be interrupted and resumed without restoring revoked access or abandoning cleanup.
- Required persistence changes follow expand, bounded backfill, validation/soak, and later contract sequencing.
- Before each persistence migration, the Database owner records the compatibility period, batch/rate limit, expected and completed row counts, validation queries, maximum acceptable error rate, rollback trigger, and proof that no supported client or worker requires the old shape before contraction.

## Phase 4: establish activity and planned-work truth

**Priority:** P1
**Primary owner:** API policy owner
**Supporting owners:** Core, Database, Web, Mobile

### Workstreams

#### 4A. Completed activity authority

- Before consumer migration, API and Database owners register fixed numeric query budgets for each requested fact-family set using the 1, 20, and 100-ID fixtures. Budget changes require recorded evidence, justification, and review.
- Introduce authorization-scoped, batched activity fact families.
- Migrate activity list and detail first.
- Migrate Feed while retaining its visibility selector and cursor ordering.
- Remove Feed-owned metric/capability construction.

#### 4B. Planned-work authority

- Bind plan structure/revision, authored values, estimates, personalization revision, schedule state, and linked completion replacement.
- Preserve observed completion and planned estimate as separate fact classes.

#### 4C. Calendar cutover

- Migrate completed and planned Calendar paths together.
- Hydrate linked completions outside the calendar date range.
- Preserve multisport composition, timing coverage, quantification, route state, and truncation.

#### 4D. Home alignment

- Move visible schedule facts onto effective Plan composition.
- Preserve planned-distance status and provenance.
- Keep unrelated Home analytics outside this bounded migration.

### Acceptance criteria

- One stored activity has matching shared values, status, reason, provenance, freshness, composition, engagement, and capabilities across Detail, list, Feed, Calendar, and applicable Home output.
- One plan revision has matching duration, distance, Load, Intensity, status, provenance, and freshness across plan detail, Plan, Calendar, Planning Ledger, and Home.
- Equality tests use the same resource, viewer authorization class, planning/event timezone, unit preference, source/analysis revision, and `asOf` watermark. Any intentional surface reduction is registered explicitly.
- Missing completion observations never fall back to plan estimates.
- Calendar and Plan sheets show recorded validated Load and Intensity whenever Detail can show them for the same viewer and revision.
- Batch tests for 1, 20, and 100 IDs stay within declared query budgets and preserve stable order/cursors.
- Unauthorized viewers never load or receive owner-only facts.

## Phase 5: complete secondary fact authorities

**Priority:** P1
**Primary owner:** Core domain owner
**Supporting owners:** API policy, UI system, Web, Mobile

### Work

1. Define route usability from accepted route evidence rather than stored polyline alone.
2. Carry safe processing/current/stale/failed/unavailable analysis lifecycle into summaries.
3. Centralize engagement counts and action capabilities.
4. Reuse one goal status/next-goal selector across surfaces.
5. Replace associated-resource labels and one-off summaries with registered compact canonical resources.
6. Preserve privacy-safe reasons for unavailable facts.

### Acceptance criteria

- Card and Detail agree whether a route is usable, including GPS records without a stored polyline.
- Processing, stale, failed, and unavailable states do not collapse into one generic absence.
- Counts are authoritative or explicitly unavailable; missing enrichment is not zero.
- Web and mobile render the same supplied capabilities.
- Embedded Activity Plans, Routes, Groups, Activities, and Goals preserve identity, access, and navigation.

## Phase 6: make cache, offline, and telemetry identity-safe

**Priority:** P2
**Primary owner:** Observability owner
**Supporting owners:** API policy, Web, Mobile, Identity/security

### Work

1. Complete semantic query dependencies and mutation changed-fact declarations.
2. Derive invalidation receipts while retaining broad fallback behavior during comparison.
3. Partition private cache data by identity/session and authorization scope.
4. Clear or quarantine cache and pending work on sign-out, revocation, account switch, permission loss, and closure.
5. Register offline data classes with identity binding, sensitivity, retention, encryption/storage, expiry, and cleanup rules.
6. Give offline operations durable identity, ordering, revision conflict behavior, and ambiguous-receipt recovery.
7. Standardize privacy-safe correlation and telemetry allowlists, sanitization, sampling, retention, and deletion.

### Acceptance criteria

- Every fact-bearing query and mutation has dependency ownership.
- Activity ingestion/analysis refreshes every registered dependent surface.
- Account/session changes cannot expose another identity's cached or offline data.
- Offline retry preserves intent order, rejects stale revisions, and does not duplicate local intent.
- Telemetry rejects secrets, raw provider errors, filenames, sensitive URLs, coordinates, bodies, and disallowed identifiers on API, web, and mobile.
- Broad invalidation is removed only after generated behavior proves equivalent or safer.

## Phase 7: make UI standards contractual

**Priority:** P2
**Primary owner:** UI system owner
**Supporting owners:** Web, Mobile, Core, API policy

### Work

1. Register canonical Activity, Activity Plan, Training Plan, Group, Group Event, Route, Profile, and Goal presentations.
2. Require typed presentation contracts and API-supplied capabilities.
3. Consolidate the duplicated web Training Plan card.
4. Standardize locale/timezone/unit/precision presentation contexts.
5. Standardize initial loading, refresh, error, retained-data error, empty, not found, inaccessible, partial, offline, re-authentication, conflict, queued, and processing states.
6. Standardize semantic forms and exception rules for specialized raw controls.
7. Enforce static versus interactive card semantics, keyboard/focus behavior, target size, nested actions, and live announcements.
8. Add owned, expiring UI exceptions.

### Acceptance criteria

- The same fixture produces matching identity, metric order, status, timezone, units, actions, navigation, accessible name, and role across web and mobile.
- Fixture parity uses the same resource, viewer authorization class, planning/event timezone, unit preference, source/analysis revision, and `asOf` watermark; intentional reductions are registered rather than ignored.
- DST gaps, ambiguous wall times, cross-midnight events, date-only values, and device-timezone changes are covered.
- Error never renders as empty; refresh error preserves retained data.
- Focus is preserved/restored appropriately and dynamic state changes are announced.
- New resource-card, formatter, form, action, or raw-control bypasses fail checks without an approved exception.

## Phase 8: enforce architecture and delivery confidence

**Priority:** P2
**Primary owner:** Tooling and CI owner
**Supporting owners:** All package owners

### Work

1. Complete path-sensitive web-client, web-server, mobile, API, Core, DB, and UI dependency contexts.
2. Close fixed package-export, source-alias, direct DB, and loose runtime-contract findings.
3. Keep routers thin by moving remaining in-scope orchestration to application services.
4. Enforce generated-route/artifact freshness and package export resolution.
5. Make changed-file verification strict and couple DB-sensitive changes to guarded DB verification.
6. Execute—not merely parse—critical Playwright and Maestro journeys:
   - account closure interruption, retry, cancellation where allowed, and completion;
   - group join-policy display and stale group/group-event update rejection;
   - activity-plan publication success, retryable failure, and terminal failure;
   - activity visibility and public sharing without sensitive metadata leakage;
   - recording/import through analysis publication and Calendar/Plan refresh;
   - Calendar/Plan planned, completed, partial, processing, and unavailable states;
   - timezone and preferred-unit parity.
7. Publish standards coverage and debt movement in CI.

### Acceptance criteria

- New client-capable code cannot import DB/server-only modules.
- Every intended package export resolves for its platform condition.
- New public or persisted boundaries cannot use unvalidated unknown shapes.
- Every changed production path has an executable verification owner.
- New unsafe debt requires an owner, reason, scope, expiry, and removal target.
- Required web/mobile critical journeys run in the appropriate CI lane.
- Pull requests execute the bounded risk-based smoke subset; integration branches execute the full critical-journey matrix with runtime evidence.
- Baselines cannot increase silently.

## Phase 9: clarify models and remove compatibility debt

**Priority:** P3
**Primary owner:** Core domain owner
**Supporting owners:** API policy, Product decision owner, Tooling and CI

### Work

1. Distinguish athlete-state, training forecast, and goal-readiness identities, scales, horizons, revisions, and intended surfaces.
2. Choose one authority where models claim to answer the same question.
3. Remove unused fallback calculations after proving they have no production consumer.
4. Remove legacy projection producers, dual contracts, broad invalidation, queue formats, and exceptions only after the registered minimum client version and sunset date pass, compatibility tests succeed, persisted/offline-state migration is proven, and rollback review is recorded.

### Acceptance criteria

- Different readiness meanings do not share one unexplained label.
- Equality is tested where surfaces show the same fact; intentional differences are contractually explicit.
- No supported client or offline queue depends on a removed contract.
- Every removed exception has replacement proof and no successor exception silently recreates it.

## Finding closure map

| Findings | Closing phase |
|---|---|
| DATA-02, DATA-03, DATA-05, DATA-06, DATA-07 | Phase 2B |
| PRIV-01 | Public-share policy registration in Phase 2A; filename correction, leakage proof, and closure in Phase 2B |
| PRIV-02 | Profile-default decision/registration in Phase 2A; schema/provisioning/onboarding correction and closure in Phase 2B |
| MUT-01, MUT-02, MUT-03, MUT-04 | Phase 3 |
| LIFE-01, LIFE-02 | Phase 3; security prerequisites in Phase 2A |
| DATA-01, DATA-08, DATA-09 | Phase 4 |
| DATA-04 | Begins Phase 4, closes Phase 5 |
| AUTH-01 | Prevention in Phases 1–2A; closes in Phase 8 only after every known affected resource has policy/viewer-matrix evidence and recurrence checks are enforced |
| UI-02, UI-03, UI-05, UI-08, UI-09, UI-11 | User correction Phase 2B; enforcement Phase 7 |
| UI-04, UI-10 | Begins Phase 5, enforcement closes Phase 7 |
| UI-01, UI-06, UI-07 | Phase 7 |
| CACHE-01, OFFLINE-01 | Phase 6 |
| ARCH-04 | Begins Phase 4, closes Phase 8 |
| ARCH-01, ARCH-02, ARCH-03 | Prevention Phase 1; fixed inventory closes Phase 8 |
| TOOL-01 | Ledger/prevention Phase 1; enforcement closes Phase 8 |
| TOOL-02 | Phase 8 |

No finding is complete merely because a shared abstraction exists. Closure requires its acceptance test, user-visible reconciliation where applicable, and evidence recorded in the ledger.

## Safe parallel execution

After Phase 0, use separate clean worktrees and non-overlapping ownership for parallel writable lanes.

### Safe early lanes

1. **Tooling/evidence:** standards ledger, report, registry schemas/enumeration, minimum checks, and fixture-harness skeleton.
2. **Identity/security:** session, recovery, OAuth/webhook, credential, closure policy foundations.
3. **Immediate experience:** ledger, goals, groups, timezone, unit, card semantics, honest profile state.
4. **Fact-contract design:** begins only after the Phase 1 registry interfaces and fixture-harness skeleton are stable; owns transport-neutral activity/plan facts and domain fixture contents without changing registry schemas/enumeration.

### Dependency restrictions

- Provider/account lifecycle implementation waits for Phase 2A security foundations.
- Calendar consumer migration waits for both completed-activity and planned-work authorities.
- UI cards do not invent capabilities while API capability ownership is moving.
- Cache fallback removal waits for dependency comparison proof.
- Contract/adapter removal waits for the supported-client sunset gate.
- No concurrent lane independently owns activity facts, plan facts, authorization policy, mutation receipts, cache tags, or canonical resource registrations.
- Only the tooling/evidence lane may change registration schemas, registry enumeration, or the canonical fixture-harness structure during Phase 1. Exact owned paths must be assigned before parallel work starts.

## Program milestones

### Milestone A — controlled starting point

Phases 0–1 complete. All findings have owners and tests; new violations are blocked.

### Milestone B — immediate trust restored

Phases 2A–3 complete. False values and policies are corrected; sessions/providers are protected; stale writes and abandoned external work are addressed.

### Milestone C — canonical training truth

Phases 4–5 complete. Detail, Feed, Calendar, Plan, Home, routes, goals, and embedded resources agree on shared facts.

### Milestone D — standards enforced across clients

Phases 6–8 complete. Cache/offline/telemetry identity safety, UI contracts, architecture boundaries, and executed critical journeys prevent recurrence.

### Milestone E — temporary debt retired

Phase 9 complete. Readiness vocabulary is explicit and supported-client-safe compatibility paths are removed.

## Phase reporting

At each phase boundary, report:

- findings closed, still open, newly discovered security issues, and optional modernization separately;
- user-visible behavior delivered;
- acceptance evidence and verification status;
- public/mobile contract compatibility state;
- migrations, fallbacks, and exceptions still active;
- one concrete blocker if the exit gate is not met.

Implementation remains local by default. Commit, push, merge, release, deploy, production mutation, and destructive lifecycle testing require the authority applicable to that action.
