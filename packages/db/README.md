# @repo/db

`@repo/db` owns the relational database contract and local database tooling.

## Exports

- `@repo/db`: package-level convenience export for client helpers, schema, and validation.
- `@repo/db/client`: environment and client-shape helpers used by downstream packages.
- `@repo/db/schema`: Drizzle enums, tables, relations, and inferred row types.
- `@repo/db/validation`: Drizzle-Zod schemas for the current relational slice.

## Source of truth

- Drizzle schema in `src/schema/**` is the relational source of truth.
- `drizzle/0000_baseline.sql` is the fresh-environment baseline generated from that schema.
- `drizzle/baseline-strategy.md` documents the baseline cutover policy.
- `supabase/` holds the retained local Supabase CLI assets used by DB-owned local workflows.

## Common commands

Keep DB env files under `packages/db/`. Use `packages/db/.env.example` as the local template when you need explicit DB connection values.

```bash
pnpm --filter @repo/db self-host:up
pnpm --filter @repo/db db:reset
pnpm --filter @repo/db db:verify:static
pnpm --filter @repo/db db:verify
pnpm --filter @repo/db db:schema:check
pnpm --filter @repo/db db:lint
pnpm --filter @repo/db db:migration:new <name>
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db seed-templates
pnpm --filter @repo/db seed-training-plans
pnpm --filter @repo/db self-host:down
```

## Migration workflow

1. Change `src/schema/**` first when the object is Drizzle-managed.
2. Generate or write the matching migration in `supabase/migrations/`.
3. Reset or migrate a local Supabase database before treating the change as ready.
4. Run `pnpm --filter @repo/db db:schema:check` to catch schema drift.
5. Run `pnpm --filter @repo/db db:lint` for Supabase linter coverage when the local stack is available.
6. Run `pnpm --filter @repo/db check-types` and `pnpm --filter @repo/db lint` before handing off DB changes.

`pnpm --filter @repo/db db:verify` runs the package type check, package lint, schema parity check, and Supabase DB lint in one pass against the local database.

`pnpm --filter @repo/db db:verify:static` runs the package type check, package lint, and Drizzle migration check without requiring local Supabase. Use it in CI and quick handoffs when Docker/local database services are unavailable.

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
