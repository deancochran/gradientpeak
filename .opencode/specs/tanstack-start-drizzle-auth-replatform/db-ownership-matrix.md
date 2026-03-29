# DB Ownership Matrix

## Purpose

Map current Supabase-owned relational concerns to their future Drizzle or infra owner.

## Current To Future Ownership Map

| Current concern | Current owner | Future owner | Outcome | Notes |
| --- | --- | --- | --- | --- |
| Relational schema truth | `packages/supabase` SQL + generated types | `packages/db` Drizzle schema | move | Drizzle becomes authoritative |
| Migration history | `packages/supabase/migrations` | `packages/db` Drizzle migrations | move | conversion strategy must be explicit |
| App-facing relational types | `packages/supabase/database.types.ts` | Drizzle-derived contracts and DB types in `packages/db` | move/retire | keep Supabase-generated types only where platform-specific |
| Generated Zod schemas | `packages/supabase/supazod/*` | validation in `packages/db` | move/replace | use schema-derived validation where useful |
| Relational seed scripts | `packages/supabase/scripts/*` and `seed.sql` | `packages/db` seeds/utilities | move | keep platform-only seeds separate |
| DB client usage in app API | Supabase client semantics in `packages/trpc` | Drizzle DB access via `packages/db` | move | major router refactor surface |
| Supabase CLI config | `packages/supabase/config.toml` and local stack files | retained Supabase infra | keep | platform concern |
| Supabase storage/functions/policies | `packages/supabase` | retained Supabase infra | keep | if still used |

## Query Ownership Map

| Current query pattern | Current owner | Future owner |
| --- | --- | --- |
| API layer relational reads via Supabase client | `packages/trpc` | `packages/api` calling `packages/db` |
| API layer relational writes via Supabase client | `packages/trpc` | `packages/api` calling `packages/db` |
| Schema-derived app validation from Supabase artifacts | mixed | `packages/db` and app/domain packages as appropriate |

## Package Boundary Rules

- `packages/db` owns relational schema, migrations, relations, and typed DB access
- retained Supabase infra owns platform configuration, local stack, storage, functions, and similar provider-specific concerns
- `packages/core` must not import Drizzle runtime or Supabase runtime
- `packages/api` should consume `packages/db`, not rebuild DB ownership internally

## Decisions Still Required

- how to convert or supersede existing SQL migration history
- whether any generated Supabase types remain needed for non-relational/provider-specific areas
- where DB-facing validation belongs when logic overlaps with `packages/core`

## Completion Condition For This Artifact

- every current relational concern owned by `packages/supabase` has a final owner
- every retained Supabase concern is clearly marked as platform-only
- the DB boundary between `packages/db` and Supabase infra is unambiguous
