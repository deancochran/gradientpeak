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
- `supabase/migrations/` contains exactly one transactional fresh-only MVP baseline.
- This development baseline is replaced as one artifact; there is no migration ledger, forward path, or data backfill.
- Drizzle has no deploy command. Its config points at the Supabase authority, while Studio remains available for inspection.

## Common commands

Keep DB env files under `packages/db/`. Use `packages/db/.env.example` as the local template when you need explicit DB connection values.

For ordinary product development, `turbo run dev` starts the local Supabase setup automatically.
Use the commands below when you are working on database ownership, diagnosing local infrastructure,
or running database-specific verification.

```bash
pnpm --filter @repo/db self-host:up
pnpm --filter @repo/db db:verify:static
pnpm --filter @repo/db db:verify
pnpm --filter @repo/db db:activity-plan-authoring:test
pnpm --filter @repo/db db:baseline:check
pnpm --filter @repo/db db:e2e:start
pnpm --filter @repo/db db:e2e:migrate
pnpm --filter @repo/db db:e2e:status
pnpm --filter @repo/db db:e2e:stop
pnpm --filter @repo/db db:fresh:verify
pnpm --filter @repo/db db:reset:mvp # destructive: repository-managed local DB only
pnpm --filter @repo/db db:schema:check
pnpm --filter @repo/db db:schema:fingerprint
pnpm --filter @repo/db db:fresh:verify -- --write-fingerprint # only sanctioned fingerprint writer
pnpm --filter @repo/db db:lint:local # explicit shared-local diagnostic only
pnpm --filter @repo/db seed-templates
pnpm --filter @repo/db seed-training-plans
pnpm --filter @repo/db self-host:down
```

## Fresh-only baseline workflow

`supabase/migrations/` contains one transactional MVP baseline. A fresh disposable database is the only supported installation target.

1. Consolidate existing baseline and forward SQL into the one baseline, preserving unrelated DDL, policies, functions, grants, and storage assets. Strip only outer migration `BEGIN`/`COMMIT` wrappers; procedural blocks remain intact.
2. Run `db:baseline:check` to require one transactional MVP baseline and reject reintroduced Drizzle mirror, policy, or active-ledger artifacts.
3. Run `db:fresh:verify` or `db:verify` only against guarded disposable local targets. They apply the ordered migration set, then verify parity, fingerprint, storage, security, lint, and an empty schema diff.
4. `db:diff` builds that same disposable target and requires an empty public-schema shadow diff.
5. `db:reset:mvp` is the only reset command. It accepts no flags, validates the one baseline first, refuses any configured database other than the repository-managed local target, runs `supabase db reset --local`, then seeds the Core-owned activity and training-plan catalogues. It discards that local target's data and restores each system row's Core key, version, and content hash; it never accepts linked or URL targets.

The dedicated `gradientpeak_e2e` project uses ports 55320–55329 and durable data across ordinary stop/start. `db:e2e:migrate` bootstraps only a genuinely empty public schema, then uses Supabase migration history to apply pending migrations. Its fail-closed guards reject the manual project and ports.

The checked-in fingerprint covers every public relation and sequence (including unmanaged extras), managed columns/defaults/indexes/constraints/enums, RLS and ACL state, default privileges for policy-declared owners, policy-declared extensions, public/auth functions and triggers, and owned storage buckets/policies. Supabase platform extensions and platform-role default privileges are intentionally outside repository ownership and are not serialized as environment noise. Update the fingerprint only with `db:fresh:verify -- --write-fingerprint`; direct edits and unguarded writers are unsupported.

`db:verify:static` needs no database. `db:verify` builds fresh disposable targets twice, fingerprints all owned surfaces, checks storage/security, lints them, verifies empty diffs, and rejects zero, multiple, stale, or mismatched active baseline artifacts.

### Activity-plan authoring and revision ownership

`20260929000000_fixed_v4_activity_plan_contract.sql` is a hard V4 cutover: the fixed V4 `blocks` structure replaces V3/adaptive prescriptions, the `adaptation` column is removed, and semantic hashes use the V2 contract. It fails closed with SQLSTATE `55000` if `activity_plans` or `planned_sessions` contains rows, before any destructive DDL. Repository-managed local targets must therefore be reset and reseeded; the migration chain remains valid for a fresh target.

New inserts and semantic edits must supply matching Core structure and semantic SHA-256 hashes. The guard rejects stale or forged values with `23514 / activity_plans_hash_guard / ACTIVITY_PLAN_HASH_MISMATCH`; it does not silently regenerate them. PostgreSQL owns the revision increment for `structure` and `training_intent`, so a caller-supplied revision cannot suppress or multiply it. Metadata-only writes retain the revision. The V4 validator permits optional step text, explicit trimmed block `name` overrides, and untargeted steps while bounding the fixed structure, expansion, and explicit duration. A block `name` is persisted only when explicitly supplied, participates in both hashes and a structure revision, and is not a stored automatic/derived label; clearing it omits it from JSON.

`scripts/activity-plan-sql-artifacts.ts` pins activity-plan function definitions to migration SQL for local materialization and excludes them from developer-database introspection. `db:activity-plan-authoring:test` applies the actual migration chain in guarded disposable databases, verifies V4 shape, hash guarding, and revision ownership, then independently tests the pinned V4 validator in an empty target. It never resets the persistent materialization or development database.

The API-owned consumer regression runs with `pnpm --filter @repo/api test:activity-plan-authoring:disposable`. It uses the exported guarded disposable harness and passes actual saved rows through the API resolver after repairs and semantic updates. DB parity tests depend on Core contracts only; they do not import API implementation code.

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
