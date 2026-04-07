# @repo/db

`@repo/db` is the Drizzle-owned relational boundary for the replatform.

## Public contract

- `@repo/db`: package-level convenience export for client helpers, schema, and validation.
- `@repo/db/client`: environment and client-shape helpers used by downstream packages.
- `@repo/db/schema`: Drizzle enums, tables, relations, and inferred row types.
- `@repo/db/validation`: Drizzle-Zod schemas for the current app-owned relational slice.

## Source-of-truth rules

- Drizzle schema in `src/schema/**` is the future relational source of truth.
- `drizzle/baseline-strategy.md` defines the fresh-baseline cutover policy.
- `packages/supabase` remains the owner of Supabase CLI config, functions, policies, templates, and other provider-specific assets.
- `packages/supabase` generated relational types and schemas are temporary compatibility artifacts during migration, not the long-term contract.

## Current schema coverage

Wave 1 intentionally ports the most commonly shared public tables first so `packages/api` can start consuming Drizzle-owned enums, row shapes, and validation without waiting for the entire schema port.
