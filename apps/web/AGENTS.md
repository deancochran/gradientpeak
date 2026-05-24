# Web App Agent Guide

Use this file when working in `apps/web`.

## Stack

- Framework: TanStack Start + TanStack Router.
- Auth: Better Auth.
- Forms: React Hook Form + Zod.
- Styling: Tailwind CSS v4.
- Shared UI: `@repo/ui`.

## Scope

- `src/routes` owns file-based routes, layouts, route guards, and page entrypoints.
- `src/components` owns app-specific composition components.
- `src/lib` owns app-specific helpers and integrations.

## Rules

- Prefer the smallest correct change.
- Reuse existing routes, layouts, components, hooks, schemas, and utilities before creating new ones.
- Treat `apps/web` as a full-stack boundary, with server-only work in server functions, middleware, or API routes and client components focused on presentation and interaction.
- Use `@repo/ui` components first.
- Add reusable primitives to `packages/ui` instead of creating app-local duplicates.
- Keep app-specific UI composition in `src/components` and app-specific helpers in `src/lib`.

## Conventions

- Default to React Hook Form with Zod validation.
- Keep route and query data flow centered on route-level prefetching and hydrated TanStack Query caches instead of component-local fetch sprawl.
- Prefer shared form primitives from `@repo/ui/components/form`.
- Keep form schemas explicit, use resolver-based validation, and prefer form-wide `defaultValues` over scattered field defaults.
- Keep schemas and contract types explicit instead of duplicating or inlining them opportunistically.
- Keep Tailwind v4 configuration CSS-first, define reusable tokens centrally, and keep classes statically discoverable across app and shared package sources.

## Avoid

- Duplicating shared UI in app-local components.
- Mixing broad business logic into app-level composition files.
- Dynamic Tailwind class construction that breaks source detection.

## Validation

- Run the narrowest relevant web checks while iterating.
- Use repo-wide checks before final integration when the change crosses package boundaries.

## References

- https://tanstack.com/start/latest/docs/framework/react/overview
- https://tanstack.com/start/latest/docs/framework/react/guide/server-functions
- https://tanstack.com/start/latest/docs/framework/react/guide/middleware
- https://tanstack.com/query/latest/docs/framework/react/guides/prefetching
- https://react-hook-form.com/docs/useform
- https://github.com/react-hook-form/resolvers#quickstart
- https://zod.dev/basics
- https://tailwindcss.com/docs/theme
- https://tailwindcss.com/docs/detecting-classes-in-source-files
- https://tailwindcss.com/docs/functions-and-directives
