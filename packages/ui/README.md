# @repo/ui

`packages/ui` is the source of truth for shared web and mobile UI primitives, shared selectors, and shared fixtures. Apps should consume `@repo/ui` and own their runtime previews.

## Component contract

Create each shared primitive under `src/components/<name>/` and keep the contract strict:

- `shared.ts` - shared types, variants, and non-platform logic
- `fixtures.ts` - shared scenario data for previews, tests, Playwright, and Maestro
- `index.web.tsx` - web implementation
- `index.native.tsx` - React Native implementation

If a primitive is intentionally platform-only, keep the same folder and omit the unsupported entry explicitly.

## Theme workflow

- Canonical upstream sources: `src/theme/shadcn/style.json` and `src/theme/shadcn/theme-neutral.json`
- Docs-standard shared CSS output: `src/theme/web.css` (`:root`, `.dark`, and `@theme inline`)
- Generated outputs: `src/theme/tokens.css`, `src/theme/web.css`, `src/theme/native.css`, `src/theme/native.ts`
- Refresh from the official shadcn registry and regenerate after token changes:

```bash
pnpm --filter @repo/ui sync:shadcn-theme
pnpm --filter @repo/ui generate:theme
```

Do not hand-edit the synced shadcn source files or generated theme outputs.

## Preview ownership

Web preview tooling belongs to `apps/web`.

Run from `apps/web`:

```bash
pnpm --filter web storybook
pnpm --filter web build-storybook
```

Mobile preview ownership belongs to `apps/mobile` and should use app-owned development entry points or preview routes.

## Add components

`components.json` is already wired to the New York style, the shared package aliases, the shadcn registry, and the React Native Reusables NativeWind registry.

From `packages/ui`:

```bash
pnpm add:shadcn button
pnpm add:reusables select
```

The wrapper scripts intentionally keep each upstream CLI in its own mirror:

- shadcn/ui writes to `src/registry/web/*`
- react-native-reusables writes to `src/registry/native/*`

If a component does not already have a public package entrypoint, the wrapper also scaffolds a thin platform entry file under `src/components/<name>/index.web.tsx` or `index.native.tsx` that re-exports from the mirror.

This keeps three layers separate:

- `src/registry/web/*` and `src/registry/native/*` are CLI-owned mirrors and should stay as close to upstream as practical.
- `src/components/<name>/index.web.tsx` and `index.native.tsx` are the stable package entrypoints that downstream bundlers resolve automatically.
- `shared.ts`, fixtures, stories, and tests remain package-owned when a component needs local contract logic above the registry mirror.

Current primitives are not fully cut over to mirror-backed entrypoints yet. For now, use the mirror workflow for new additions and future incremental migrations.

Useful flags still pass through to the upstream CLIs:

```bash
pnpm add:shadcn button -- --overwrite
pnpm add:reusables select -- --yes --overwrite
```
