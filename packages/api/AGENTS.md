# API Package Guide

Use this file when working in `packages/api`.

## Stack

- tRPC v11.
- Zod.
- SuperJSON.
- Drizzle ORM.
- Shared domain logic from `@repo/core`.

## Scope

- `src/routers` owns tRPC transport-facing procedure contracts.
- `src/application` owns multi-step use cases and server-side orchestration.
- `src/repositories` owns persistence-facing data access helpers.
- `src/context` and `src/trpc` own request context and procedure setup.

## Rules

- Keep a single package-owned tRPC initialization path as the source of router, procedure, transformer, and error-formatting configuration.
- Keep transport concerns in `src/routers`, orchestration in `src/application`, and persistence details in `src/repositories`.
- Split reusable package context from request-bound context when possible so tests and server-side callers can share the same typed inner context.
- Reuse `@repo/core` for domain logic and shared schemas whenever possible.
- Preserve typed error handling and explicit auth boundaries.
- Keep write flows that must commit together inside application or repository transactions rather than piecing them together at router call sites.

## Contracts

- Keep package request, response, and domain contracts typed end to end.
- Avoid duplicating contract definitions that already exist in `@repo/core`, `@repo/auth`, or `@repo/db`.
- Configure `superjson` symmetrically across server and client integration points and treat transformer changes as API contract changes.

## Avoid

- Mixing UI concerns into server-side modules.
- Pulling app runtime dependencies into package APIs.

## Validation

- Prefer package-scoped checks while iterating.
- Main commands are `pnpm --filter @repo/api check-types` and `pnpm --filter @repo/api test`.

## References

- https://trpc.io/docs/server/routers
- https://trpc.io/docs/server/context
- https://trpc.io/docs/server/data-transformers
- https://trpc.io/docs/server/error-formatting
- https://trpc.io/docs/client/tanstack-react-query/setup
- https://tanstack.com/query/latest/docs/framework/react/guides/query-options
- https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
- https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations
- https://orm.drizzle.team/docs/select
- https://orm.drizzle.team/docs/transactions
- https://orm.drizzle.team/docs/zod
- https://zod.dev/basics
- https://zod.dev/error-formatting
