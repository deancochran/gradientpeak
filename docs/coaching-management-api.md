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
