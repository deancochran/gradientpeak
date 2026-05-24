# Core Package Guide

Use this file when working in `packages/core`.

## Stack

- TypeScript.
- Zod.
- ESM package exports.

## Scope

- Shared business logic.
- Calculations and estimators.
- Shared Zod schemas and domain contracts.
- Framework-free helpers used across web, mobile, and server code.

## Rules

- Keep public modules framework-free and database-client-free.
- Prefer pure functions and deterministic helpers.
- Adapt app, network, and DB shapes before they cross into core.
- Put shared schemas here when multiple surfaces depend on the same contract.
- Treat root exports and subpath exports as stable package API surface, and change them intentionally instead of encouraging deep imports into internals.
- Keep the package compatible with the strictest consumer environment by preferring strict TypeScript and runtime-neutral module behavior.

## Conventions

- Define runtime contracts with Zod first, then export inferred TypeScript types from those schemas.
- Use `z.input` and `z.output` when transforms intentionally change input and output types.
- Validate untrusted inputs at package boundaries, but keep internal helpers deterministic and side-effect free.
- When adding reusable schema helpers for external callers, preserve subtype inference instead of erasing schema-specific types.

## Avoid

- React components or hooks.
- Supabase, Drizzle, or app runtime wiring in public core modules.
- One-off app logic that is not truly shared.

## Validation

- Use `pnpm --filter @repo/core check-types` and `pnpm --filter @repo/core test` for package-scoped verification.

## References

- https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html
- https://www.typescriptlang.org/docs/handbook/modules/theory.html
- https://zod.dev/basics
- https://zod.dev/library-authors
- https://nodejs.org/api/packages.html
