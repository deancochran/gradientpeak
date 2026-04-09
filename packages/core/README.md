# @repo/core

`@repo/core` owns shared business logic, calculations, schemas, and package-level domain contracts.

## Rules

- Keep public exports framework-free and database-client free.
- Put reusable domain logic here when it should behave the same on web, mobile, and server.
- Adapt app or DB-specific shapes at the edge before they cross into core.

## Main areas

- `calculations/` for metrics, zones, and training math.
- `schemas/` for Zod contracts shared across apps and APIs.
- `plan/`, `goals/`, and related folders for training-plan logic.
- `index.ts` for stable package exports.

## Commands

Run from the repo root:

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test
```

## Notes

- Prefer pure functions and deterministic helpers.
- Avoid React, Supabase clients, and app runtime wiring in public core modules.
- Keep the README high-level; package behavior should stay discoverable in code and tests.
