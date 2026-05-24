# Web API Routes Guide

Use this file when working in `apps/web/src/routes/api`.

## Scope

- HTTP-facing route handlers.
- Auth callbacks.
- Webhooks and internal endpoints.
- Health and integration boundary endpoints.
- Files that translate external HTTP requests into package-level auth, API, or integration work.

## Rules

- Treat this tree as an external input boundary.
- Validate and normalize input at the edge.
- Keep handlers thin and delegate durable logic to `@repo/api`, `@repo/auth`, or shared helpers.
- Keep auth, signature verification, and side effects explicit.
- Prefer explicit method handling, status codes, and headers so webhook, callback, health, and internal endpoint behavior is easy to audit from the entrypoint.
- Mount auth handlers as thin catch-all boundaries and keep cookie-mutating auth flows aligned with Better Auth's TanStack Start cookie integration.

## Avoid

- Mixing page rendering concerns into API route handlers.
- Hiding large orchestration logic inline when it belongs in package code.
- Accepting unvalidated external input.

## References

- https://www.better-auth.com/docs/installation
- https://www.better-auth.com/docs/basic-usage
- https://www.better-auth.com/docs/concepts/session-management
- https://www.better-auth.com/docs/plugins/open-api
- https://tanstack.com/start/latest/docs/framework/react/guide/middleware
