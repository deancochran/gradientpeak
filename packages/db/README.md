# @repo/db

`@repo/db` owns the relational database contract and local database tooling.

## Exports

- `@repo/db`: package-level convenience export for client helpers, schema, and validation.
- `@repo/db/client`: environment and client-shape helpers used by downstream packages.
- `@repo/db/schema`: Drizzle enums, tables, relations, and inferred row types.
- `@repo/db/validation`: Drizzle-Zod schemas for the current relational slice.

## Source of truth

- Drizzle schema in `src/schema/**` is the relational source of truth.
- `supabase/migrations/` is the only deployable migration authority.
- `drizzle/deploy/` is a byte-equivalent review/tooling mirror, never a second authoring location.
- `supabase/migrations-archive/` preserves the previous deployed files byte-for-byte; it is not read by the Supabase CLI.
- `migration-policy.json`, `migration-lock.json`, the pre/post ledger snapshots, and `migration-history-mismatches.json` define the cutover and its supported endpoints.
- Drizzle has no deploy command. Its config points at the Supabase authority, while Studio remains available for inspection.

## Common commands

Keep DB env files under `packages/db/`. Use `packages/db/.env.example` as the local template when you need explicit DB connection values.

```bash
pnpm --filter @repo/db self-host:up
pnpm --filter @repo/db db:reset
pnpm --filter @repo/db db:verify:static
pnpm --filter @repo/db db:verify
pnpm --filter @repo/db db:migration:check
pnpm --filter @repo/db db:schema:check
pnpm --filter @repo/db db:schema:fingerprint
pnpm --filter @repo/db db:lint:local # explicit shared-local diagnostic only
pnpm --filter @repo/db db:migration:new <name>
pnpm --filter @repo/db db:migration:sync
pnpm --filter @repo/db seed-templates
pnpm --filter @repo/db seed-training-plans
pnpm --filter @repo/db self-host:down
```

## Migration workflow

1. Change `src/schema/**` first when the object is Drizzle-managed.
2. Create exactly one timestamp with `pnpm --filter @repo/db db:migration:new <name>`.
3. Author SQL only in the new `supabase/migrations/` file, then run `db:migration:sync` to regenerate its `drizzle/deploy/` mirror.
4. Run `db:migration:check`. It rejects duplicate versions/content, archive mutation, baseline hash drift, stale mismatch catalogs, and byte-level mirror drift.
5. Run `db:verify`. Its create/drop operations require both `--disposable` and `--local`, enforce a localhost URL, and never inspect or mutate the shared local database.
6. `db:diff` builds the same disposable authoritative target, runs Supabase lint against it, and requires an empty public-schema shadow diff.

The checked-in fingerprint covers every public relation and sequence (including unmanaged extras), managed columns/defaults/indexes/constraints/enums, RLS and ACL/default ACL state, owned extensions, public/auth functions and triggers, and owned storage buckets/policies. Update it only from the guarded disposable fresh target.

`db:verify:static` needs no database. `db:verify` builds both fresh and upgrade disposable databases, verifies schema/data convergence, fingerprints all owned surfaces, checks storage/security, lints the same disposable target, and runs an empty diff. Shared-local ledger diagnostics are deliberately separate: `db:migration:ledger:pre` expects exactly 71 entries and `db:migration:ledger:post` expects exactly the four active entries.

## Baseline reconciliation

The old active chain could not build a fresh shadow: its first migration inserted into `training_plans` before that table was created. Rewriting that deployed SQL would invalidate history, so all 52 repository migration files are preserved exactly under `supabase/migrations-archive/`. The active `20260713034500_baseline.sql` is a schema-only snapshot of the verified managed database, followed by idempotent security/index migrations.

For a fresh target, run the active chain normally. For an existing pre-consolidation target, **do not execute the baseline over existing objects**:

1. Read that target's migration ledger and compare every version/name with `migration-ledger-pre.json`. Stop on any difference; partial/intermediate ledgers are unsupported.
2. Use Supabase `migration repair --status reverted` for each captured legacy version. This changes ledger metadata only; it does not undo SQL.
3. Use `migration repair --status applied 20260713034500` so the target records the schema it already has.
4. Re-list the ledger. Only then run normal migration-up for post-baseline files.

No reconciliation command is automated because it changes an environment ledger. Run it once per explicitly approved target after taking a backup. `migration-history-mismatches.json` explicitly records 36 ledger-only versions whose SQL is unavailable and 17 archive-only versions absent from the captured endpoint. The disposable upgrade fixture recreates the captured schema/71-entry ledger with representative data, performs metadata reconciliation, applies the three followups, and requires exact four-entry ledger, schema, storage, and data convergence. The security followup also restores hosted storage buckets and policies because existing targets skip the baseline.

The provider queue-sequence followup is expand-only: it adds and backfills `queue_sequence` while legacy `idx` columns and their relations remain available during the old-client soak. `transitional-schema-extras.json` declares those temporary physical extras so parity and fingerprint checks remain strict. `scripts/contract_redundant_idx_columns.sql` is never auto-applied; run it only in an explicitly approved quiescent transaction after the old-client soak. The disposable upgrade fixture proves both the expand state and the guarded final contract without changing a shared database.

Use idempotent DDL such as `create index if not exists` and `alter table if exists` for live-drift repair migrations. Use stricter DDL for new product schema where drift should fail loudly.

## Access model

Table access is backend-owned by default. Product surfaces should use tRPC/backend procedures rather than direct Supabase table reads or writes.

- Enable RLS for every table exposed through `public`.
- Do not add permissive RLS policies unless a direct Supabase client access path is intentional and documented.
- Keep credential-bearing tables service-only. This includes `accounts`, `sessions`, `integrations`, `oauth_states`, `verifications`, and provider sync tables.
- Prefer private schemas or narrow RPCs/views for operational diagnostics instead of exposing worker tables directly.
- Keep diagnostic views in `internal` and grant them only to `service_role` unless a user-facing contract is explicitly designed.

## Naming conventions

- Use `profile_id` for app-domain ownership and user-scoped rows.
- Use `user_id` only for Better Auth/auth-system tables or legacy table columns that already use that name.
- If a new table references the auth identity directly, name the column `auth_user_id` unless the table is part of the auth schema.
- Use constrained enums or check constraints for state-machine fields such as `status`, `role`, `provider`, and `resource_kind`.
- Prefer `created_at`, `updated_at`, and soft-delete `deleted_at` timestamp names consistently.
