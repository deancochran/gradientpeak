---
name: web-frontend
description: Next.js App Router, server/client boundaries, and shared web UI patterns
---

# Web Frontend Skill

## When to Use

- Building or editing `apps/web` pages, layouts, or components
- Choosing between Server and Client Components
- Wiring tRPC/React Query into web UI
- Working with shared `@repo/ui` web exports

## Scope

This skill covers web UI architecture and page composition.

- Use `backend` for router changes.
- Use `react-hook-form-zod-expert` for complex form architecture.
- Use `testing` for test ownership and runner decisions.

## Rules

1. Default to Server Components in the App Router.
2. Add `"use client"` only when hooks, events, or browser APIs are required.
3. Keep data contracts aligned with `@repo/core` and `@repo/trpc`.
4. Reuse `@repo/ui` before adding app-local primitives.
5. Keep loading, empty, and error states explicit.
6. Prefer semantic tokens and existing design-system patterns over ad hoc styling.

## Default Split

```tsx
// Server component
export default async function Page() {
  return <ActivityListClient />;
}

// Client component
"use client";

export function ActivityListClient() {
  const query = trpc.activities.list.useQuery({ limit: 20, offset: 0 });

  if (query.isLoading) return <Skeleton />;
  if (query.error) return <ErrorState message={query.error.message} />;

  return <ActivityList activities={query.data.items} />;
}
```

## Repo-Specific Guidance

- App routes live in `apps/web/src/app/`.
- Shared components belong in `@repo/ui` when they are not web-only.
- For client-side forms, prefer `useZodForm` / `useZodFormSubmit` from `@repo/ui/hooks` and the shared `Form*Field` wrappers from `@repo/ui/components/form` instead of repeated `Controller` boilerplate.
- Reach for raw `FormField` only when composing a custom control that does not fit the shared wrappers yet.
- Keep route-level data and mutations predictable and type-safe.
- Prefer runtime-owned integration checks in Playwright and component work in the package or app test layer.

## Shared Form Guidance

```tsx
const form = useZodForm({
  schema: settingsSchema,
  defaultValues: { username: "", is_public: false },
});

return (
  <Form {...form}>
    <FormTextField control={form.control} label="Username" name="username" />
    <FormSwitchField control={form.control} label="Public Account" name="is_public" />
  </Form>
);
```

- Keep Zod/domain contracts in `@repo/core` and UI wiring in `@repo/ui`.
- Prefer shared field wrappers for consistency across web and mobile consumers.

## Avoid

- Marking whole route trees as client-only without need
- Fetching the same data in multiple layers without a reason
- Bypassing shared UI or shared schema contracts
- Mixing backend business rules into page components

## Quick Checklist

- [ ] correct server/client split
- [ ] shared UI reused where appropriate
- [ ] typed query or mutation path
- [ ] loading/error/empty states handled
- [ ] styling follows existing tokens and patterns
