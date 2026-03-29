# Drizzle baseline strategy

## Goal

Create one fresh Drizzle-owned baseline from the current relational state, then stop extending the legacy Supabase SQL chain for app-owned relational changes.

## Lane outcome

- `packages/db` now owns the Drizzle package boundary, schema modules, and Drizzle-Zod export surface.
- The initial schema slice covers the shared enums plus the highest-churn app tables used for current relational contracts.
- The executable baseline SQL is intentionally deferred until the full table port is complete, so we do not publish a partial baseline as authoritative history.

## Authoritative migration policy

1. Freeze `packages/supabase/migrations` for relational app-schema changes once the remaining tables are ported into `packages/db`.
2. Hydrate a disposable local database with the current Supabase SQL history one final time.
3. Finish Drizzle table coverage in `packages/db/src/schema` until it matches that hydrated database.
4. Generate a single `0000_baseline.sql` from the Drizzle schema into `packages/db/drizzle`.
5. Apply that baseline to fresh environments only; existing environments record the baseline as already satisfied during cutover.
6. Add every forward relational migration after that baseline through Drizzle only.

## Why this is lowest risk

- It avoids replaying the long legacy SQL chain for new environments after cutover.
- It keeps current running environments untouched until Drizzle coverage is complete.
- It gives downstream packages a new import surface now without forcing query rewrites in the same lane.

## Cutover notes

- `packages/supabase` remains the owner of Supabase CLI config, local stack assets, policies, functions, and other provider-specific files.
- Any missing tables should be added to `packages/db/src/schema` before generating the executable baseline.
- Consumers can begin swapping enum and row-schema imports to `@repo/db` before the full query migration starts.
