# Coaching write consent — local checkpoint

This additive upgrade is prepared for review and disposable verification only.
The user authorized local schema/artifact work and fresh disposable tests, not
shared/authoritative schema application. No shared-target apply command is provided.

## Contract

- `training_assignment` and `schedule_modification` require distinct athlete write
  grants; existing read consents never confer write authority.
- Policy versions and grant bindings are immutable; grants permit one revocation.
- The decision function requires an active direct coach assignment and effective,
  unrevoked, unexpired scope-specific grant. Group assignments do not confer writes.
- Future grant/revoke commands must authenticate the athlete and lock the organization
  first. Delegated commands must authorize and mutate in the same transaction.
- Authenticated grant/revoke commands and delegated training/calendar APIs are not
  delivered by this DB/Core checkpoint.

## Evidence

Coordinator verification under Node 24.19.0 passed `pnpm --filter @repo/db db:verify`,
including both fresh-schema runs, security/ACL/RLS checks, historical auth upgrades,
read/write authorization, additive upgrade retention and rollback, and query plans.
Focused tests observe two-client organization-lock blocking through
`pg_blocking_pids`; the upgrade test retains existing read consent, engagement and
assignment rows, rejects unexpected SQL/preconditions, and forces post-DDL failure
to prove rollback. Independent reviews found no remaining actionable defect in
the schema or upgrade/test scope. This is not deployed-role end-to-end API proof.

## Activation blocker

Preview integration of this schema checkpoint is intentionally blocked. The
coordinator must obtain separate shared-schema authority and perform a backed-up,
rehearsed upgrade under exclusive maintenance ownership before dependent activation.
The prerequisite fingerprint is pinned to commit
`7cf88482037dba81f2d7a00311661f4627fc63fc`; unexpected or already-upgraded targets refuse.
An organization table lock does not exclude unrelated concurrent DDL writers.
The SQL inventory guard validates statement families and names, not function-body
semantics. No preserved data reset, consent backfill, or outbound activation is
authorized by this artifact.
