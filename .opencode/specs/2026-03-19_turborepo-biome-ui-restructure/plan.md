# Implementation Plan: Turborepo Biome + Shared UI Restructure

## 1. Strategy

Perform the migration in six ordered layers:

1. replace linting/formatting with Biome,
2. introduce `packages/ui` and shared theme infrastructure,
3. establish package exports and cross-platform component boundaries,
4. add package-local Storybook inside `packages/ui`,
5. cut apps over to `@repo/ui`,
6. remove deprecated configs, duplicated components, and obsolete scripts.

This plan is intentionally opinionated in two places:

- it uses `index.native.tsx` instead of the requested `index.mobile.tsx`, because the official platform resolution path is safer,
- it keeps shared components in `packages/ui`, not inside a Storybook app directory, because apps should consume a package, not an app.

## 2. Target Workspace Structure

```text
.
├── apps/
│   ├── mobile/
│   │   ├── app/
│   │   ├── .rnstorybook/                  # optional phase for native-device Storybook
│   │   └── package.json
│   └── web/
│       ├── src/app/
│       └── package.json
├── packages/
│   ├── core/
│   ├── supabase/
│   ├── trpc/
│   ├── typescript-config/
│   └── ui/
│       ├── .storybook/
│       │   ├── main.ts
│       │   ├── preview.ts
│       │   └── preview.css
│       ├── components.json
│       ├── package.json
│       └── src/
│           ├── components/
│           │   ├── button/
│           │   │   ├── shared.ts
│           │   │   ├── index.web.tsx
│           │   │   ├── index.native.tsx
│           │   │   └── button.stories.tsx
│           │   └── ...
│           ├── hooks/
│           ├── lib/
│           │   └── cn.ts
│           ├── registry/
│           │   ├── shadcn/
│           │   └── reusables/
│           ├── theme/
│           │   ├── tokens.css
│           │   ├── web.css
│           │   ├── native.css
│           │   └── native.ts
│           └── index.ts
├── biome.json
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 3. Current Files to Change or Remove

### A. Root tooling and workspace files

- `package.json`
- `turbo.json`
- `pnpm-workspace.yaml`
- `eslint.config.js` -> remove
- root Prettier usage in `package.json` -> remove
- new `biome.json` -> add

### B. Deprecated lint package

- `packages/eslint-config/package.json` -> remove package

### C. Existing app/package ESLint files

- `apps/mobile/eslint.config.js` -> remove
- `apps/web/eslint.config.mjs` -> remove
- `packages/core/eslint.config.js` -> remove
- `packages/trpc/eslint.config.js` -> remove

### D. Current duplicated UI/theme ownership

- `apps/web/src/components/ui/**` -> migrate then remove as shared source
- `apps/mobile/components/ui/**` -> migrate then remove as shared source
- `apps/web/src/globals.css` -> retain app shell concerns, remove shared token ownership
- `apps/mobile/global.css` -> retain app shell concerns, remove shared token ownership
- `apps/web/src/lib/utils.ts` -> remove shared `cn(...)` ownership if unused after cutover
- `apps/mobile/lib/utils.ts` -> remove shared `cn(...)` ownership if unused after cutover

## 4. Tooling Cutover Plan

### Phase 1: Root Biome adoption

Add root `biome.json` that covers JavaScript, TypeScript, JSON, and CSS-like files used by the repo.

Root scripts should become:

- `lint`: `biome check .`
- `lint:fix`: `biome check --write .`
- `format`: `biome format --write .`
- `check`: `biome check .`

Workspace scripts should align to Biome instead of ESLint/Prettier wrappers.

Expected dependency removals after migration:

- `eslint`
- `eslint-config-next`
- `eslint-config-expo`
- `@eslint/eslintrc`
- `@repo/eslint-config`
- `prettier`
- `eslint-config-prettier`
- `eslint-plugin-*` dependencies that no longer have any use
- `prettier-plugin-tailwindcss` unless retained temporarily for a migration-only step

### Phase 2: Turbo updates

Update `turbo.json` so repo tasks refer to the new Biome scripts.

Potential task additions:

- `lint`
- `lint:fix`
- `format`
- `check-types`
- `test`
- `storybook`

## 5. Shared UI Package Plan

### A. Package boundary

Create `packages/ui` with these responsibilities:

- shared UI components,
- shared design tokens and theme adapters,
- shared UI helper utilities,
- story colocations,
- component import/generation scripts.

### B. Public API surface

Preferred import style:

```ts
import { Button } from "@repo/ui/components/button";
```

`packages/ui/package.json` should use explicit `exports` subpaths so both Next.js and Metro resolve package entries predictably.

### C. Component folder contract

Each component folder follows this rule set:

- `shared.ts` owns shared props, variants, tokens, and logic.
- `index.web.tsx` implements the shadcn/web rendering.
- `index.native.tsx` implements the React Native Reusables rendering.
- omit `index.native.tsx` when there is no mobile implementation.
- colocate `*.stories.tsx` with the component.

### D. Component import/generation scripts

`packages/ui/package.json` should include repo-owned scripts for:

- adding a shadcn component into the shared package,
- scaffolding a React Native Reusables-style component into the shared package,
- generating the component folder structure with `shared.ts`, `index.web.tsx`, and optional `index.native.tsx`.

Because current React Native Reusables docs are still manual and not fully aligned to NativeWind v5, the mobile generator must be repo-owned rather than dependent on an assumed upstream monorepo CLI.

## 6. Theme Plan

Theme ownership moves to `packages/ui/src/theme/`.

### Required outputs

- `tokens.css` - source semantic token values.
- `web.css` - Tailwind v4 `@theme` + shared CSS-variable output for web consumers.
- `native.css` - NativeWind CSS import surface for Expo/React Native Web.
- `native.ts` - helper exports for `vars()` or other NativeWind theme helpers.

### Theme rules

- Web consumes Tailwind v4 only.
- Mobile consumes NativeWind v5 only, with explicit risk callout.
- Apps may still own app-shell-only CSS, but they cannot own shared design tokens after cutover.
- `apps/web/src/globals.css` and `apps/mobile/global.css` become thin entry files that import shared theme assets from `@repo/ui`.

## 7. Storybook Plan

### A. Package-local Storybook

Create Storybook directly inside `packages/ui`.

Responsibilities:

- load stories from `packages/ui/src/components/**`,
- render web implementations directly,
- import `packages/ui/src/theme/web.css` in preview so shared design tokens apply in stories,
- build directly from the package with `pnpm --filter @repo/ui build-storybook`.

### B. Mobile story exposure

Use a two-level strategy:

1. browser-safe mobile components can be rendered through React Native Web-compatible stories,
2. native-only stories can be exposed through Expo Storybook in `apps/mobile` via a dev-only `/storybook` route.

If the team wants a single port later, the package-local Storybook can still use composition so one browser shell exposes both story trees. That is a composed shell, not a single mixed renderer.

### C. Story ownership

- Stories live with components in `packages/ui`, not in apps.
- `packages/ui/.storybook/` owns only Storybook scaffolding and preview configuration.

## 8. App Cutover Plan

### A. Web app

Update `apps/web` to:

- add `@repo/ui` as a dependency,
- add `@repo/ui` to `transpilePackages` in `apps/web/next.config.ts`,
- update imports from `@/components/ui/*` to `@repo/ui/components/*`,
- keep app-specific page components under `apps/web/src/components/`,
- stop treating `apps/web/src/components/ui/` as the reusable UI source of truth.

### B. Mobile app

Update `apps/mobile` to:

- add `@repo/ui` as a dependency,
- import shared UI components from `@repo/ui/components/*`,
- update Metro/Babel/CSS config for NativeWind v5 preview,
- replace Tailwind v3-specific mobile setup files with NativeWind v5 equivalents,
- keep app-specific feature components under `apps/mobile/components/`,
- stop treating `apps/mobile/components/ui/` as the reusable UI source of truth.

### C. `components.json` ownership

Create or update:

- `packages/ui/components.json`
- `apps/web/components.json`
- `apps/mobile/components.json`

Rules:

- `packages/ui/components.json` points the shadcn CLI at shared package paths.
- `apps/web/components.json` points shared UI imports at `@repo/ui/components` and shared utils at `@repo/ui/lib/*`.
- mobile `components.json` remains only as local metadata if needed by repo-owned generation scripts.

## 9. Explicit Deprecation and Removal Plan

The implementation must not leave duplicate legacy surfaces behind.

### Remove after cutover

- `packages/eslint-config/`
- all ESLint config files listed in section 3
- all Prettier-only root/tooling config still present after Biome cutover
- shared component primitives from `apps/web/src/components/ui/`
- shared component primitives from `apps/mobile/components/ui/`
- token definitions that remain duplicated in `apps/web/src/globals.css`
- token definitions that remain duplicated in `apps/mobile/global.css`
- old Tailwind v3 mobile config files that are no longer used by NativeWind v5

### Replace in place

- app-local `cn(...)` helpers -> `@repo/ui/lib/cn`
- app-local shared theme imports -> `@repo/ui/src/theme/*` outputs
- direct reusable UI imports from app aliases -> package imports from `@repo/ui`

### Do not preserve

- partial ESLint fallback configs unless a Biome gap is explicitly documented
- parallel `index.mobile.tsx` naming as a first-class platform contract
- Storybook-owned copies of components
- an `apps/storybook` host layer unless a future composition need truly justifies it

## 10. Risks and Constraints

### A. High-risk choice explicitly requested

NativeWind v5 is pre-release. The implementation must include rollback awareness and focused verification for:

- Expo startup,
- Metro bundling,
- React Native Web rendering,
- theming and `className` behavior,
- any React Native Reusables component adapted to the preview stack.

### B. Bundler/export constraint

Because Metro treats matched `exports` targets as exact paths, package export targets must be explicit and tested. The package design cannot assume Metro will apply platform suffix expansion after an `exports` match.

### C. Storybook constraint

One browser port is achievable through composition, not through a single runtime rendering true native and web stories together.

## 11. Validation Plan

Required validation after implementation phases:

```bash
pnpm check-types
pnpm lint
pnpm test
pnpm --filter @repo/ui build-storybook
pnpm --filter web build
pnpm --filter mobile check-types
```

Additional focused validation:

- verify `@repo/ui` imports resolve in `apps/web`
- verify `@repo/ui` imports resolve in `apps/mobile`
- verify `@repo/ui` stories load from `packages/ui`
- verify web-only components degrade cleanly when no native implementation exists
- verify shared theme tokens render consistently across web and mobile
- verify removed ESLint/Prettier scripts are not still referenced anywhere in the workspace

## 12. Research References

- `https://biomejs.dev/guides/migrate-eslint-prettier/`
- `https://ui.shadcn.com/docs/monorepo`
- `https://www.nativewind.dev/v5`
- `https://www.nativewind.dev/v5/getting-started/installation`
- `https://tailwindcss.com/docs/theme`
- `https://storybook.js.org/docs/sharing/storybook-composition`
- `https://storybookjs.github.io/react-native/docs/intro/getting-started/expo-router/`
- `https://nextjs.org/docs/app/api-reference/config/next-config-js/transpilePackages`
- `https://reactnative.dev/docs/platform-specific-code`
- `https://metrobundler.dev/docs/package-exports/`
