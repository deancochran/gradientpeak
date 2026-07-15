# Activity evidence backfill

Use this one-time internal command to reconcile generated best-effort and activity-file LTHR evidence for every activity that has a stored artifact. It does not update activity summaries, geometry, weather, provider data, or manual evidence.

## Safety contract

- Dry-run is the default. Writes require the exact `--confirm` flag.
- Profiles run with bounded concurrency (default `2`, maximum `8`); each profile's activities replay in `finished_at`, then activity-ID order.
- Each profile uses one database transaction. It acquires the profile-level PostgreSQL transaction advisory lock before the first threshold read and holds it through every analysis and reconciliation in that profile.
- Dry-run executes the same inserts, updates, and deletes as write mode inside that transaction. Later activities therefore observe generated threshold and effort evidence from earlier activities. The successful dry-run is then deliberately rolled back; write mode commits instead.
- A download or parse failure prevents that profile's replay from starting. An analysis or reconciliation failure rolls back every database change for that profile. Other profiles continue.
- Generated rows are matched by their stable evidence identity. Existing row IDs are retained, missing rows are inserted, and obsolete generated rows are deleted.
- Manual evidence is never selected for update or deletion.
- There is no checkpoint or backfill table. A restart intentionally begins at the start; reconciliation is idempotent.
- Output contains aggregate counts only. It omits profile IDs, activity IDs, file paths, and raw errors.

## Database and storage effects

Both modes list activity rows and download each referenced artifact from the `activity-files` bucket. The command never uploads, replaces, moves, or deletes Storage objects.

For a successfully replayed profile, dry-run temporarily mutates `activity_efforts` and `profile_metrics` only, under the profile lock, and rolls those mutations back atomically. Write mode performs the identical reconciliation and commits those two tables atomically for that profile. No activity, summary, geometry, weather, provider, checkpoint, or backfill-table data is written. Generated rows retain stable IDs when their natural evidence identity already exists; manual rows are outside update and delete selection.

## Prerequisites

Run from the repository root with the API's normal server-side database and Supabase Storage environment configured. Confirm the target environment independently before enabling writes.

## Procedure

1. Preview all sports without writes:

   ```sh
   pnpm --filter @repo/api backfill:activity-evidence
   ```

2. Review the single JSON aggregate. `profilesSucceeded` counts profiles whose complete replay finished (and was rolled back in dry-run); `profilesFailed` counts profiles skipped for artifact preparation failure or rolled back for replay failure. Artifact failure fields count affected artifacts, while `reconciliationFailures` counts failed profile transactions. Any failure produces a non-zero exit status. Resolve failures before writing.

3. Run the controlled write pass:

   ```sh
   pnpm --filter @repo/api backfill:activity-evidence -- --confirm
   ```

   To lower or raise profile concurrency within the enforced bound:

   ```sh
   pnpm --filter @repo/api backfill:activity-evidence -- --confirm --concurrency 1
   ```

4. Run the dry-run command again. Expected insert/delete counts are zero; updates may still be reported because deterministic generated values are reconciled in place even when unchanged.

## Failure and restart

The command isolates database effects and failures at profile granularity, continues with other profiles, then exits non-zero with sanitized aggregate counts. Re-run from the beginning after correcting storage, parsing, or database issues. Do not add a cursor or manually skip records: chronological, stateful replay is required for historical LTHR promotion, and stable reconciliation makes replay safe.
