# tRPC Routers Guide

Use this file when working in `packages/api/src/routers`.

## Scope

- tRPC router definitions.
- Procedure input and output contracts.
- Transport-facing auth and validation.
- Domain-grouped API entrypoints such as planning, activity, account, social, and platform procedures.

## Rules

- Keep procedures thin when the logic can be delegated to `application/`, `repositories/`, `@repo/core`, or `@repo/db`.
- Preserve existing domain grouping and naming conventions.
- Use the package `publicProcedure` and `protectedProcedure` helpers consistently.
- Validate input at the boundary and keep outputs typed.
- Make it obvious from the router file which procedure is the contract boundary and which code is delegated deeper.
- Use `query` for reads and `mutation` for writes, and keep return shapes stable and serializable for TanStack Query caching behavior.
- Add output validation selectively when trimming shapes or validating data that came from less-trusted upstream sources.

## Avoid

- Hiding heavy orchestration inline in router files.
- Duplicating domain logic already owned by `@repo/core`.
- Bypassing shared auth and error semantics.

## References

- https://trpc.io/docs/server/procedures
- https://trpc.io/docs/server/validators
- https://trpc.io/docs/server/context
- https://trpc.io/docs/server/error-formatting
- https://zod.dev/basics
- https://zod.dev/error-formatting
