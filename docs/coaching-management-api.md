# Coaching Core and API management

## Outcome and boundaries

Implement explicit organization management commands and shared framework-free
domain contracts on the verified database foundation, integrate useful checked
slices into shared preview, and leave UI/UX implementation for a later phase.
No automation engine, billing, program distribution, calendar writes, public-group
permission changes or general-purpose permissions editor.

Organizations are mandatory for coaching; workspace means organization context.
One identity can have multiple workspaces and be owner/admin/coach and athlete in
the same organization. Staff membership and athlete engagement remain independent.
Administrative authority never implies private training access.

## Baseline and ownership

- Branch/worktree: `feat/coaching-management-api` / `.worktrees/feat-coaching-management-api`.
- Starts from fetched `origin/main`, with database prerequisite
  `ba5bcf5e0db01129d7b4f8c3e78213de10f17666` and approved source reconciliation
  `a4ed7ea22b2b52272908a3e2cf7311abd63c290d` merged as dependencies.
- Clean implementation base: `95d2b872dbf4288c97ed48c59de5b5fa76eff456`.
- No preview backflow. Existing source dependencies include the API architecture
  repair that previously blocked the database feature's publication.
- Worker owns organization-focused Core/API implementation and tests. Coordinator
  owns docs, independent review, final verification, commits, publication and
  shared-preview disposition. Workers never modify preview or its services.

## Behavior contract

- Session-derived actor only; never accept a caller's role or actor membership as
  authoritative. Scope every member, group, invitation and engagement to the
  requested organization.
- Core owns domain schemas, summaries, pure lifecycle/eligibility rules and closed
  domain vocabulary. API owns transport DTOs, command orchestration, transaction
  boundaries, authenticated authorization, repositories and error mapping.
- Root owner/admin controls invitations and roster/assignment changes. Coaches
  cannot self-expand access. Current root ownership cannot be orphaned.
- Invitation acceptance rechecks the canonical authenticated user's verified
  identity, current inviter authority, expiry and purpose; acceptance plus the
  intended membership/role or athlete engagement commits atomically. It never
  creates sharing consent. Retried commands must not duplicate authority.
- Current AuthSession exposes user id/email/emailVerified. Identity-sensitive
  acceptance rechecks canonical auth storage rather than caller/profile fields or
  stale session email. Tokens remain digest-only in storage and absent from logs.
- Existing database triggers require transaction timestamps and explicit closure,
  archive/removal actors, and already write group-change audit facts. Reuse them
  without duplicate audits; do not pretend status updates alone are acceptance.
- Dynamic group and direct coaching access remains gated by active organization,
  membership, coach role, engagement and scoped consent. Do not extend generic
  delegated profile writes into management or training mutations.
- Acquire organization locks before authority writes; validate current state and
  affected rows. Replays rely on durable state/uniqueness/receipts, not memory.
- Explicit DTO allowlists, bounded keyset queries, deduplicated effective rosters
  and actor/organization-scoped cache inputs. Do not return raw rows or invite
  digests, leak private training into administrative rosters, or perform N+1
  per-athlete authorization queries.
- Existing organization group metadata is immutable. New edit workflows or
  additional durable receipt/outbox storage require a separately reviewed schema
  change; no silent migration or weakened integrity guards.
- Invitation delivery and staff-change notices need truthful state. Reuse durable
  notification records where possible; no real email/provider side effects during
  testing and no claim that a generated link was delivered.

## Planned verification

Core schema/policy tests; API transport and application tests; actual disposable
PostgreSQL boundary tests for invitation identity/replay/atomicity, cross-tenant
denial, staff+athlete coexistence, scope revocation and group/direct overlap;
package type checks, architecture, formatter/linter and normal publication gates.

The documented uniquely named disposable databases on the local repository server
are permitted test targets. The preserved preview database and retained E2E target
are not disposable. No schema activation, user data fixtures or broad grants on
them are permitted in this Core/API task. Preview uses a privileged postgres
connection, so service-role SELECT-only ACLs do not substitute for server-side
authorization. Test actual deployed-role behavior on isolated fixtures.

## Delivery status

In progress—not live. Database foundation remains live separately. Management
endpoints and Core additions will be listed as implemented/verified/deferred at
handoff; no UI/UX changes are included.

### First pass and bounded continuation

The first pass added uncommitted organization vocabulary, summary schemas, an
advisory lifecycle helper and `organizations.managementCapabilities`. It did not
implement lifecycle writes. Its reported package tests/typechecks are evidence
for that scaffolding only, not acceptance of the requested management layer.

The next bounded implementation slice owns organization creation and invitation
creation/acceptance/revocation, including the application/repository transaction
boundary and disposable-database tests. Canonical recipient verification and
atomic membership/engagement creation are required, not deferred behind status
updates. Root-owner contexts without a role grant and root-owner suspension
protection must also be checked before accepting the initial capability contracts.
Coordinator owns review, commits and locked preview integration. No management
checkpoint has yet been committed or integrated; no preview data fixtures or
outbound invitations are authorized for verification.

### Setup/invitation verification checkpoint

Organization creation and invitation create/accept/revoke are implemented locally.
A router-driven disposable PostgreSQL suite passed under Node 24, proving the
deferred owner graph, recipient verification, accepted replay, digest persistence,
athlete engagement without implicit consent, and revoked/expired denial. That run
exposed and fixed database-time expiration checking and invitation-first locking;
acceptance now discovers the organization, locks it, then locks/rechecks the invite.

Independent review still requires canonical identity row locking, tenant-scoped
revocation predicates, effective-time role checks, root-only admin-invitation
authorization, and conflicting creation-retry payload rejection. Those fixes and
concurrency regressions are in progress alongside explicit inviter-authority-loss
and transaction rollback assertions. The initial passing suite does not establish
acceptance of these later fixes. No management checkpoint is live in preview yet.

Coordinator separately repaired the advisory Core root-membership rule to deny
pause/end/archive while keeping independent athlete participation separate. Seven
focused Core contract tests and Core typechecking passed under Node 24.

### Coordinator verification and review follow-up

Coordinator inspection found the reported discovery/identity locks were not in
the returned source. The coordinator removed the invitation discovery row lock,
added `FOR SHARE OF users` to canonical identity lookup, and replaced the raw
expiry SELECT with a typed organization-scoped projection. API typechecking,
architecture (zero new violations), 13 focused API unit tests and the disposable
integration journey passed. Independent review subsequently confirmed the source
corrections, including tenant revoke, effective roles, root-only admin invitations
and creation retry payload comparison.

Preview remains blocked on deterministic identity-race evidence: a microtask
yield does not prove database lock contention. The test must observe acceptance
waiting on the canonical identity lock before committing the competing change,
then assert denial with no partial relationship. Additional actual lock-order
and ended-membership checks are being added. The current direct-SQL deferred-FK
rollback assertion proves database behavior only, not router-command rollback.
Coordinator owns this blocker and integration immediately after acceptance.

### Setup/invitation checkpoint accepted

Final independent review found this scoped checkpoint eligible for preview. The
revised disposable test observes acceptance blocked on the canonical users lock,
then verifies changed identity denies acceptance without enrollment. Direct
repository probes prove recipient locks block competing updates and discovery
does not lock invitations. Ended staff cannot accept a new staff invitation;
independent athlete enrollment remains possible. Coordinator reran the final
disposable suite successfully under Node 24.

Full API unit suite: 2,303 passed. Full Core suite: 2,470 passed, 1 skipped.
API/Core typechecks and architecture passed. Initial quality:agent stopped on
task-file formatting/import ordering; corrected before checkpoint. Full quality
and remote publication remain separate gates, not claimed complete here.

Checkpoint endpoints: organizations.create, managementCapabilities,
invitations.create/accept/revoke. Invitation tokens are returned for explicit
sharing; no email delivery is implemented or claimed. Later staff lifecycle,
ownership transfer, invitation listing/decline, consent management, assignments,
organization-group management, rosters and audit querying remain unfinished.
No UI/UX or schema changes in this checkpoint.

### Live preview and publication separation

Setup/invitation checkpoint `8fd54c29bcf4ec34dc8cc7fe97f3346c0a5b6b58` is live at
preview `dd26a95235ce02d60659395b8aaac5d294062c7f`. Locked integration preserved
other features; ancestry, web health and Metro checks passed. All four write
procedures reject unauthenticated HTTP requests with 401 using contract epoch 3.
The initial probe omitted that required header and received 412; it was corrected
without changing code or data. Authenticated mutations were tested only against
disposable databases, not preserved preview data. No email delivery claimed.

Normal push was attempted but its whole-worktree hook overlapped the next group
implementation lane and encountered unfinished group DTO/union type errors. This
is not a valid quality result for the frozen setup checkpoint and no publication
success is claimed. Coordinator will serialize further publication with a stable
worker handoff; hooks remain enabled. Group implementation continues independently
and is not live. No remote PR has been created yet.

### Private organization-group checkpoint accepted

Implemented `organizations.organizationGroups.list/get/create/archive`,
`athletes.list/add/remove` and `coaches.list/assign/remove` with typed DTOs,
organization-first mutation locks and owner/admin authorization. No metadata edit,
community-group authorization reuse, private training projection or schema change.
Active-link retries are stable; ended links are never revived. Existing triggers
retain actor attribution and audit ownership.

Review caught future-effective manager membership and unscoped cursor anchors.
Both were fixed: current-time predicates apply to management and targets, and
each cursor anchor must belong to the requested tenant/group, retaining ended or
archived anchors for continuation. Final independent review found no remaining
concrete blocker. Coordinator reran both disposable integration journeys and
architecture successfully; worker API types and Biome passed. Tests include
ordinary admin success, future-member read/write denial, scoped cursors,
multi-page traversal, retries and archive behavior.

The full quality run before these fixes was deliberately cancelled to avoid
mixing code versions; it had passed all eight workspace typechecks. It is not a
complete release-gate result. This useful group checkpoint is proceeding to
locked preview integration before renewed publication on a stable checkout.

Group checkpoint `1ee02d00a1d78f3b1d26ed15045a7e8c6a040531` is live at preview
`2dadcc9ce145dc53a0a83a58539faedadb9296c4`. Locked ancestry and web/Metro health
passed; all ten group procedures registered and rejected anonymous requests401.
No preserved data writes, schema changes, or runtime restarts were needed.

Two stable-checkout publication attempts failed in unchanged UI suites: first a
native form timeout (isolated file subsequently passed17/17), then web timeouts
and fork-worker startup failures. Host observation after the latter: load average
346.59 and swap nearly full. Resource contention is a hypothesis being tested
with the unchanged UI suite limited to two workers; no assertions/timeouts/hooks
are weakened. No remote branch/PR publication is claimed. Blind retries stopped.

Independent next implementation slice: metadata-only staff/admin roster lists
and wrappers for existing end-membership, end-engagement and withdraw-consent
database commands. These remain in progress, not live. Publication will again
wait for a stable handoff; no whole-worktree gate overlaps active implementation.

### Lifecycle checkpoint accepted

Implemented `organizations.lifecycle.staff.list`, `adminRoster.list`,
`endMembership`, `endEngagement`, and `withdrawConsent`. Lists expose bounded,
tenant-scoped administrative metadata only. Commands derive actors from sessions
and invoke existing database functions once, retaining durable correlation replay,
atomic audit/cascade and exact-athlete consent authority. Missing organizations
fail closed. Command persistence resides in the lifecycle repository, not the
athlete-read repository. No schema or shared-data changes.

Final independent review found no remaining checkpoint blocker after explicit
non-root admin root-owner and consent-impersonation denial tests were added.
Coordinator final lifecycle live test and architecture passed; worker API types,
Biome and disposable DB coaching authorization matrix/concurrency passed. Full
API unit suite passed2,318 tests before the final relocation/test additions.
Direct assignments, grant/consent setup, role/suspension workflows, audit queries
and invitation listing/decline remain incomplete; no full-management completion
claim. Unchanged UI web suite passed202 tests with maxWorkers2, supporting a
reduced-concurrency publication attempt without relaxing test assertions.
