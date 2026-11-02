# Coaching database foundation

## Scope

Database-only implementation of the agreed declarative organization foundation.
API orchestration, Core domain-contract expansion, UI, billing and automation are
separate follow-up work. Workspace is the interface to an organization, not a new
entity. One profile can be staff and athlete in the same organization and can
participate in multiple organizations.

Reuse existing organization memberships, additive role grants, coaching
engagements, direct coaching assignments, consent policies/grants and audit events.
Add organization invitations, private organization groups, group athlete links
referencing engagements, and group coach assignments referencing staff membership.
Preserve existing public/community groups and their authorization semantics.

## Source baseline

- Feature branch: `feat/coaching-database-foundation`.
- Created from fetched `origin/main`: `c7072ca839ca646f9a8db470af26756b8327cbe7`.
- Required existing organization foundation comes from source checkpoint
  `1d5ac63ab7ad7a89b25bdfd1dec9a63f5b770ce4` on
  `migration/main-preview-baseline`, not from preview.
- Local prerequisite merge: `c6fa78f1285054cdcac16d689cb9ebedc747d5cd`.
- This prerequisite includes substantial existing baseline work not yet in remote
  main. The database feature must be reviewed relative to that prerequisite;
  publishing a draft must disclose the larger main-relative dependency. Do not
  auto-merge the entire baseline as though it were an independently verified small
  database patch.

## Safety and acceptance contract

- Every new relationship is organization-scoped with composite foreign keys.
- Root owner/admin controls invitations and roster/assignment changes. Roster
  changes are authorization changes, not low-privilege cosmetic edits.
- Coach reads require active organization, membership, coach grant, engagement,
  scope consent, and a direct or group-derived assignment.
- Group participation never grants peer access, consent, calendar writes or
  ownership of athlete history. Personal self-access remains independent.
- Retain relationship history; enforce current-row uniqueness and chronology.
- Role revocation and group archive must deny group-derived access even when
  retained link records exist. Removing one path preserves another valid path.
- Use the existing organization lock protocol for authorization and authority
  lifecycle changes. Verify tenant mismatch, role loss, overlapping paths,
  group lifecycle, same-person staff/athlete, and concurrent access/revocation.
- Invitations need verified recipient binding and transactional acceptance. The
  database slice must clearly distinguish stored constraints from API acceptance
  workflows that are not yet implemented. Invitation acceptance never implies
  sharing consent.
- New tables require explicit ACL/RLS treatment. Do not infer protection merely
  from an organization ID or test only with a database owner role.
- Source baseline and generated artifacts follow the DB package workflow.
  Fresh/disposable-target success is not preserved-target migration evidence.
- No shared/hosted database resets or seeding. User subsequently explicitly
  approved a narrow data-preserving upgrade-policy exception for preview, with
  transactional preconditions, verification and a recovery backup. This is not
  permission to replay the fresh baseline or migrate unrelated targets. Preview
  integration requires compatibility evidence and the shared lock.

## Current disposition

Implementation in progress; not live. Database worker owns `packages/db/**`;
coordinator owns review, commit, publication and preview disposition. API/Core
feature work has not started. Verification and exact checkpoint evidence will be
recorded here after implementation and review.

### Preview upgrade preparation

User confirmed the database foundation must be applied to preview before API/Core
work begins, then explicitly approved the one-time data-preserving upgrade
exception. The DB package otherwise supports only fresh-baseline installation.

Read-only target verification: preview web's existing DATABASE_URL and POSTGRES_URL
both select the loopback PostgreSQL database `postgres` on port `54322`, mapped to
`supabase_db_gradientpeak`. No credentials were copied or printed. PostgreSQL and
pg_dump are both 17.6. Existing organization tables are present; the proposed
organization_groups and organization_invitations tables are absent. The separate
retained E2E database on port `55322` is not authorized for mutation by this task.

During activation, the coordinator will hold the shared-preview lock, verify the
target and expected pre-upgrade fingerprint, create a private recovery backup,
apply only the reviewed transactional upgrade, verify post-upgrade schema/security
and affected runtime health, and record the exact source/preview checkpoints. No
schema mutation has occurred during this preparation.

Pre-upgrade read-only fingerprint verification passed against the preview target:
75 managed tables match the existing preview schema. A private custom-format
PostgreSQL 17.6 recovery archive was created under the shared-preview lock; its
archive inventory is readable. Archive file permissions are 0600 and its directory
is 0700 outside Git. Full restore rehearsal has not yet been performed. The
initial `/tmp/opencode` backup-directory attempt failed because that directory is
root-owned; the successful archive uses the coordinator-owned private cache
instead. No privilege escalation, target reset or data mutation was used.

### Initial implementation verification

Worker returned four-table schema/baseline, relations/types, lifecycle triggers,
group-derived read authorization and focused regression cases. Package typecheck,
baseline structure check and diff whitespace check passed. Package lint completed
with two existing noSecrets warnings. Live authorization verification timed out
twice and is not passing evidence; mandatory db:verify, generated fingerprint and
preserved upgrade remain pending.

The disposable harness explicitly creates uniquely named test databases on the
repository-managed PostgreSQL server, independently of the preserved `postgres`
database. Coordinator inspected the two task-created authorization databases from
the timed-out runs under the preview lock, verified both had no active sessions,
and dropped only those exact disposable targets. Preserved preview and retained
E2E data were untouched. Timeout diagnosis and completion of the supported test
workflow are in progress; a separate read-only security review is also running.

### Recovery and review findings resolved locally

The timeout was a pool self-deadlock in the new regression: it held the sole
checked-out connection and then called pool.query. Using that existing client
resolved it. The authorization suite now passes, including the added group cases.
The coordinator took over implementation after the incomplete worker handoff.

Independent review findings prompted future-membership rejection/read gating,
organization-lock fencing for all group authority writes, scoped archive/removal
actors, immutable lifecycle checks, audit events, and profile-bound invitation
acceptance. Further regressions prove consent/role loss, overlapping direct/group
grants, same-person staff+athlete, invitation recipient/replay checks, and both
read-first/writer-first orders for group archive and both link removals.

Fresh verification exposed an ACL-checker inventory omission and PostgreSQL 17's
MAINTAIN grant from GRANT ALL. The four new tables now have explicit SELECT-only
service-role ACLs, including MAINTAIN revocation; the security checker recognizes
them as protected coaching tables. The fresh-install verification passed parity,
fingerprint, storage, ACL/RLS/switched-role checks, SQL lint and empty schema diff.

A bounded generated upgrade and guarded runner now exist outside active fresh
migrations. Disposable prerequisite-to-upgrade proof passed: retained profile
unchanged, exact new fingerprint, unexpected-schema/already-installed refusal,
and the full authorization/concurrency suite. Final reruns, review, publication,
and preview activation are still required before claiming live delivery.

The full `pnpm --filter @repo/db db:verify` subsequently passed, including upgrade
proof, two fresh installs with identical fingerprints, switched-role security,
549 Core/SQL authoring boundary cases, and the existing query-plan checks. Final
review then required additional operator protections: exact generated-SQL/source
matching and a private recovery manifest binding archive digest, target, creation
time and prerequisite fingerprint. These are implemented with tamper regressions.
Invitation closure now records a current administrative actor independently of
the inviter, so the owner can revoke invitations after an inviter loses authority;
acceptance still requires the inviter's current authority. The final DB gate is
being rerun after these fixes. No preview schema change has yet occurred.
