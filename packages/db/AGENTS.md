# DB Package Guide

Use this file when working in `packages/db`.

## Stack

- Drizzle ORM.
- Drizzle Kit.
- PostgreSQL.
- Supabase local tooling.
- Zod-backed schema validation.

## Scope

- Relational schema and inferred DB types.
- Drizzle migrations and baseline strategy.
- Local DB tooling and retained Supabase CLI assets.

## Source Of Truth

- `src/schema/**` is the relational source of truth.
- `drizzle/` contains migration artifacts and baseline SQL.
- `supabase/` contains DB-owned local workflow assets.

## Rules

- Keep schema, validation, and migration changes aligned.
- Treat DB changes as high-impact and prefer the smallest safe change.
- Preserve clear separation between relational ownership here and app or API logic elsewhere.
- Keep detailed migration process rules in nested files like `drizzle/` rather than expanding this package root file.
- Keep Drizzle config explicit about managed scope, connectivity, and Supabase-owned objects so diffs do not drift into unmanaged surfaces.
- Express invariants in PostgreSQL and Drizzle schema definitions with keys, nullability, uniqueness, checks, and foreign keys instead of relying on app-only validation.

## Conventions

- Export every managed schema object that Drizzle Kit must diff.
- Plan new validation work around Drizzle's first-class Zod support instead of expanding deprecated `drizzle-zod` usage.
- Use the local Supabase stack as the verification surface for DB work, including reset, diff, lint, and migration flows.

## Avoid

- Editing migrations casually without understanding downstream environments.
- Treating generated or baseline artifacts as ordinary app code.
- Moving app orchestration into DB-owned modules.

## Validation

- Use package or repo DB commands relevant to the change, including migration and local DB workflows.

## References

- https://orm.drizzle.team/docs/sql-schema-declaration
- https://orm.drizzle.team/docs/drizzle-config-file
- https://orm.drizzle.team/docs/zod
- https://www.postgresql.org/docs/current/ddl-constraints.html
- https://supabase.com/docs/guides/local-development/overview
- https://supabase.com/docs/reference/cli/usage#supabase-start
- https://supabase.com/docs/reference/cli/usage#supabase-db-lint
