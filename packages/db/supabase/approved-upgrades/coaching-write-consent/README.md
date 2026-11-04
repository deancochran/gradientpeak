# Coaching write consent — local checkpoint

## Retained E2E activation evidence

The user subsequently authorized a backed-up, rehearsed additive upgrade of
`gradientpeak_e2e` only. The coordinator completed the private full-archive restore
rehearsal and applied the reviewed operation under the retained-E2E maintenance
lock. Exact pre-existing row digests were preserved, no write grants were created,
and `db:e2e:status` passed with fingerprint `3639a886c809`. Node 24.19.0 full
`db:verify`, explicit operation guards, and the wired coaching upgrade suite passed.
Independent review found no additional source-level activation defect; its required
runtime evidence was satisfied before application. The recovery archive and receipts
remain private, outside Git. No reset, reseed, or migration-ledger edit was performed.

This E2E approval does not authorize preview schema activation. Preview remains
blocked pending separate target approval, preflight, backup/rehearsal and exclusive
maintenance ownership. Authenticated grant/revoke and delegated writes remain
unfinished product work; database activation is not end-to-end acceptance.

This additive upgrade has a bounded, E2E-only operational runner. It is not a
general migration path: the coordinator alone owns any preserved-target
execution after maintenance ownership, a fresh private archive, and a successful
isolated restore rehearsal are in hand. It never targets preview.

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

## E2E-only operational procedure

Preview integration is intentionally unsupported. The runner refuses every target
except the literal `supabase_admin@127.0.0.1:55322/postgres` connection and checks
the running `supabase_db_gradientpeak_e2e` Docker identity, namespace labels, and
loopback port. It does not create a backup, stop services, enter maintenance, reset,
seed, alter migration history, or restore an archive automatically.

The coordinator creates a private (`0700`) recovery directory with a fresh
`postgres.dump` custom archive and private adjacent `postgres.dump.manifest.json`.
The manifest must bind the archive hash, `e2e:127.0.0.1:55322/postgres`, timestamp
within one hour, and the exact canonical prerequisite fingerprint. Then rehearse:

```bash
COACHING_WRITE_CONSENT_RECOVERY_DIRECTORY=/private/recovery-directory \
COACHING_WRITE_CONSENT_SOURCE_DATABASE_URL='postgresql://supabase_admin:…@127.0.0.1:55322/postgres' \
pnpm --filter @repo/db exec tsx scripts/coaching-write-consent-operation.ts --rehearse
```

Only after the private `rehearsal-receipt.json` exists, the coordinator owns an
exclusive maintenance window, and source freshness remains valid, activation is:

```bash
COACHING_WRITE_CONSENT_DATABASE_URL='postgresql://supabase_admin:…@127.0.0.1:55322/postgres' \
COACHING_WRITE_CONSENT_BACKUP=/private/recovery-directory/postgres.dump \
COACHING_WRITE_CONSENT_REHEARSAL_RECEIPT=/private/recovery-directory/rehearsal-receipt.json \
pnpm --filter @repo/db exec tsx scripts/coaching-write-consent-operation.ts --apply-coaching-write-consent-upgrade
```

The operation takes the organization lock plus access-exclusive locks on every
reviewed pre-existing public/auth/storage/migration-ledger table, then changes to
the existing `postgres` DDL role. It compares the exact before fingerprint and
full per-row retained-data digests under those locks, applies only the approved
SQL, requires zero manufactured write grants, and rolls back on any data or exact
after-fingerprint mismatch. Its receipt binds the archive hash, both artifact
hashes, source data digest, and Docker/database identity, so a stale archive,
rehearsal, target, or source is refused.

The prerequisite fingerprint is pinned to commit
`7cf88482037dba81f2d7a00311661f4627fc63fc`; unexpected or already-upgraded targets refuse.
The SQL inventory guard validates statement families and names, not function-body
semantics. No preserved data reset, consent backfill, or outbound activation is
authorized by this artifact.
