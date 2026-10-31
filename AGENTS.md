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

- Develop on a dedicated feature branch/worktree based on current `origin/main`; preserve existing legacy worktrees. Never edit or locally integrate features into the main preview checkout.
- Integrate through GitHub pull requests. Within an authorized implementation task, agents may commit, push, open the PR and enable auto-merge after local verification and independent review. Required CI/security checks must pass; never bypass protections. Database changes, deployments and destructive cleanup require separate authority.
- Prefer the smallest correct change.
- Reuse existing package boundaries before creating new ones.
- Keep reusable UI in `packages/ui`, not app-local component trees.
- Keep reusable business logic in `packages/core`, not route files or screen components.
- Keep backend contract and orchestration changes in `packages/api`.
- Keep relational schema and migration ownership in `packages/db`.
- Keep auth contract ownership in `packages/auth`.
- For form changes, follow `docs/form-ux-remediation.md`: reuse semantic shared fields, preserve invalid/optional drafts, and update the owning form's coverage only after relevant verification. Do not overwrite externally owned form edits.

## Placement Guide

- Put physical pages, screens, route layouts, and route gating in app route directories.
- Put app-specific composition components in the owning app.
- Put reusable cross-surface domain contracts, logic, schemas, and calculations in `packages/core`.
- Put transport-facing tRPC procedures in `packages/api/src/routers`.
- Put transport-specific request and response DTOs in `packages/api`, reusing Core domain contracts where appropriate.
- Put persistence details in `packages/api/src/repositories` or `packages/db`.
- Put shared primitives and shared form building blocks in `packages/ui`.

## Validation

- For development runtime errors, start with `pnpm dev:errors` and `docs/development-errors.md`; use the Sentry MCP development filter for captured issues. Empty local/Sentry results do not prove a clean runtime. Synthetic remote events require explicit approval.
- Run the narrowest relevant checks while working.
- Use repo-wide validation before final integration unless the task is intentionally scoped narrower.
- Iteration checks are package-scoped typecheck, lint, and test commands.
- The current integration gate is `pnpm quality:agent`; it includes format/lint, architecture, type, test, and dependency checks. DB-owned changes also require the relevant DB verification command.
- Run `pnpm check:guidance` after changing an `AGENTS.md` file.

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
