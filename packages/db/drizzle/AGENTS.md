# Drizzle Migrations Guide

Use this file when working in `packages/db/drizzle`.

## Scope

- Forward database migrations.
- Baseline SQL artifacts.
- Migration metadata.
- Schema-change history for the relational layer, not product feature logic.

## Rules

- Add descriptive forward migrations that match the current schema intent.
- Keep migration changes aligned with `packages/db/src/schema/**` ownership.
- Treat old migrations and baseline files as historical artifacts unless there is a clear reason to touch them.
- Review generated SQL before committing it, especially for renames, drops, type changes, and constraint rewrites.
- Prefer additive and operationally safe migration steps, and split backfill, default, and constraint enforcement when data preservation matters.
- Use custom SQL only when the change cannot be represented safely or clearly through normal Drizzle migration generation.

## Avoid

- Rewriting migration history casually.
- Mixing product logic into migration files.
- Making schema changes without a corresponding ownership-aware migration plan.

## References

- https://orm.drizzle.team/docs/migrations
- https://orm.drizzle.team/docs/kit-custom-migrations
- https://www.postgresql.org/docs/current/ddl-alter.html
- https://supabase.com/docs/reference/cli/usage#supabase-migration-new
- https://supabase.com/docs/reference/cli/usage#supabase-db-diff
- https://supabase.com/docs/reference/cli/usage#supabase-db-reset
