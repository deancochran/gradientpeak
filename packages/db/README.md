# @repo/db

`@repo/db` owns the relational database contract and local database tooling.

The semantic usage contract for athlete observations and effort curves is documented in
[`ACTIVITY_EVIDENCE_CONTRACT.md`](./ACTIVITY_EVIDENCE_CONTRACT.md).

## Exports

- `@repo/db`: package-level convenience export for client helpers, schema, and validation.
- `@repo/db/client`: environment and client-shape helpers used by downstream packages.
- `@repo/db/schema`: Drizzle enums, tables, relations, and inferred row types.
- `@repo/db/validation`: Drizzle-Zod schemas for the current relational slice.

## Source of truth

- Drizzle schema in `src/schema/**` is the relational source of truth.
- `supabase/migrations/` is the only deployable migration authority.
- `drizzle/deploy/` is a byte-equivalent review/tooling mirror, never a second authoring location.
- `supabase/migrations/` contains exactly the generation-2 hard-reset baseline. `drizzle/deploy/` contains only its byte-identical mirror.
- `supabase/migrations-archive/` preserves the flat generation-0 archive and `generation-1/` chain byte-for-byte; neither is read by the Supabase CLI.
- `migration-policy.json`, `migration-lock.json`, and `migration-ledger.json` define the sole supported endpoint. Generation-0/1 ledger evidence is historical only.
- Drizzle has no deploy command. Its config points at the Supabase authority, while Studio remains available for inspection.

## Common commands

Keep DB env files under `packages/db/`. Use `packages/db/.env.example` as the local template when you need explicit DB connection values.

```bash
pnpm --filter @repo/db self-host:up
pnpm --filter @repo/db db:verify:static
pnpm --filter @repo/db db:verify
pnpm --filter @repo/db db:migration:check
pnpm --filter @repo/db db:schema:check
pnpm --filter @repo/db db:schema:fingerprint
pnpm --filter @repo/db db:lint:local # explicit shared-local diagnostic only
pnpm --filter @repo/db seed-templates
pnpm --filter @repo/db seed-training-plans
pnpm --filter @repo/db self-host:down
```

## Migration workflow

1. Generation 2 is hard-reset-only: do not add migrations, run migration repair, use migration up/down, or apply the baseline to an existing object graph. The package intentionally exposes no reset/update/downgrade alias; verification creates guarded disposable local targets only.
2. Run `db:migration:check`; it verifies the sole active baseline, byte-identical mirror, recursive archive lock, hash, and exact active ledger.
3. Run `db:verify`. Its create/drop operations require both `--disposable` and `--local`, enforce a localhost URL, and never inspect or mutate the shared local database.
4. `db:diff` builds the same disposable authoritative target, runs Supabase lint against it, and requires an empty public-schema shadow diff.

The checked-in fingerprint covers every public relation and sequence (including unmanaged extras), managed columns/defaults/indexes/constraints/enums, RLS and ACL state, default privileges for policy-declared owners, policy-declared extensions, public/auth functions and triggers, and owned storage buckets/policies. Supabase platform extensions and platform-role default privileges are intentionally outside repository ownership and are not serialized as environment noise. Update the fingerprint only from the guarded disposable fresh target.

`db:verify:static` needs no database. `db:verify` builds a fresh disposable target, fingerprints all owned surfaces, checks storage/security, lints it, verifies an empty diff, and rejects old, partial, and mixed ledgers. No shared-local ledger diagnostics or upgrade workflow exists.

## Generation 2 baseline

Generation 2 was generated from a guarded disposable target after applying generation 1 and the reviewed redundant-`idx` contract with transaction-local acknowledgements. It is not a Supabase migration squash: schema-only squash output omits DML and storage state, so the checked baseline explicitly includes owned storage buckets/policies and the `auth.users` profile trigger. The baseline directly contains the final contract: only `profile_metrics.idx` remains, while `provider_sync_jobs.queue_sequence` remains the identity ordering key.

The old flat generation-0 archive, generation-1 chain, pre-reconciliation ledger, final generation-1 ledger, and mismatch catalog are retained as immutable historical evidence. They are unsupported endpoints. Never run migration repair against an environment; recreate a disposable database instead.

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
