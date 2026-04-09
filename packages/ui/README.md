# @repo/ui

`packages/ui` is the source of truth for shared web and mobile UI primitives, shared selectors, and shared fixtures. Apps should consume `@repo/ui` and own their runtime previews.

## Component shape

Keep shared primitives under `src/components/<name>/` and prefer this layout:

- `shared.ts` for shared types and non-platform logic.
- `fixtures.ts` for previews and test scenarios.
- `index.web.tsx` for web implementation.
- `index.native.tsx` for native implementation.

## Theme workflow

Refresh the shadcn sources and generated theme outputs with:

```bash
pnpm --filter @repo/ui sync:shadcn-theme
pnpm --filter @repo/ui generate:theme
```

Do not hand-edit synced registry files or generated theme outputs.

## Preview ownership

Shared components live here, but app-owned preview entrypoints stay in the apps:

```bash
pnpm --filter web storybook
pnpm --filter web build-storybook
```

Mobile previews should stay in `apps/mobile` routes and app-owned tooling.

## Add upstream components

From `packages/ui`:

```bash
pnpm add:shadcn button
pnpm add:reusables select
```

The wrappers keep upstream registry mirrors under `src/registry/*` and stable package entrypoints under `src/components/*`.

Useful flags still pass through:

```bash
pnpm add:shadcn button -- --overwrite
pnpm add:reusables select -- --yes --overwrite
```
