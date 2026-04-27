# Web Routes Guide

Use this file when working in `apps/web/src/routes`.

## Scope

- File-based route entrypoints.
- Route layouts and shells.
- Route-level auth and access control.
- Page composition and route-owned data flow.
- Physical TSX route files that define URL structure and route hierarchy.

## Rules

- Keep route files focused on page composition, route lifecycle, and route-owned state.
- Keep auth and access control in `beforeLoad`, middleware, or server-side route boundaries.
- Keep search params and route contracts typed.
- Keep critical route-owned data prefetched at the loader boundary, and let secondary work start without blocking first render when possible.
- Use route files to describe navigation, gating, and loading boundaries, not reusable business workflows.
- Move reusable UI into `components/` or `@repo/ui`.
- Move durable business logic into `@repo/api`, `@repo/core`, or route-adjacent helpers when appropriate.
- Use React concurrency primitives for route-owned interactive state when search, filtering, or navigation responsiveness would otherwise suffer.

## Avoid

- Client-only auth gates for protected pages.
- Large business workflows embedded directly in TSX pages.
- Feature-specific shortcuts that bypass route structure.

## References

- https://tanstack.com/query/latest/docs/framework/react/guides/prefetching
- https://www.better-auth.com/docs/basic-usage
- https://www.better-auth.com/docs/concepts/session-management
- https://react.dev/reference/react/startTransition
- https://react.dev/reference/react/useDeferredValue
