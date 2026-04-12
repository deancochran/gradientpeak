# GradientPeak

GradientPeak is a product monorepo for the web app, mobile app, shared UI, backend APIs, and core training logic.

## What lives here

- `apps/web` contains the active web product.
- `apps/mobile` contains the mobile product.
- `packages/api` contains backend procedures and server-side application logic.
- `packages/core` contains shared domain logic and calculations.
- `packages/ui` contains reusable UI components.
- `packages/db` contains database-related code and local data tooling.

## Getting started

Install dependencies:

```bash
pnpm install
```

Start local development:

```bash
pnpm dev
```

Start only the active web app:

```bash
pnpm --filter web dev
```

Run the main validation commands before opening a PR:

```bash
pnpm check-types
pnpm lint
pnpm test
```

## Development workflow

1. Create a focused branch for one change.
2. Make the smallest change that solves the problem.
3. Run the relevant checks locally.
4. Open a PR with a short summary of the user-facing outcome.

## Important notes

- Keep shared business logic in `packages/core` when it should work across apps.
- Keep backend and data access changes aligned with `packages/api` and `packages/db`.
- Prefer small, reviewable changes over broad refactors.
- Treat the README as a high-level guide, not a full internal handbook.
- Production web deployment now targets the TanStack Start app in `apps/web`.
