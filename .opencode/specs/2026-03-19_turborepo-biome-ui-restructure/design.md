# Design: Turborepo Biome + Shared UI Restructure

## 1. Objective

Restructure the monorepo so linting, formatting, shared UI, theming, and component documentation move to one coherent cross-platform architecture.

The target state replaces the current app-local UI duplication and ESLint/Prettier sprawl with:

- one root `biome.json` for repo-wide linting and formatting,
- one new `packages/ui` workspace package as the shared UI source of truth,
- one centralized theme inside `packages/ui`,
- one package-local Storybook inside `packages/ui` that documents the shared package without owning copied components,
- one explicit cutover plan that removes deprecated configs and code after migration.

## 2. Current Repo Findings

The current repository has the right Turborepo foundations but the UI/tooling layer is fragmented.

- Linting and formatting are split across `eslint.config.js`, `apps/mobile/eslint.config.js`, `apps/web/eslint.config.mjs`, `packages/core/eslint.config.js`, `packages/trpc/eslint.config.js`, `packages/eslint-config/package.json`, and root `prettier` usage in `package.json`.
- Shared UI is duplicated across `apps/web/src/components/ui/` and `apps/mobile/components/ui/`.
- Shared theme tokens are duplicated in incompatible formats across `apps/web/src/globals.css` and `apps/mobile/global.css`.
- Shared helper logic already exists twice, for example `apps/web/src/lib/utils.ts` and `apps/mobile/lib/utils.ts` each define `cn(...)`.
- Web is already on Tailwind v4, while mobile still uses NativeWind v4 with Tailwind v3 in `apps/mobile/package.json` and `apps/mobile/tailwind.config.js`.
- There is no Storybook app yet, and no monorepo-level component catalog.

## 3. Design Decisions

### A. Replace ESLint + Prettier with Biome

The new source of truth is a root `biome.json`.

- Root Biome config governs all apps and packages.
- Workspace-level Biome configs are only allowed when they extend the root and solve platform-specific exceptions.
- `@repo/eslint-config`, all `eslint.config.*` files, and Prettier-only config/dependencies are deprecated and removed once the cutover passes.
- Root scripts move to Biome-native commands such as `lint`, `lint:fix`, `format`, and `check`.

This follows the repo-wide configuration goal and removes the current package-by-package drift.

### B. Create `packages/ui` as the shared UI package

All reusable UI components move into `packages/ui`.

- `packages/ui` becomes the canonical home for shared web, mobile, and cross-platform component logic.
- Apps consume `@repo/ui` instead of defining reusable primitives under each app.
- Storybook documents `@repo/ui`; it does not become the component source of truth.

This intentionally differs from placing shared components under a Storybook app's `src/components/`. Apps should not depend on app-owned code. The package must own the components; the Storybook app must consume them.

### C. Use one component directory with per-component platform entries

Each shared component lives under a single folder inside `packages/ui/src/components/`.

Preferred structure:

```text
packages/ui/src/components/
  button/
    shared.ts
    index.web.tsx
    index.native.tsx
    button.stories.tsx
```

Important design adjustment:

- The requested `index.mobile.tsx` suffix is not the recommended canonical file name.
- The spec uses `index.native.tsx` instead because React Native and Metro resolve `.native.*` officially, while `.mobile.*` requires custom resolver behavior and increases cross-bundler risk.

If the team insists on `index.mobile.tsx`, that can be supported later with custom resolution, but it is intentionally not the default architecture in this spec.

### D. Keep shared logic in `shared.ts`

Each component folder should separate:

- `shared.ts` for variants, tokens, prop contracts, and shared helper logic,
- `index.web.tsx` for shadcn/web implementation,
- `index.native.tsx` for React Native Reusables implementation.

If a mobile equivalent does not exist, the component folder simply omits `index.native.tsx`.

### E. Resolve platform implementations through package exports

Apps should import from the package surface, not from platform files.

- Web code imports `@repo/ui/components/button` or equivalent package subpaths.
- Next.js resolves the web entry through package exports plus `transpilePackages`.
- Expo/Metro resolves the native entry through package exports plus `react-native` conditions.

The app should never import `index.web.tsx` or `index.native.tsx` directly.

### F. Centralize theme in `packages/ui`

The theme source of truth moves into `packages/ui/src/theme/`.

That theme contains:

- semantic design tokens,
- shared color/radius/spacing/typography definitions,
- a Tailwind v4 CSS theme adapter for web,
- a NativeWind adapter for mobile.

Because web Tailwind v4 and NativeWind v5 do not consume the same config format, the shared artifact is token data and token-generated CSS, not one literal cross-platform Tailwind config file.

### G. Add package-local Storybook in `packages/ui`

Create a Storybook workspace setup directly inside `packages/ui`.

- Stories live with the components in `packages/ui/src/components/**`.
- `packages/ui/.storybook/*` owns only Storybook configuration and preview assets.
- `packages/ui` provides scripts such as `storybook` and `build-storybook` so the design-system package can run and build its own catalog.
- If mobile-native stories are needed later, Expo Storybook can still be added to `apps/mobile` through a dev-only `/storybook` route, but that is a separate optional phase.

This keeps the shared package as the source of truth while removing the extra host-app layer.

### H. Accept NativeWind v5 only as an explicit experimental choice

Research shows NativeWind v5 is still pre-release and not production-ready. However, the requested target explicitly asks for NativeWind v5 instead of waiting.

Therefore this spec treats the mobile styling stack as:

- approved by product direction,
- explicitly experimental,
- guarded by extra validation and rollback tasks.

React Native Reusables installation guidance still centers on NativeWind v4 + Tailwind v3, so the mobile component generator/import workflow must be repo-owned instead of assuming full upstream parity.

## 4. Non-Goals

- Do not keep app-local UI primitives as permanent parallel sources of truth.
- Do not keep ESLint and Prettier configs "just in case" after the Biome cutover succeeds.
- Do not create a separate `apps/storybook` package that becomes an unnecessary ownership layer for the shared design system.
- Do not rely on custom `.mobile.tsx` resolution as the default platform strategy.
- Do not pretend NativeWind v5 is a stable production dependency; the spec must keep that risk visible.

## 5. Deprecated or Removed Surface Area

The final implementation must explicitly remove or replace all of the following once migrated:

- `packages/eslint-config`
- root `eslint.config.js`
- `apps/mobile/eslint.config.js`
- `apps/web/eslint.config.mjs`
- `packages/core/eslint.config.js`
- `packages/trpc/eslint.config.js`
- root `prettier` dependency and root `format` script that shells out to Prettier
- `prettier-plugin-tailwindcss` if no remaining tool requires it
- app-local reusable component ownership under `apps/web/src/components/ui/` and `apps/mobile/components/ui/`
- duplicated theme-token ownership under `apps/web/src/globals.css` and `apps/mobile/global.css`
- duplicated `cn(...)` helper ownership under app-local utility modules when that helper moves to `packages/ui`

## 6. Research References

The following URLs were directly fetched during research and should be preserved in the implementation context:

- `https://biomejs.dev/guides/migrate-eslint-prettier/` - official ESLint/Prettier migration commands and caveats.
- `https://ui.shadcn.com/docs/monorepo` - official shadcn/ui monorepo structure and `components.json` rules.
- `https://www.nativewind.dev/v5` - official NativeWind v5 pre-release status.
- `https://www.nativewind.dev/v5/getting-started/installation` - official NativeWind v5 installation requirements, including `react-native-css` and `lightningcss` pinning.
- `https://tailwindcss.com/docs/theme` - official Tailwind v4 theme variable and monorepo-sharing guidance.
- `https://storybook.js.org/docs/sharing/storybook-composition` - official Storybook composition model for a single browser entrypoint across multiple Storybooks.
- `https://storybookjs.github.io/react-native/docs/intro/getting-started/expo-router/` - official Expo Router setup for React Native Storybook.
- `https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages` - official Next.js workspace package transpilation guidance.
- `https://reactnative.dev/docs/platform-specific-code` - official React Native platform file extension guidance favoring `.native.*`.
- `https://metrobundler.dev/docs/package-exports/` - official Metro package exports behavior and caveats for exact export targets.
