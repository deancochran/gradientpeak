# GradientPeak

GradientPeak is a monorepo for the web, mobile, API, core domain logic, and database tooling that power the product.

## Repository layout

- `apps/mobile` — Expo application
- `apps/web` — Next.js application
- `packages/api` — server procedures and backend-facing application logic
- `packages/core` — database-independent domain logic, schemas, and calculations
- `packages/db` — Drizzle schema, migrations, validation, seeds, and local database tooling

## Database ownership

`packages/db` is the database source of truth.

- Drizzle schema: `packages/db/src/schema/**`
- Baseline migration: `packages/db/drizzle/0000_baseline.sql`
- Local stack assets: `packages/db/supabase/**`

Use these commands for database work:

```bash
pnpm db:migration:new <name>
pnpm --filter @repo/db db:migrate
pnpm db:reset
pnpm self-host:up
pnpm self-host:down
```

## Development

Install dependencies:

```bash
pnpm install
```

Start local development:

```bash
pnpm dev
```

Run verification:

```bash
pnpm check-types
pnpm lint
pnpm test
```

## Environment

- Root application environment files live at the repo root or app level as appropriate.
- Local Supabase CLI overrides, if needed, should live in `packages/db/supabase/.env` or `.env.local`.
- Database tooling expects `DATABASE_URL` or `POSTGRES_URL`.

## Notes

- Keep business logic in `packages/core` database-independent.
- Keep relational schema and migration changes in `packages/db`.
- App runtime Supabase usage for storage, auth, and provider integrations may still exist outside the DB package; that is separate from relational schema ownership.
