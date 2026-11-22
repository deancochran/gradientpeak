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
pnpm --filter @repo/tailwindcss sync:shadcn-theme
pnpm --filter @repo/tailwindcss generate:theme
pnpm check:generated
```

Do not hand-edit synced registry files or generated theme outputs.

## Preview ownership

Shared components live here, but app-owned preview entrypoints stay in the apps:

```bash
pnpm --filter web storybook
pnpm --filter web build-storybook
```

Mobile previews should stay in `apps/mobile` routes and app-owned tooling.

## Complex component architecture

Build complex UI in four layers:

1. Pure contracts and calculations in `src/lib`, such as chart domains, coordinates, summaries,
   and timestamp alignment.
2. Shared structural components in `src/components` that own layout, semantic states, and
   accessibility without coupling to a renderer.
3. Platform renderers in `index.web.tsx` and `index.native.tsx` when SVG, Victory, Skia, or
   native interaction behavior differs.
4. App-owned domain compositions that supply product data, labels, formatting, and actions.

For charts, compose `ChartCard` and `ChartEmptyState` from `@repo/ui/components/chart`, use
utilities from `@repo/ui/lib/chart`, and keep renderer-specific code in the owning platform.
Every chart must provide a textual summary and intentional loading, empty, error, partial,
constant, and single-value behavior.

For forms, use `useZodForm`, `useZodFormSubmit`, and the semantic wrappers exported by
`@repo/ui/components/form`. Add a wrapper for recurring interaction patterns rather than
reimplementing labels, descriptions, required state, invalid state, and errors in app code.
Inputs that accept formatted values should preserve an editable string draft and commit a
typed value on blur or submission.

`FileInput` is controlled with `SelectedFile[]`; use web `accept` syntax only for browser filters
and `nativeMimeTypes` for Expo MIME filters. `FormFileField` defaults cleared values to `[]` and
accepts `emptyValue` only when a caller intentionally uses a different schema representation.

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
