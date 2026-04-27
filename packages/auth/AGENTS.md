# Auth Package Guide

Use this file when working in `packages/auth`.

## Stack

- Better Auth.
- Better Auth Drizzle adapter.
- Better Auth Expo integration.
- Drizzle ORM.
- Zod.

## Scope

- Shared auth session contracts for web, mobile, and API consumers.
- Auth runtime env parsing and client and server helpers.
- Callback, deep-link, and account lifecycle contracts.

## Rules

- Keep this package as the home for Better Auth instance creation, shared client creators, and normalized auth contracts, but keep framework route mounting and UI flows outside the package.
- Require explicit Better Auth runtime configuration for `baseURL`, trusted origins, and secrets rather than relying on implicit request-based inference in shared helpers.
- Keep Expo deep-link behavior aligned across server and client helpers, including scheme, storage, and trusted-origin configuration.
- Treat Better Auth CLI output and Drizzle schema changes as one boundary, and regenerate auth schema artifacts when auth tables, plugins, or model names change.
- Keep contracts framework-agnostic where possible.
- Preserve compatibility across web, mobile, and API consumers.
- Keep app-specific route mounting and UI behavior outside this package.

## Conventions

- Define shared env shapes, callback payloads, session shapes, and auth mutation contracts with Zod first, then export inferred types from those schemas.
- Validate untrusted auth inputs at package boundaries with `parse`, `safeParse`, or async variants when runtime validation is required.

## Avoid

- Pulling provider-specific app routing into shared auth contracts.
- Rewriting API or app logic here when only shared auth shapes are needed.

## Validation

- Run the narrowest relevant package checks when auth contracts or runtime helpers change.

## References

- https://www.better-auth.com/docs/installation
- https://www.better-auth.com/docs/reference/options
- https://www.better-auth.com/docs/integrations/expo
- https://www.better-auth.com/docs/adapters/drizzle
- https://orm.drizzle.team/docs/relations-schema-declaration
- https://orm.drizzle.team/docs/migrations
- https://zod.dev/
- https://zod.dev/basics
