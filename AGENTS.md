# GradientPeak Repo Guide

Use this file when working anywhere inside the product repo.

## Repo Map

- `apps/web` is the TanStack Start web product.
- `apps/mobile` is the Expo and React Native mobile product.
- `packages/api` owns backend procedures, server-side orchestration, and API contracts.
- `packages/auth` owns shared auth contracts and auth runtime helpers.
- `packages/core` owns shared business logic, calculations, schemas, and framework-free domain contracts.
- `packages/db` owns relational schema, migrations, and local database tooling.
- `packages/ui` owns shared web and native UI primitives.

## Working Rules

- Prefer the smallest correct change.
- Reuse existing package boundaries before creating new ones.
- Keep reusable UI in `packages/ui`, not app-local component trees.
- Keep reusable business logic in `packages/core`, not route files or screen components.
- Keep backend contract and orchestration changes in `packages/api`.
- Keep relational schema and migration ownership in `packages/db`.
- Keep auth contract ownership in `packages/auth`.

## Placement Guide

- Put physical pages, screens, route layouts, and route gating in app route directories.
- Put app-specific composition components in the owning app.
- Put cross-surface domain logic, schemas, and calculations in `packages/core`.
- Put transport-facing tRPC procedures in `packages/api/src/routers`.
- Put persistence details in `packages/api/src/repositories` or `packages/db`.
- Put shared primitives and shared form building blocks in `packages/ui`.

## Validation

- Run the narrowest relevant checks while working.
- Use repo-wide validation before final integration unless the task is intentionally scoped narrower.
- Main repo gates are `pnpm check-types`, `pnpm lint`, and `pnpm test`.

## Avoid

- Duplicating shared UI in both apps.
- Hiding durable domain logic inside TSX route files.
- Coupling `packages/core` to React, app runtime state, or DB clients.
- Mixing migration edits, schema edits, and app logic without keeping ownership boundaries clear.

## Done Means

- The code lives in the right package or app boundary.
- Shared contracts remain typed end to end.
- Relevant checks pass for the changed area.
- The change is small enough to review without reverse-engineering ownership.
