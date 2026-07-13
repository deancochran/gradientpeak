# GradientPeak Repo Guide

Use this file when working anywhere inside the product repo.

## Repo Map

- `apps/web` is the TanStack Start web product.
- `apps/mobile` is the Expo and React Native mobile product.
- `packages/api` owns backend procedures, server-side orchestration, and transport request/response DTOs.
- `packages/auth` owns shared auth contracts and auth runtime helpers.
- `packages/core` owns reusable business logic, calculations, schemas, and framework-free domain contracts shared across surfaces.
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
- Put reusable cross-surface domain contracts, logic, schemas, and calculations in `packages/core`.
- Put transport-facing tRPC procedures in `packages/api/src/routers`.
- Put transport-specific request and response DTOs in `packages/api`, reusing Core domain contracts where appropriate.
- Put persistence details in `packages/api/src/repositories` or `packages/db`.
- Put shared primitives and shared form building blocks in `packages/ui`.

## Validation

- Run the narrowest relevant checks while working.
- Use repo-wide validation before final integration unless the task is intentionally scoped narrower.
- Iteration checks are package-scoped typecheck, lint, and test commands.
- The current integration gate is `pnpm quality:agent`; it includes format/lint, architecture, type, test, and dependency checks. DB-owned changes also require the relevant DB verification command.
- Run `pnpm check:guidance` after changing an `AGENTS.md` file or the checked exemplar catalog.

## Canonical examples

- Start with [agent implementation exemplars](docs/agent-exemplars.md) before creating a new contract, procedure, UI pattern, or migration workflow.
- Exemplar links identify the behavior to copy, not a blanket approval of every line. If none fits, stop for an ownership/design decision.

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
