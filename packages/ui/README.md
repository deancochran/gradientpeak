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

- Canonical theme source: `src/theme/new-york.json`
- Generated outputs: `src/theme/tokens.css`, `src/theme/web.css`, `src/theme/native.css`, `src/theme/native.ts`
- Regenerate after token changes:

```bash
pnpm --filter @repo/ui generate:theme
```

Do not hand-edit generated theme outputs.

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
pnpm add:shadcn @shadcn/button
pnpm add:reusables @rnr-nativewind/select
```

After generation, move the primitive into the shared contract above, keep shared logic in `shared.ts`, and verify the package export remains correct.
