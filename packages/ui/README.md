# @repo/ui

`packages/ui` is the source of truth for shared web and mobile UI primitives. Apps should consume `@repo/ui`; Storybook only documents what lives here.

## Component contract

Create each shared primitive under `src/components/<name>/` and keep the contract strict:

- `shared.ts` - shared types, variants, and non-platform logic
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

## Storybook

Run from `packages/ui`:

```bash
pnpm storybook
pnpm build-storybook
```

Expo/mobile Storybook is intentionally out of scope for this package workflow.

## Add components

`components.json` is already wired to the New York style, the shared package aliases, the shadcn registry, and the React Native Reusables NativeWind registry.

From `packages/ui`:

```bash
pnpm add:shadcn @shadcn/button
pnpm add:reusables @rnr-nativewind/select
```

After generation, move the primitive into the shared contract above, keep shared logic in `shared.ts`, and verify the package export remains correct.
