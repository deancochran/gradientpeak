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
pnpm --filter @repo/db db:migration:new <name>
pnpm --filter @repo/db db:migrate
pnpm --filter @repo/db seed-templates
pnpm --filter @repo/db seed-training-plans
pnpm --filter @repo/db self-host:up
pnpm --filter @repo/db self-host:down
```
