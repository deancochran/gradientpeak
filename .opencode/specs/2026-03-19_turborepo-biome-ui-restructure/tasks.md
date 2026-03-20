# Tasks: Turborepo Biome + Shared UI Restructure

## Coordination Rules

- [ ] Every implementation task is owned by one subagent and updated in this file by that subagent.
- [ ] A task is only marked complete when code changes land, focused verification passes, and the success check in the task text is satisfied.
- [ ] If blocked, leave the task unchecked and add the blocker inline.

## Phase 1: Tooling and Workspace Cutover

- [x] Task A - Add root `biome.json`. Success: one root Biome config exists and covers repo-wide linting/formatting needs previously handled by ESLint and Prettier.
- [x] Task B - Update root and workspace scripts. Success: root and package/app scripts use Biome commands instead of ESLint/Prettier commands.
- [x] Task C - Remove deprecated lint packages and configs. Success: `packages/eslint-config` and all `eslint.config.*` files are deleted, and no workspace depends on `@repo/eslint-config`, `eslint`, or `prettier` unless explicitly justified in code comments or spec notes.
- [x] Task D - Update Turbo pipeline. Success: `turbo.json` references the new lint/format flow and no task shells out to removed tooling.

## Phase 2: Shared UI Package Foundation

- [x] Task E - Create `packages/ui`. Success: the new package exists with `package.json`, `components.json`, package exports, and a valid `src/` structure.
- [x] Task F - Add shared utility layer. Success: shared helpers such as `cn(...)` are owned by `packages/ui/src/lib/` and app-local duplicates are either removed or no longer used.
- [x] Task G - Add shared theme layer. Success: `packages/ui/src/theme/` becomes the source of truth for semantic tokens and app-level token duplication is removed. Progress note: the shared New York theme now uses `packages/ui/src/theme/new-york.json` as the canonical token source, with committed `tokens.css`, `web.css`, `native.css`, and `native.ts` regenerated from `pnpm --filter @repo/ui generate:theme`.

## Phase 3: Cross-Platform Component Architecture

- [x] Task H - Create component folder contract. Success: shared components follow `shared.ts`, `index.web.tsx`, and `index.native.tsx` folder structure under `packages/ui/src/components/`. Progress note: the migrated set (`button`, `input`, `card`, `badge`, `avatar`, `label`, `text`, `accordion`, `alert-dialog`, `dialog`, `separator`, `tabs`, `toggle`, `toggle-group`, `tooltip`, `icon`) now keeps `shared.ts` TS-only and pushes platform classes/context runtime into platform files.
- [x] Task I - Migrate reusable web primitives. Success: reusable shadcn-derived components move from `apps/web/src/components/ui/` into `packages/ui` and web imports resolve from `@repo/ui`. Progress note: `command`, `dropdown-menu`, `navigation-menu`, `resizable`, `scroll-area`, `sheet`, `sonner`, and `table` now live in `packages/ui` alongside the previously migrated primitives; `data-table` stays app-local because it remains a TanStack-specific composite rather than a reusable primitive.
- [x] Task J - Migrate reusable mobile primitives. Success: reusable React Native Reusables-style components move from `apps/mobile/components/ui/` into `packages/ui` and mobile imports resolve from `@repo/ui`. Progress note: `menubar`, `hover-card`, and `context-menu` now live in `packages/ui` as native-only shared primitives and the temporary app-local re-export shims have been removed; the unused app-local `stepper` was also deleted during cleanup because it no longer had any mobile consumers.
- [x] Task K - Handle web-only components cleanly. Success: components without a native implementation omit `index.native.tsx` and fail gracefully in mobile usage through explicit package boundaries. Progress note: web-only `command`, `navigation-menu`, `resizable`, `scroll-area`, `sheet`, `sonner`, and `table` keep explicit default-only exports, while native-only `alert`, `aspect-ratio`, `collapsible`, `native-only-animated-view`, `popover`, `skeleton`, `slider`, `text`, `checkbox`, `radio-group`, `switch`, `progress`, `textarea`, `select`, `context-menu`, `hover-card`, and `menubar` resolve through explicit native package boundaries; `stepper` is intentionally excluded from the shared primitive surface.

## Phase 4: App Integration

- [x] Task L - Web app cutover. Success: `apps/web` consumes `@repo/ui`, `apps/web/next.config.ts` transpiles the package, and no shared UI imports point back to `apps/web/src/components/ui/`. Progress note: the only remaining app-local `apps/web/src/components/ui/*` consumer is `data-table`, which stays intentionally app-specific.
- [x] Task M - Mobile app cutover. Success: `apps/mobile` consumes `@repo/ui`, NativeWind v5 preview setup is applied, and no shared UI imports point back to `apps/mobile/components/ui/`. Progress note: `apps/mobile` and `packages/ui` now use NativeWind `5.0.0-preview.3` with `react-native-css`, v5 Metro/Babel/env wiring, CSS `@source` scanning for shared package classes, and no remaining mobile imports targeting the deleted app-local UI shim directory.
- [x] Task N - Update components metadata. Success: `components.json` files for shared and consuming workspaces reflect the new shared package architecture. Progress note: `packages/ui/components.json` and `apps/mobile/components.json` now point at the upstream shadcn registry plus the React Native Reusables NativeWind registry namespace for modular component import workflows.

## Phase 5: Storybook and Documentation Surface

- [x] Task O - Create package-local Storybook. Success: `packages/ui/.storybook/*` exists, `packages/ui` owns `storybook` and `build-storybook` scripts, and Storybook runs/builds from `packages/ui`. Progress note: Storybook now builds from `packages/ui` with Vite, Tailwind, and shared theme preview CSS.
- [x] Task P - Colocate component stories. Success: shared components in `packages/ui/src/components/**` own their stories and Storybook does not contain copied component code. Progress note: foundational web-safe stories now live beside `button`, `input`, `card`, `badge`, `avatar`, `label`, and `tabs`.
- [x] Task Q - Compose mobile stories strategy. Success: the repo supports either composed mobile stories or an explicitly documented RN-device-only Storybook path, with one chosen implementation wired into the plan. Progress note: browser Storybook remains package-local in `packages/ui`, and Expo/mobile Storybook stays explicitly out of scope for this restructure/alignment pass.

## Phase 6: Deprecation Cleanup

- [x] Task R - Remove legacy shared UI directories. Success: `apps/web/src/components/ui/` and `apps/mobile/components/ui/` no longer own reusable shared primitives. Progress note: `apps/web/src/components/ui/` is reduced to the intentional app-local `data-table.tsx` composite, and the legacy mobile UI shim directory has no remaining tracked component files.
- [x] Task S - Remove duplicated theme ownership. Success: shared token definitions no longer live in both `apps/web/src/globals.css` and `apps/mobile/global.css`. Progress note: both apps now import shared theme assets from `@repo/ui`, while app-local globals only keep shell-specific concerns.
- [x] Task T - Remove stale lint/format references. Success: no package scripts, docs, or CI commands still refer to deleted ESLint/Prettier infrastructure. Progress note: workspace scripts stay on Biome-only commands; remaining `eslint`/`prettier` mentions are limited to lockfile transitive metadata or historical/spec notes.

## Validation Gate

- [x] Validation 1 - Repo type safety. Success: `pnpm check-types` passes.
- [x] Validation 2 - Repo lint/format. Success: Biome-based lint/format commands pass without ESLint/Prettier fallbacks.
- [x] Validation 3 - Web package integration. Success: `apps/web` builds with `@repo/ui` imports and shared theme usage.
- [x] Validation 4 - Mobile package integration. Success: `apps/mobile` typechecks and renders shared `@repo/ui` components with NativeWind v5 preview setup. Progress note: focused mobile vitest coverage passed for the migrated chart/projection components after updating React Native color-scheme mocks.
- [x] Validation 5 - Storybook validation. Success: `pnpm --filter @repo/ui build-storybook` passes and documents shared package components from `packages/ui`.
- [x] Validation 6 - Cleanup validation. Success: deleted legacy configs and directories are absent from the repo and no dead imports remain. Progress note: app-local shim imports were removed before deleting the tracked shim files, leaving only `apps/web/src/components/ui/data-table.tsx` as intentional app-local UI.
