# System integrity and standards enforcement implementation plan

## Goal

GradientPeak must enforce its product, data, privacy, interaction, and lifecycle standards by construction rather than relying on each developer or screen to remember them.

Every surface that presents the same activity, plan, goal, route, engagement count, capability, athlete-state fact, permission, schedule, or operation state must agree on its value, availability, provenance, freshness, and policy meaning. Every state-changing operation must follow one explicit authorization, concurrency, idempotency, follow-up, and recovery protocol appropriate to its risk.

The implementation will establish one authority for each semantic fact and cross-cutting policy, then allow purpose-built API projections and UI presentations for Detail, Calendar, Plan, Home, Feed, lists, embedded cards, forms, and background operations. It will not create one universal response object, one mega-service, or require every surface to display every fact.

The first user-visible outcomes are trustworthy Calendar and Plan data, no false zeroes or counts, correct group and goal state, safe concurrent edits, honest provider synchronization, consistent timezone/unit presentation, and UI actions that match actual permissions and capabilities.

## Program scope and adoption rule

This is a bounded standards-enforcement program, not an open-ended rewrite.

- Repair every confirmed issue in the fixed inventory in this document.
- New code and every touched path must comply with the applicable standards immediately.
- Untouched legacy code migrates only when it is in the fixed inventory, is adjacent to active work, or violates a security/privacy boundary.
- Each standard must have one executable enforcement mechanism: a type, parser, policy boundary, architecture rule, generated registry, contract test, integration test, or runtime check.
- Written guidance remains useful context, but a critical standard is not complete until bypassing it causes a failing check or an explicit, expiring exception.
- The standards inventory can grow during Slice 0 discovery, but each addition must include evidence, owner, severity, acceptance criteria, and a bounded migration target.
- Every finding receives an immutable ID, evidence link, owner, implementation slice, acceptance test, and target release or date.
- Newly discovered security/privacy issues and directly adjacent correctness defects can block affected work. Optional modernization does not block unrelated delivery.
- Fixed inventory, newly discovered security issues, and optional modernization are reported separately so the program cannot silently expand.
- Completion is measured by named inventory coverage and prevention of new violations, not by making every historical file stylistically identical.

## System authority catalog

The program will name one owner for each authority category:

1. Identity, account, session, credential, and account-lifecycle facts.
2. Authorization, delegated access, visibility, consent, and redaction policy.
3. Activity identity, evidence, artifacts, composition, timing, route, and ingestion lifecycle.
4. Analysis, measurements, thresholds, RPE, provenance, revisions, and freshness.
5. Activity-plan and training-plan intent, revisions, estimates, and prescription snapshots.
6. Calendar events, planned sessions, completion linking, replacement, and reconciliation.
7. Athlete-derived state, daily load, readiness, performance targets, and publication lifecycle.
8. Provider connections, sync generations, jobs, webhooks, resource links, and delivery receipts.
9. Social visibility, follows, likes, comments, feed inclusion, notifications, and capabilities.
10. External storage upload, accepted artifact, deletion, retention, retry, and repair lifecycle.
11. Mutation authorization, optimistic revision, idempotency, transaction, outbox, changed facts, and client receipt.
12. UI presentation, formatting, accessibility, query state, forms, navigation, and canonical resource composition.
13. Cache dependency, freshness, offline recovery, telemetry, and operational observability policy.

Each catalog entry must identify its Core rules, API policy/application owner, repository boundary, public contract, UI presentation adapter, cache dependencies, and verification capsule.

## Guardrails

- Unknown, unavailable, private, processing, failed, and stale facts must never silently become zero, an empty string, an empty list, or a generic null.
- A projection may omit a fact it does not offer. If it offers the fact, it must return an explicit value state and reason.
- Planned estimates and completed observations remain distinct. Never substitute a planned estimate for a missing completion observation.
- Authorization is applied before private evidence is loaded or exposed.
- Shared UI components render authoritative facts; they do not fetch, infer, or recalculate them.
- Application services assemble semantic facts. Routers remain transport boundaries and repositories remain persistence boundaries.
- Batch loaders must avoid one query per resource and preserve the selecting surface's ordering and pagination.
- Existing broad cache invalidation remains as a safe fallback until fact dependencies are complete and verified.
- Public contract changes are additive by default. Breaking semantic changes require a new versioned API response, server support before client adoption, and an explicit rollback window.
- Authentication never substitutes for resource authorization. Protected reads and writes must obtain an approved authorization scope before loading private data.
- Public and viewer-specific DTOs are built through an allowlisted redaction policy; persistence rows never become accidental client contracts.
- State-changing operations declare concurrency, idempotency, transaction, durable follow-up, retry, changed-fact, and client-receipt behavior.
- Cross-system work involving providers or object storage has a durable owner and recoverable terminal state; a database commit cannot silently abandon required external work.
- Date-only values, instants, wall times, timezones, canonical measurements, and display measurements remain distinct through typed boundaries.
- UI actions consume explicit capabilities. Formatting, navigation, query states, and accessibility are not inferred independently by each surface.
- No database migration is assumed for projection-only work. When durable revisions, jobs, receipts, leases, uniqueness, retention, or lifecycle guarantees require persistence, use an explicit expand → bounded backfill → validate/soak → later-contract migration with compatibility and rollback proof.
- Begin implementation only after overlapping changes in the current dev worktree are integrated or isolated in a clean task worktree.

## Fixed current issue inventory

The initial program must resolve or explicitly disposition each confirmed issue below. “Disposition” means evidence that the behavior is intentional, a named authority and test protecting it, or a bounded repair task; it does not mean silently dropping the item.

### Data and policy correctness

- Calendar completed activities lose recorded quantification, multisport composition, and timing coverage.
- Planning Ledger renders unavailable planned intensity and duration as numeric zero.
- Activity detail can report zero comments when the count was not loaded.
- Cards and detail use different definitions of route availability.
- Web Plan can label a past goal as the next goal.
- Group-event paging filters declined events after the database window.
- Group reads serialize `request_to_join` as `invite_only`.
- Goals and group-event updates can overwrite concurrent edits without a revision fence.
- Activity-plan updates can commit locally while required provider synchronization fails without a durable follow-up owner.
- Home strips planned-distance status and provenance and uses schedule semantics that can diverge from effective Plan composition.
- Feed owns a separate activity metric/capability producer.

### Identity, privacy, and lifecycle

- Product-owned account closure/deletion, cancellation, retention, provider cleanup, and audit behavior are incomplete.
- Authorization is centralized in places but is not structurally mandatory for every protected repository/application read.
- Profile, social search, public share, feed, group, organization, and content visibility use multiple redaction and access implementations.
- Public activity sharing can expose the user-provided original artifact filename unless policy explicitly approves it.
- Profile provisioning chooses a public default independently of the database default and lacks one named policy owner.
- Route upload/deletion, activity artifact cleanup, ingestion, provider sync, and recalculation have separate retry/repair ownership.
- Account, profile, goal, event, group-event, settings, and training-plan mutations do not share one concurrency/idempotency protocol.

### UI and cross-surface behavior

- Web duplicates the Training Plan card instead of consuming one canonical presentation contract.
- Web group-event dates use the browser timezone instead of the event timezone.
- Mobile activity detail has local duration/effort/unit formatting that can disagree with cards and preferred units.
- Group-event cards reduce associated Activity Plans to non-interactive labels.
- Static mobile resource cards can receive disabled-button accessibility semantics.
- Loading, refetch error, initial error, empty, not found, private, and partial states are implemented independently.
- Raw form controls, direct pressable actions, direct locale date formatting, and local unit suffixes can bypass shared behavior without an owned exception.
- Capability fields are optional at the presentation boundary and some cards render actions independently.
- Web profile activities/statistics are permanent placeholders despite canonical data existing elsewhere.

### Contract, architecture, and verification bypasses

- Loose or unknown transport shapes remain in activity files, profile settings, calendar adapters, and selected procedure inputs/outputs.
- Apps can import database code without a path-sensitive server-only restriction.
- Source aliases and relative imports can bypass package export maps.
- Router-local orchestration and direct SQL can recreate policy and calculation authority, especially in Home and events.
- Cache dependencies, scheduling refresh, ingestion refresh, and app-local invalidations are parallel manually maintained lists.
- New unsafe TypeScript can rely on broad historical debt without an owner and expiry.
- Changed-file verification can succeed without a meaningful test capsule.
- Generated route freshness and package export resolution are not fully enforced.
- CI checks web/mobile journey syntax and selected builds, but does not consistently execute the critical Playwright and Maestro journeys.
- Existing parity tests do not systematically compare facts, formatting, actions, accessibility, and lifecycle states across endpoints and apps.

### Initial audit traceability

Slice 0 expands this into the machine-readable ledger. These IDs are immutable.

| ID | Finding and initial evidence | Target |
|---|---|---|
| DATA-01 | Calendar reduced activity read in `drizzle-event-read-repository.ts` and `events.ts` | Slices 2–4 |
| DATA-02 | Unknown-to-zero planning ledger rendering in `PlanningLedgerView.tsx` | Slice 1 |
| DATA-03 | Missing detail comment enrichment in `activity-reads.ts`/`activity-display.ts` | Slices 1–2 |
| DATA-04 | Polyline-only card route capability versus detail stream fallback | Slices 2–3 |
| DATA-05 | Past-goal selection in web `plan-dashboard.tsx` | Slices 1 and 5 |
| DATA-06 | Post-limit RSVP filtering in `routers/groups/events.ts` | Slice 1 |
| DATA-07 | Group join-policy corruption in `routers/groups/index.ts` | Slice 1 |
| DATA-08 | Home drops planned-distance status/provenance and can diverge from effective Plan composition | Slice 4 |
| DATA-09 | Feed owns a separate activity metric/capability producer | Slices 2 and 5 |
| MUT-01 | Unfenced goal updates in `routers/goals.ts` | Mutation protocol |
| MUT-02 | Unfenced group-event updates in `routers/groups/events.ts` | Mutation protocol |
| MUT-03 | Plan commit followed by non-durable provider enqueue in `routers/activity-plans.ts` | Mutation protocol |
| MUT-04 | Account, profile, settings, event, and training-plan writes lack one declared mutation protocol | Mutation protocol |
| LIFE-01 | Incomplete product-owned account closure lifecycle | Account/provider security |
| LIFE-02 | Fragmented route, artifact, ingestion, provider, and cleanup repair ownership | Mutation/lifecycle protocol |
| AUTH-01 | Multiple optional authorization/redaction paths across content, groups, organizations, feed, and public share | Trust boundary |
| PRIV-01 | Public artifact `originalName` exposure in `routers/public-share.ts` | Slice 1/privacy registry |
| PRIV-02 | Profile provisioning visibility differs from schema default | Slice 1/policy registry |
| UI-01 | Duplicate web Training Plan presentation in `training-plan-library.tsx` | Slice 9 |
| UI-02 | Browser-timezone group event rendering in `group-ui.tsx` | Slices 1 and 9 |
| UI-03 | Local activity-detail measurement formatting | Slices 1 and 9 |
| UI-04 | Associated Activity Plan reduced to a label in `GroupEventCards.tsx` | Slices 5 and 9 |
| UI-05 | Static-card disabled action semantics in `ResourceCardPrimitives.tsx` | Slices 1 and 9 |
| UI-06 | Feature-local loading, refresh, error, empty, private, and partial query states | Slice 9 |
| UI-07 | Raw form controls and direct pressable resource actions bypass shared interaction policy | Slice 9 |
| UI-08 | Direct locale date/time formatting bypasses event/planning timezone policy | Slices 1 and 9 |
| UI-09 | Local unit suffixes and conversion logic bypass preferred-unit policy | Slices 1 and 9 |
| UI-10 | Optional presentation capabilities allow UI-local action inference | Slices 5 and 9 |
| UI-11 | Web profile activity/statistics placeholders hide existing canonical data | Slices 1, 5, and 9 |
| ARCH-01 | Loose/unknown transport and projection boundaries | Slice 10 |
| ARCH-02 | App-to-database access lacks path-sensitive server/client enforcement | Slice 10 |
| ARCH-03 | Source aliases and relative imports bypass package exports | Slice 10 |
| ARCH-04 | Router-local Home/events orchestration and duplicate fact producers | Slices 2–6 and 10 |
| CACHE-01 | Parallel cache, scheduling, ingestion, and app-local invalidation lists | Slice 7 |
| OFFLINE-01 | Unregistered identity binding, retention, and conflict policy for offline/cache data | Slice 7 |
| TOOL-01 | Unsafe debt without individual owner/expiry and non-strict changed verification | Slices 0 and 10 |
| TOOL-02 | Generated route/export freshness and non-executed critical journeys | Slices 10–11 |

Each ledger row must gain an owner, severity, target release/date, acceptance test, status, and evidence of closure before implementation starts. New findings receive new IDs; existing IDs are never repurposed.

## Mandatory trust-boundary design

1. Introduce typed authorization results for owner, delegated athlete, organization, group, public-content, geometry, and mutation scopes.
2. Make protected repositories and application services accept the appropriate authorization scope rather than a raw viewer ID alone where resource policy applies.
3. Add a resource-policy registry that names visibility, redaction, capability, and not-found masking behavior for every externally readable resource.
4. Classify client-visible fields as public, relationship-scoped, owner-only, consent-scoped, sensitive, or never-client-visible.
5. Require public and viewer-specific response builders to use the resource policy and field classification.
6. Separate web client, web server, mobile runtime, API server, Core runtime, database, and cross-platform UI dependency contexts.
7. Forbid direct database imports from client-capable paths; allow them only in approved server infrastructure directories.
8. Validate every external/provider response, persisted mobile payload, server action input, repository boundary output, and public API response with a named runtime contract or an explicit exception.

**Acceptance criteria**

- Every in-scope protected procedure proves an approved authorization decision before private data loading.
- Unauthorized tests prove sensitive loaders were not called and protected fields are absent rather than null-filled.
- Every public resource type has a registered visibility/redaction/capability policy and a viewer matrix test.
- Public-share projections contain no unapproved filenames, private evidence, thresholds, raw errors, or internal identifiers.
- Client-capable web and mobile paths cannot import database or server-only modules.
- New unvalidated boundary crossings fail architecture checks.

## Account, provider-ingress, and deletion security standard

1. Account closure requires recent re-authentication and a single-use, expiry-bound confirmation intent.
2. Starting closure immediately revokes sessions and refresh credentials, blocks new writes, fences delayed jobs, and prevents reconnecting integrations unless the closure is cancelled under policy.
3. Define a data-class inventory and disposition for:
   - identity and authentication records;
   - profiles and public shares;
   - activities, plans, goals, groups, social content, and messages;
   - source artifacts, derived analysis, caches, and offline client data;
   - provider credentials, links, queued work, and remote resources;
   - backups, security audit records, legal retention, and anonymized aggregates.
4. State exactly what “closed,” “deleted,” “anonymized,” and “retained” mean. External-provider cleanup failure must produce a truthful recoverable state rather than a false completion claim.
5. OAuth callbacks require state/PKCE binding, redirect and account-generation validation, one-time consumption, and safe error handling.
6. Webhooks require signature verification, timestamp/replay bounds, durable receipt identity, generation fencing, and idempotent processing.
7. Token refresh and provider reconnect use locks or compare-and-swap generation fencing so older credentials or jobs cannot overwrite newer state.
8. Externally fetched feeds and provider URLs use allowlisted protocols, bounded redirects/size/time, private-network protections, and parsed response contracts.
9. Sign-out, session revocation, permission loss, and closure clear or quarantine private server/client caches and pending offline work for that identity.
10. Cookie-authenticated writes enforce trusted origins and CSRF protection; CORS, SameSite, secure-cookie, host/proxy, and redirect behavior are explicit and tested.
11. Web sessions use secure, HTTP-only transport. Mobile session credentials use approved secure storage and cannot leak through URLs, logs, analytics, deep links, clipboard state, or ordinary persisted app storage.
12. Password reset, email verification, account recovery, and credential changes use one-time expiry-bound tokens, enumeration-safe responses, replay rejection, rate limits, session revocation, and audit events.
13. Provider credentials use versioned authenticated encryption, key-rotation policy, least-privilege scopes, redacted diagnostics, and generation-fenced replacement/deletion.

**Acceptance criteria**

- Closure cannot begin without recent re-authentication and cannot report completion while required cleanup is unowned or unresolved.
- Revoked or closing accounts cannot use old sessions, refresh tokens, provider callbacks, webhooks, or delayed jobs to mutate state.
- OAuth callback replay, webhook replay, stale integration generations, and stale token refreshes are rejected.
- Provider cleanup failure is visible through a safe operation receipt and can be reconciled without reopening account access.
- Public shares, offline caches, derived facts, backups, and audit retention have explicit tested dispositions.
- External feed tests cover redirect loops, oversized bodies, unsupported media, private-network destinations, malformed data, and timeouts.
- Cross-site cookie writes, untrusted origins, reset-token replay, recovery enumeration, insecure mobile credential storage, and credential-log leakage are rejected by dedicated threat tests.
- Provider credentials remain encrypted at rest and can rotate keys without accepting stale ciphertext or exposing secret material.

## Slice S0: identity, session, and provider security foundation

**Purpose:** land non-optional trust controls before account-closure, provider, or external-ingress migrations.

Before provider or closure implementation proceeds:

1. Register trusted origins, CSRF/session transport, credential storage, recovery-token, provider-encryption, OAuth callback, webhook receipt, and external-fetch policies.
2. Add the corresponding threat fixtures and tests.
3. Require provider/account procedures to use these registered boundaries for new and touched code.
4. Fence current callbacks, refreshes, webhooks, and jobs by user/integration generation.

During account/provider lifecycle migration:

5. Add recent re-authentication, immediate revocation/write blocking, data disposition, durable cleanup, reconciliation, and completion guarantees.
6. Migrate remaining legacy provider adapters and closure-related endpoints against the same policies.

**Acceptance criteria**

- No account-closure or provider mutation ships before items 1–4 pass.
- Current supported auth and provider flows continue to work through registered boundaries.
- Every remaining legacy exception has an immutable finding ID, owner, expiry, and target migration slice.

## Standard mutation and asynchronous lifecycle protocol

Every in-scope mutation declares:

- authenticated actor and resource authorization;
- resource identity and expected revision where concurrent writes matter;
- idempotency identity for replayable external or ingestion effects;
- transaction boundary and affected-row/conflict behavior;
- changed semantic facts;
- cache/dependency receipt;
- required provider, notification, storage, recalculation, or cleanup work;
- durable owner for that follow-up work;
- resource revision or generation fence carried through claim, external effect, and completion;
- durable operation ID and remote-effect identity where the provider exposes one;
- retry classification, terminal states, cancellation, and reconciliation;
- client-safe operation receipt and observability fields.

Use a shared lifecycle vocabulary where it describes the same operation semantics: `pending`, `processing`, `succeeded`, `partially_succeeded`, `failed_retryable`, `failed_terminal`, and `cancelled`. Domain-specific state machines may remain distinct, but their relationship to this lifecycle must be explicit.

The first mutation migrations are:

1. Goal updates.
2. Group and group-event policy/update paths.
3. Activity-plan updates with provider publication.
4. Profile and settings writes.
5. Training-plan revisioned writes.
6. Route upload/deletion and artifact cleanup.
7. Account closure/deletion and provider disconnection.

**Acceptance criteria**

- Concurrent stale goal and group-event writes are rejected or intentionally merged by a documented policy.
- Activity-plan writes never lose required provider follow-up; the client receives a truthful durable operation state.
- Provider/storage/ingestion delivery is treated as at-least-once unless the external system proves idempotency. Durable operation identity, generation fencing, and reconciliation must converge duplicate or ambiguous attempts safely.
- An older job cannot publish, delete, or reconnect after a newer resource revision or integration generation wins.
- Every pending external or cleanup state has a worker, lease or retry owner, terminal failure behavior, and reconciliation path.
- Account closure can be requested, cancelled where allowed, resumed after interruption, and completed with verified session, provider, storage, and product-data handling.
- A mutation cannot be added without declaring changed facts and recovery behavior.

## Canonical fact model

Use a closed value contract for facts that can be incomplete:

```ts
type ProjectedFact<T, Unit extends string> =
  | {
      status: "available";
      value: T;
      unit: Unit;
      provenance: FactProvenance;
      freshness: FactFreshness;
    }
  | {
      status: "partial";
      value: T;
      unit: Unit;
      reason: PartialFactReason;
      provenance: FactProvenance;
      freshness: FactFreshness;
    }
  | {
      status: "unavailable";
      value: null;
      unit: Unit | null;
      reason: PublicUnavailableFactReason;
      retryable: boolean;
      provenance: null;
      freshness: FactFreshness;
    };
```

`FactFreshness` is a closed contract containing:

- `state`: `current`, `stale`, `processing`, `failed`, or `unknown`;
- `asOf`: the observation or calculation cutoff;
- `revision`: a safe public revision when the fact has one;
- `reason`: a closed freshness reason when the state is not current.

Provenance should distinguish at least:

- `observed`: recorded activity evidence.
- `derived`: calculated from recorded evidence, with calculation identity and time.
- `authored`: explicitly configured in a plan revision.
- `estimated`: calculated from plan structure.
- `personalized`: estimated with an athlete-state revision.

Unavailable reasons should distinguish at least:

- `not_observed`
- `not_applicable`
- `processing`
- `source_missing`
- `source_invalid`
- `dependency_unavailable`
- `analysis_failed`

`not_loaded` is not a public reason. It is an internal projection error.

Internal resolution may use reasons such as `private_data`, but that reason is not part of the public contract. Public provenance is allowlisted. It may expose safe fields such as source kind, public model version, and calculation time. It must not expose private thresholds, calibration revisions, evidence fingerprints, artifact identifiers, raw failure details, or proof that private evidence exists. Non-owners receive an authorization-safe generic unavailable reason unless a fact registration explicitly permits their authorization class to see a more specific cause.

Every multi-fact projection also carries an internal `ProjectionContext` containing:

- viewer identity and authorization class;
- planning timezone and any event-specific timezone;
- locale and preferred-unit context;
- request `asOf` watermark;
- source, analysis, plan, athlete-state, and policy revision bundle as applicable;
- snapshot/transaction identity where cross-query consistency requires one;
- stable ordering identity and truncation state.

Purpose-built public DTOs expose only the safe subset needed for freshness and pagination. Keyset cursors bind to the stable viewer/tenant identity, authorization class, relationship/policy revision, query filters, ordering, timezone, and snapshot/as-of watermark so another viewer cannot reuse them and later pages cannot silently switch populations. Authorization or relationship changes invalidate the cursor and require a safe restart. Projection and parity tests include changes occurring between endpoint reads and between pages; the system must either preserve the bound snapshot or explicitly return a revision/freshness conflict that prompts a restart.

## Slice 0: establish facts and failing parity fixtures

**Purpose:** define truth, policy ownership, and measurable enforcement before changing producers or screens.

1. Add a read-only standards report that inventories:
   - authority and policy registration coverage;
   - protected procedures and their authorization boundary;
   - public DTOs and field classifications;
   - mutation protocol coverage;
   - direct database and package-internal imports;
   - runtime-validated boundary coverage;
   - unsafe TypeScript exceptions and expiry;
   - canonical resource/card registration;
   - date, timezone, unit, raw form, and accessibility bypasses;
   - changed-file verification capsules;
   - generated-artifact freshness;
   - web/mobile parity and critical journey execution.
2. Baseline the fixed issue inventory with an owner, severity, intended authority, migration slice, and acceptance test. The baseline may shrink but cannot grow without evidence and review.
   - Assign immutable finding IDs and retain the original evidence path or test.
   - Record fixed inventory, newly discovered security issues, and optional modernization separately.
   - Name the approver and permit at most one exception renewal without a new decision.
3. Land the minimum blocking safeguards before feature migration:
   - forbid new client-capable database imports and package-internal export bypasses;
   - require authorization/redaction registration for new or touched protected procedures;
   - require named input/output parsers for new or touched public boundaries;
   - require owner/reason/expiry metadata for new unsafe or UI exceptions.
4. Create a registry for the initial fact families:
   - completed activity measurements and quantification;
   - planned activity estimates;
   - activity composition and timing coverage;
   - route usability;
   - engagement counts and action capabilities;
   - goal selection;
   - schedule and completion replacement;
   - analysis lifecycle and freshness.
5. Define which surfaces expose each fact and which intentional reductions are allowed.
   - Core owns transport-neutral fact primitives and pure calculations only.
   - API owns projection registrations, versioned response schemas, and fact-to-response mappers.
   - Repositories own authorization-scoped persistence reads.
6. Define typed resource-policy, projection, mutation, and UI-resource registrations. Each registration names its authority, authorization class, redaction policy, fact dependencies, public contract version, capabilities, verification capsule, and approved exceptions.
7. Inventory current web and mobile consumers of the affected response contracts. Classify each change as additive or breaking and define the server-first migration and rollback window.
   - Define a supported-client policy with the current web deployment, minimum supported mobile contract epoch/version, sunset date, and responsible owner.
   - Web moves with its server deployment; mobile remains on dual contracts until the declared minimum version and sunset criteria are met.
   - Incompatible offline clients must not upload or replay data under an unknown contract. They preserve recoverable local intent where safe, present a required-update state, and use a versioned migration or explicit discard policy.
   - Contract support is removed only after the declared sunset, compatibility tests, queue/persisted-state migration proof, and rollback review—not merely from usage telemetry.
8. Declare fact dependencies for every endpoint migrated by this plan while retaining existing broad invalidation as a fallback.
9. Add a canonical database-backed fixture set containing:
   - a completed single-sport activity with available quantification;
   - a multisport activity;
   - partial timing coverage;
   - unavailable and partially validated quantification;
   - a linked completion outside the calendar date range;
   - an accepted activity artifact with GPS records but no stored polyline;
   - processing and failed ingestion;
   - zero, one, and multiple comments;
   - planned sessions with authored, estimated, partial, and unavailable metrics;
   - past and future goals;
   - enough declined and going group events to cross a page boundary.
   - request-to-join, invite-only, and open groups;
   - concurrent goal and group-event edits;
   - provider publication failure after a plan edit;
   - owner, follower, group member, delegated coach, public viewer, and denied viewer policy cases;
   - timezone and preferred-unit boundary cases;
   - static and interactive canonical card accessibility cases.
10. Normalize endpoint and UI output into comparable semantic assertions rather than comparing complete DTOs. Comparisons must use the same resource, viewer permission class, planning timezone, unit preference, source revision, analysis revision, and `asOf` cutoff.

**Primary code areas**

- `packages/core/contracts/`
- `packages/core/projections/` only for transport-neutral, runtime-independent fact logic if introduced
- `packages/api/src/contracts/`
- `tooling/architecture/`
- `packages/ui/` ownership and contract tests
- API live-database and router contract tests
- `tests/parity/`

**Acceptance criteria**

- Every confirmed defect has a failing test before its behavior is changed.
- Fixtures compare shared facts across Detail, activity list, Feed, Calendar, Plan, and Home where applicable.
- Tests distinguish known zero from unavailable and planned estimates from completed observations.
- Different surface DTOs are allowed while shared fact assertions remain equal.
- Tests enumerate the typed projection registrations and fail when fact ownership, cache dependencies, authorization class, or contract version is missing.
- Breaking response changes have a versioned compatibility path; deployed clients are never required to understand a server response they cannot parse.
- The supported-client registry makes dual-contract duration, minimum versions, offline behavior, sunset, and removal criteria measurable.
- The standards report is reproducible, machine-readable, and fails on new unregistered or unowned violations.
- Every fixed-inventory item maps to an implementation slice and a verification capsule.

## Slice 1: remove current user-facing falsehoods

**Purpose:** correct small, high-confidence defects without waiting for the larger projection consolidation.

1. Planning Ledger preserves unavailable and partial planned intensity and duration instead of displaying `0.00` and `0 min`.
2. Activity detail loads the authoritative comment count or explicitly represents count availability; absence is not converted to zero.
3. Web Plan selects the earliest active goal on or after the current planning date. If no future goal exists, it shows no next-goal anchor.
4. Mobile activity cards honor `canShare`, `canComment`, and `canLike`; unavailable actions are hidden or disabled according to one presentation rule.
5. Group-event list predicates select the visible RSVP population before pagination, so declined events cannot create empty or undersized pages with misleading cursors.
6. Replace permanent profile activity/statistics placeholders with an honest unavailable/not-implemented state, or connect them to canonical projections if that work remains bounded.
7. Preserve `request_to_join` as a distinct group policy in every response and UI.
8. Format group events in their event timezone on both apps.
9. Route activity-detail measurements through preferred-unit-aware canonical formatters.
10. Ensure static resource cards are exposed as content and interactive cards as accessible actions.
11. Remove public artifact filenames unless the privacy registry explicitly approves them.
12. Define one profile-default visibility policy used by database defaults, provisioning, onboarding, API responses, and tests.

**Primary code areas**

- `apps/mobile/components/plan/ledger/PlanningLedgerView.tsx`
- `packages/api/src/application/activities/activity-reads.ts`
- `packages/api/src/application/activities/activity-display.ts`
- `apps/web/src/components/planning/plan-dashboard.tsx`
- `apps/mobile/components/shared/ActivityCard.tsx`
- `packages/api/src/routers/groups/events.ts`
- `apps/web/src/routes/_protected/user/$userId/index.tsx`
- `packages/api/src/routers/groups/index.ts`
- `apps/web/src/components/groups/group-ui.tsx`
- `apps/mobile/app/(internal)/(standard)/activity-detail.tsx`
- `apps/mobile/components/shared/ResourceCardPrimitives.tsx`
- `packages/api/src/routers/public-share.ts`
- `packages/api/src/application/profiles/readProfiles.ts`
- `packages/db/src/schema/tables.ts`

**Acceptance criteria**

- No unavailable planned metric is rendered as numeric zero.
- Detail summary and comments content agree for the same activity.
- Past goals are never labeled as the next goal.
- Cards do not offer actions rejected by their supplied capability contract.
- Group-event pages fill from eligible events and provide a correct continuation cursor.
- Error, unavailable, empty, and not-yet-implemented states remain distinct.
- Group join policy, group-event time, activity-detail units, and card accessibility agree with their registered policy and formatter contracts.
- Public responses contain no unapproved user-provided artifact filenames.
- Newly provisioned profiles receive the registered default visibility consistently at every boundary.

## Slice 2: establish the completed-activity fact authority

**Purpose:** make one server-side authority responsible for activity facts while retaining surface-specific selection and projection.

1. Introduce an authorization-scoped, batched activity fact repository boundary.
2. Separate surface selection from fact hydration:
   - activity list selects visible activity IDs and order;
   - Feed selects visible IDs and cursor order;
   - Calendar selects standalone and linked completion IDs;
   - Detail selects one authorized ID.
3. Establish independently selectable, typed activity fact families:
   - identity, owner, visibility, and timestamps;
   - complete ordered activity composition;
   - distance, elapsed, active, moving, and timing coverage;
   - recorded quantification and calculation identity;
   - engagement counts and viewer state;
   - route usability;
   - detail-only segments, laps, artifacts, ingestion state, and owner-only RPE.
4. Resolve each requested fact family independently. A projection may load only the families declared in its typed registration; list and card projections never load detail-only evidence.
5. Establish activity-scoped route usability, engagement, and capability facts here so later slices migrate consumers rather than inventing new authorities.
6. Build strict, purpose-specific projections from those facts.

**Likely API modules**

- `packages/api/src/repositories/activity-read-facts-repository.ts`
- `packages/api/src/infrastructure/repositories/drizzle-activity-read-facts-repository.ts`
- `packages/api/src/application/activities/load-activity-facts.ts`
- `packages/api/src/application/activities/resolve-activity-facts.ts`
- `packages/api/src/application/activities/project-activity-card.ts`
- `packages/api/src/application/activities/project-activity-detail.ts`

Names may follow existing package conventions. The boundary matters more than the exact filenames.

**Migration order**

1. Activity list and detail.
2. Feed, retaining its visibility selection and cursor behavior.
3. Prepare Calendar standalone and linked-completion activity projections, but cut Calendar over only after the planned-work authority in Slice 4 is ready.
4. Home activity summaries where they expose the same facts.
5. Remove metric and capability construction from repository SQL mappers after their consumers migrate.

**Acceptance criteria**

- The same activity has matching shared fact value, status, reason, provenance, composition, engagement, and capability data across migrated endpoints.
- Calendar preserves multisport composition and partial timing coverage.
- Calendar and Plan day sheets show recorded Load and Intensity whenever detail can show them for the same authorized viewer and analysis revision.
- Linked completions outside the calendar date range receive the same fact hydration.
- Feed no longer owns a separate metric producer.
- Query count remains bounded as page size grows.
- Non-owners never receive owner-only analysis, RPE, streams, or private evidence.
- Tests prove private evidence loaders are not called for unauthorized viewers.

## Slice 3: align route and analysis lifecycle truth

**Purpose:** migrate route and lifecycle consumers onto the authorities established in Slice 2 and explain why completed activity facts are unavailable.

1. Migrate route usability to accepted route evidence, not only the stored polyline field.
2. Let list/card projections expose a bounded route capability without loading raw streams into clients.
3. Carry a safe analysis lifecycle into relevant summaries:
   - processing;
   - current;
   - stale;
   - failed;
   - unavailable.
4. Map missing metrics to lifecycle-aware reasons. Processing and failure must not look like permanently absent evidence.
5. Keep raw ingestion errors, evidence fingerprints, and private streams out of public DTOs.

**Acceptance criteria**

- A card and detail screen agree whether a usable route exists.
- A GPS stream without a stored polyline does not produce a false `hasRoute: false`.
- Processing, failed, stale, and genuinely unavailable metrics are visibly distinguishable where the surface exposes analysis state. Viewers without permission to know the cause receive an authorization-safe generic unavailable state.
- No public response exposes internal failure text or private evidence.

## Slice 4: establish the planned-work fact authority

**Purpose:** ensure Activity Plan, Calendar, Plan, Planning Ledger, and Home use the same authored and estimated facts.

1. Preserve the existing Core planning estimator as the calculation authority.
2. Add one plan-fact resolver that binds:
   - plan structure and revision;
   - authored duration and distance;
   - estimated duration, distance, Load, and Intensity;
   - personalization and athlete-state revision;
   - schedule status and timing;
   - linked completion replacement.
3. Give Home, Calendar, activity-plan detail, and Planning Ledger purpose-specific projections from those facts.
4. Move Home's visible schedule onto the effective planning composition used by Plan, while leaving unrelated Home analytics unchanged.
5. Preserve fact status and provenance in Home instead of flattening distance or other metrics to unexplained nullable numbers.
6. Compare authoring/composer statistics with scheduled estimates and document any intentional differences.

**Primary code areas**

- `packages/core/plan/`
- `packages/core/activity-plan/`
- `packages/api/src/application/activity-plans/`
- `packages/api/src/application/training-plan/get-effective-plan-load.ts`
- `packages/api/src/application/training-plan/planTabProjectionService.ts`
- `packages/api/src/application/events/plannedDaySummaryUseCase.ts`
- `packages/api/src/application/home/plannedActivities.ts`
- `packages/api/src/routers/home.ts`

**Acceptance criteria**

- One plan revision produces matching metric values, statuses, and provenance across plan detail, scheduled Calendar cards, Plan, Planning Ledger, and Home.
- Completed linked activities replace planned facts only where the projection requests effective completed work.
- Missing completion observations are never replaced with estimates.
- Home schedule and Home forecast use compatible effective-schedule semantics.
- Planned distance retains authored/estimated/partial/unavailable state through the client contract.

## Slice 5: centralize engagement, capability, goal, and embedded-resource facts

**Purpose:** extend the activity engagement and capability authorities to other social resources, and eliminate smaller projection authorities that recreate facts or reduce canonical resources to labels.

1. Reuse the activity engagement and capability facts established in Slice 2, then extend the pattern to other social resources.
2. Remove remaining endpoint- or UI-local action policies after their resource authority exists.
3. Define one next-goal and goal-status selector using the athlete's planning date and timezone.
4. Replace one-off embedded Group, Activity Plan, Route, and Activity summaries with canonical projections and cards when navigation and access are available.
5. Keep deliberately compact variants, but derive them from the same resource facts.

**Acceptance criteria**

- Counts are either authoritative or explicitly unavailable; missing enrichment is not zero.
- Web and mobile honor the same capability facts.
- Goal status and next-goal selection agree across Home, Plan, Calendar, and goal detail.
- Embedded resources retain identity, access, navigation, and relevant state rather than becoming raw labels.

## Slice 6: define readiness and athlete-state vocabulary

**Purpose:** prevent multiple calculations with overlapping names from appearing interchangeable.

1. Inventory the current athlete-state, training forecast, and goal-readiness calculations.
2. Give each model a distinct fact identity, input contract, scale, time horizon, and intended surface.
3. Choose one authority for any models that claim to answer the same question.
4. Rename intentionally different models in contracts and UI so users can understand the distinction.
5. Bind athlete-state facts to snapshot/revision metadata where related sections must be consistent.
6. Remove unused mobile fallback calculations after proving they have no production consumer.

**Acceptance criteria**

- Every readiness value identifies its model, horizon, scale, revision, and freshness.
- Two values with different meanings do not share the same unexplained label.
- Unused alternate calculations are removed rather than retained as future drift paths.
- Cross-surface tests prove equality where the same readiness fact is shown and intentional distinction where it is not.

## Slice 7: make cache dependencies follow facts

**Purpose:** ensure changes refresh every projection that depends on the changed facts.

1. Complete the semantic dependency tags introduced with the typed projection registrations in Slice 0, including:
   - activity identity, measurements, quantification, engagement, visibility, source, and route;
   - plan authored facts and personalized estimates;
   - schedule;
   - planning timezone;
   - goals;
   - group events;
   - athlete-state snapshots.
2. Complete each query's fact dependencies and each mutation's changed facts.
3. Derive current query invalidation and mutation receipts from that dependency graph.
4. Compare generated invalidation against the retained broad behavior.
5. Remove parallel scheduling, ingestion, and app-local lists only after all consumers migrate and comparison tests pass.
6. Partition private caches by user/session and relevant authorization scope. Permission changes, sign-out, revocation, account switch, and closure clear or quarantine affected cache and pending-client state.
7. Register every offline-persisted data class with identity binding, sensitivity, encryption/storage expectations, retention, expiry, and cleanup trigger.
8. Give offline mutations durable operation IDs, dependency ordering, stale-write/conflict behavior, and operation-receipt recovery after restart or ambiguous responses.
9. Standardize privacy-safe correlation IDs across API requests, jobs, provider receipts, and client operations without logging raw tokens, filenames, URLs, route/location data, request bodies, or private identifiers.
10. Define telemetry event ownership, allowlisted properties, sampling, retention, deletion behavior, and sanitizer parity across API, web, and mobile.

**Primary code areas**

- `packages/api/src/contracts/cache-receipts.ts`
- `packages/api/src/query-client.ts`
- API mutation receipt builders
- web and mobile invalidation helpers
- web and mobile query persistence/session lifecycle
- API, web, and mobile telemetry sanitizers

**Acceptance criteria**

- Every fact-bearing query has dependency metadata.
- Every fact-changing mutation invalidates every dependent query.
- Activity ingestion and analysis refresh Detail, lists, Feed, Calendar, Plan, Home, and athlete-state consumers as applicable.
- Tests fail when a new endpoint or mutation omits dependency ownership.
- Account switching, sign-out, revocation, permission loss, and closure cannot expose a previous identity's private cached or offline data.
- Offline retry preserves operation order, rejects stale revisions, and recovers ambiguous receipts without duplicate local intent.
- Telemetry tests reject raw provider errors, tokens, filenames, sensitive URLs, coordinates, request bodies, and disallowed identifiers on every runtime.

## Slice 8: make projection parity a release condition

**Purpose:** prevent future endpoints from returning a different truth for an existing fact.

Use a layered verification strategy:

1. Core contract tests for value, provenance, known-zero, unavailable, freshness, and calculation identity.
2. Projection tests that map one semantic fixture into each purpose-specific DTO.
3. Application tests for batching, missing dependencies, authorization, truncation, and stable ordering.
4. Repository tests for selected columns, joins, ownership predicates, and real row mapping.
5. Live-database endpoint tests that call real routers against canonical relational fixtures.
6. Cache dependency tests covering every query and mutation.
7. Web and mobile component tests for available, partial, processing, stale, failed, authorization-safe, and unavailable presentation.
8. Runtime checks for Calendar and Plan bottom sheets on mobile and corresponding web cards.

For batch projections, run representative cases with 1, 20, and 100 selected IDs. Set and document a fixed query budget per requested fact-family set, verify ordering and cursors, and inspect representative query plans for row multiplication or scans. Live-database parity cases must cover owner, authorized follower, public viewer, and denied viewer, including complete absence—not merely null values—of protected fields.

**Acceptance criteria**

- A new endpoint exposing an existing fact must register its dependency and pass its parity fixture.
- Tests fail when one endpoint says unavailable while another has an available authorized fact from the same revision.
- Tests fail when one endpoint says zero and another says unavailable.
- Tests fail when provenance or freshness is dropped without an explicit projection rule.
- The broad integration gate passes after targeted package and runtime verification.

## Slice 9: make UI standards contractual

**Purpose:** ensure canonical components carry domain policy rather than only shared styling.

1. Add a canonical UI resource registry for Activity, Activity Plan, Training Plan, Group, Group Event, Route, Profile, Goal, and other first-class resources.
2. For each registered resource, name:
   - typed presentation contract;
   - canonical web and mobile card or an intentional cross-platform implementation;
   - detail route and navigation builder;
   - compact, list, picker, and embedded variants;
   - required API-supplied capabilities and UI action-presentation rule;
   - semantic fixture set;
   - accessibility contract;
   - approved exceptions.
3. Make canonical cards accept presentation contracts, not database rows, loose API objects, or locally recomputed strings.
4. Consolidate the duplicated web Training Plan card and replace associated-resource labels with registered compact cards where access and navigation exist.
5. Introduce typed presentation contexts for locale, planning/event timezone, preferred units, and precision.
6. Route user-facing dates, durations, distances, speeds, loads, intensities, and metric names through approved semantic formatters.
   - API policy is the sole owner of whether an action is available.
   - UI policy owns only how supplied capability states render, such as hidden, disabled with explanation, or available.
7. Standardize query-backed presentation states:
   - initial loading;
   - background refresh;
   - initial error;
   - refresh error with retained data;
   - known empty;
   - not found;
   - inaccessible/private;
   - partial content;
   - offline with cached data;
   - re-authentication required;
   - stale-write conflict;
   - queued or processing operation.
8. Make shared form wrappers the default for semantic fields and require an explicit exception for raw controls that implement specialized gestures or platform behavior.
9. Require static cards to expose content semantics and interactive cards to expose action, keyboard/focus order and restoration, target-size, nested-action, and dynamic live-announcement semantics.
10. Add an owned, expiring `@ui-exception` mechanism for legitimate direct primitives or local compositions.

**Architecture checks**

- No app-local `*Card` for a registered resource without an approved variant registration.
- No raw API/persistence type accepted by a canonical card.
- No direct locale date formatting for persisted schedules outside approved formatters.
- No local conversion formula or unit suffix outside approved measurement modules.
- No action rendered without the registered capability fact.
- No raw shared-field replacement when a semantic form control exists, absent an exception.
- No `Pressable`, `TouchableOpacity`, or generic web `Card` used as a registered resource navigation surface without canonical composition or an exception.

**Acceptance criteria**

- The same UI fixture yields matching identity, metric order, value/status, timezone, units, actions, navigation target, accessible name, and role on web and mobile.
- Time fixtures cover daylight-saving gaps, ambiguous wall times, cross-midnight events, date-only values, and device timezone changes.
- Registered resource variants are discoverable and machine-enumerated.
- Web Training Plan and Group Event presentations use their registered contracts.
- Associated Activity Plans and other first-class resources retain identity and navigation instead of becoming labels.
- Error cannot render as empty, refresh error cannot discard retained data, and static cards are not announced as disabled controls.
- Loading, partial, queued, conflict, offline, re-authentication, and error transitions preserve focus and provide appropriate screen-reader announcements.
- New presentation bypasses fail an architecture check unless they carry an owned, expiring exception.

## Slice 10: enforce package and runtime boundaries

**Purpose:** turn repository guidance into executable architecture policy.

1. Add path-sensitive dependency contexts for web client, web server, mobile runtime, API server, Core, database, and cross-platform UI.
2. Block app-to-database imports outside approved server-only infrastructure paths.
3. Remove source aliases and relative imports that bypass package export maps; add an export-resolution test for every declared package export and platform condition.
4. Require named runtime contracts for:
   - tRPC inputs and public outputs;
   - provider responses and webhook payloads;
   - repository rows crossing application boundaries;
   - server-action form data;
   - persisted mobile/offline payloads;
   - polymorphic JSON exposed beyond its owning boundary.
5. Replace broad `z.unknown`, `z.looseObject`, `passthrough`, `any`, double casts, and non-null assertions at the fixed-inventory boundaries. Retain only narrow integration adapters with owners and expiry.
6. Keep routers thin by moving multi-source orchestration and direct domain calculation into named application read/write services.
7. Add route-tree and generated-artifact freshness to generated checks.
8. Make changed-file verification strict: every production change maps to a test, approved verification command, or explicit exception.
9. Couple schema/migration/security-sensitive changes to the guarded database verification profile.

**Acceptance criteria**

- New client-capable code cannot import database or server-only packages.
- Every package export resolves under its intended web/native/server conditions.
- New public or persisted boundary data cannot use an unvalidated unknown shape.
- Every changed production file has an executable verification owner.
- Generated routes and other declared artifacts cannot be stale while checks pass.
- New unsafe TypeScript debt is zero unless an owner, reason, scope, and expiry are recorded.

## Slice 11: make CI prove critical journeys

**Purpose:** align automated delivery confidence with user and data risk.

Required CI capsules are:

1. Static architecture, policy registries, and exception expiry.
2. TypeScript and runtime contract checks.
3. Core unit and numerical invariant tests.
4. API authorization, mutation-protocol, and projection contract tests.
5. Disposable database verification and selected live-database behavior.
6. Web and mobile semantic component parity.
7. Web Playwright smoke journeys.
8. Mobile Maestro smoke journeys on a suitable protected or scheduled runner.
9. Production build, export resolution, generated-artifact freshness, and dependency/security checks.

The initial critical journeys are:

- account closure request, interruption, retry, cancellation where allowed, and completion;
- group join-policy display and group/group-event stale-update rejection;
- activity-plan edit with provider publication success, retryable failure, and terminal failure;
- activity visibility and public sharing without sensitive metadata leakage;
- recording/import completion through analysis publication and Calendar/Plan refresh;
- Calendar and Plan bottom sheets for planned, completed, partial, processing, and unavailable metrics;
- timezone and preferred-unit parity on web and mobile.

**Acceptance criteria**

- Pull requests execute a bounded risk-based smoke set; integration branches execute the full required matrix.
- Syntax-only Playwright or Maestro validation does not count as journey execution.
- A feature touching authorization, mutation lifecycle, canonical facts, or shared presentation cannot pass without its declared verification capsule.
- CI artifacts publish standards coverage and debt movement without allowing the baseline to increase silently.

## Enforcement matrix

| Standard | Structural owner | Required enforcement |
|---|---|---|
| Authorization and visibility | API policy/application boundary | Typed authorization scope, resource-policy registry, viewer-matrix tests |
| Privacy and redaction | API public projection policy | Field classification, leakage tests, telemetry sanitizer |
| Account and provider ingress | Auth/API provider boundary | Re-authentication, revocation, OAuth/webhook replay and generation tests |
| Mutation safety | API application services | Revision/idempotency protocol, transaction tests, durable receipt |
| Provider/storage lifecycle | Durable job owner | Lease/retry/terminal-state tests, reconciliation check |
| Fact truth | Core fact primitive + API authority | Runtime contract, DB-backed parity fixture |
| Cache freshness | Semantic dependency registry | Query/mutation coverage enumeration and invalidation tests |
| Offline and identity lifecycle | App runtime + API receipt contract | Identity binding, retention, conflict, sign-out/revocation cleanup tests |
| Telemetry and correlation | Shared privacy/observability policy | Allowlists, sanitizers, retention, cross-runtime leakage tests |
| Dates and units | Core semantics + UI formatter | Typed context, static bypass rule, web/mobile fixtures |
| Capabilities and actions | API policy + UI presentation contract | Required capability props and action parity tests |
| Canonical resources | UI resource registry | Registered cards/routes/variants and exception checks |
| Query states and forms | Shared UI contracts | State/form contract tests and raw-control exceptions |
| Accessibility | Shared UI contracts | Semantic component tests plus critical runtime journeys |
| Package boundaries | Architecture tooling | Path-sensitive dependency and export-resolution checks |
| Runtime contracts | Core/API/Auth owning boundary | Parser coverage report and zero new unvalidated crossings |
| Verification | Tooling and CI | Strict changed coverage, live DB, Playwright, Maestro, builds |

## Debt and exception policy

- Existing baselines are migration inventories, not permission to repeat a pattern.
- Every exception records owner, reason, exact scope, creation date, expiry, and intended replacement.
- Each exception names its approver and target removal release. It may be renewed once; a second renewal requires a new explicit product/architecture decision and revised evidence.
- New exceptions cannot increase a security, privacy, public-contract, or data-integrity risk without an explicit decision.
- Expired exceptions fail CI.
- Quarterly targets reduce unsafe TypeScript, relative workspace imports, dependency cycles, unvalidated boundaries, unpaired canonical resources, and missing parity coverage.
- A standard becomes required for all new and touched code once its registry and check land, even while historical debt remains.

## Delivery sequence

1. Stabilize or isolate the current dev worktree.
2. Land the Slice 0 standards report, registries, fixed inventory, and failing verification capsules.
3. Land Slice S0 trusted-origin/session/recovery/provider-ingress controls before account or provider lifecycle work.
4. Repair the smallest confirmed correctness/privacy defects in Slice 1.
5. Establish mandatory authorization, redaction, package, and runtime trust boundaries for new and touched code.
6. Migrate goals, groups/group events, activity-plan provider publication, profiles/settings, routes/storage, and account closure to the standard mutation and lifecycle protocol.
7. Land the activity fact authority and migrate list/detail, then Feed while retaining selectors and cursor behavior.
8. Land the planned-work authority.
9. Migrate Calendar's completed and planned paths together; verify Plan and Calendar bottom sheets.
10. Add route and analysis lifecycle presentation, then migrate Home activity and schedule projections.
11. Centralize secondary facts, canonical resource embeddings, readiness vocabulary, and snapshot identity.
12. Land the UI resource registry, semantic formatting/state/form/accessibility contracts, and migrate the fixed UI inventory.
13. Derive invalidation from semantic dependencies and remove broad fallbacks only after comparison proof.
14. Enforce path-sensitive architecture, package exports, runtime contracts, changed verification, and generated freshness.
15. Execute the required Playwright/Maestro critical journeys and publish standards coverage in CI.
16. Remove compatibility producers and exceptions only after every supported client and parity test has migrated.

Each slice should remain independently reviewable. Temporary adapters are allowed during migration, but dual calculation authorities are not a permanent state.

## Verification commands

Use the narrowest package checks during each slice, then run the broad gate before integration:

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
pnpm --filter @repo/api check-types
pnpm --filter @repo/api test
pnpm --filter mobile check-types
pnpm --filter mobile test
pnpm --filter web check-types
pnpm --filter web test
pnpm quality:agent
```

Database-backed projection, authorization, concurrency, lifecycle, or storage changes also require the relevant guarded local database verification and representative query-plan inspection. Mobile and web presentation changes require runtime validation when static tests cannot prove formatting, accessibility, navigation, or lifecycle behavior. Account-deletion and provider/storage recovery tests use isolated disposable targets; production mutation or destructive verification requires separate explicit authority.

## Stop conditions

Stop and resolve the boundary rather than adding another fallback when:

- a fact cannot be tied to one source, calculation identity, or revision;
- a projection would convert unavailable data into zero, null without a reason, or an empty collection used to represent unavailable or unqueried data;
- authorization would require loading private evidence before access is established;
- query count grows with returned item count;
- a selector loses stable ordering, paging, or truncation information;
- a public projection would expose private thresholds, raw streams, RPE, evidence fingerprints, or internal failure details;
- a protected operation has no registered authorization or redaction policy;
- an endpoint cannot declare which semantic facts it reads;
- a mutation cannot declare which semantic facts it changes, how concurrent writes are handled, or who owns required follow-up work;
- a provider, storage, ingestion, deletion, or recalculation state has no durable retry/reconciliation owner;
- a canonical UI resource, formatter, form, state, or action policy would be bypassed without a registered exception;
- a breaking contract cannot support a safe server-first migration and rollback window;
- a database migration appears necessary without measured evidence;
- a destructive or production lifecycle action lacks explicit authority;
- overlapping uncommitted work prevents a trustworthy diff or verification result.

## Completion criteria

This work is complete when:

- every fixed-inventory issue is repaired or has an approved, tested disposition;
- every authority category has a named owner, registered policy, public contract, cache dependency, and verification capsule;
- protected reads and writes cannot bypass authorization and redaction boundaries;
- state-changing operations use explicit revision/idempotency, durable follow-up, retry, and client-receipt semantics;
- provider, storage, ingestion, deletion, and recalculation work uses generation fencing and convergent reconciliation so at-least-once delivery cannot leave duplicate logical effects or abandoned states;
- the same underlying fact has one semantic authority and every surface preserves its allowed value, status, provenance, freshness, timezone, and unit meaning;
- canonical UI resources, actions, forms, query states, formatting, and accessibility are registered and mechanically enforced for new and touched code;
- package, runtime-contract, generated-artifact, changed-verification, and unsafe-debt checks prevent new bypasses;
- database-backed parity and executed web/mobile critical journeys prevent Detail, Calendar, Plan, Home, Feed, lists, and embedded resources from disagreeing silently;
- account closure has an approved, recoverable end-to-end lifecycle; and
- existing exceptions are owned, expiring, and measurably decreasing rather than serving as permanent permission to repeat debt.
