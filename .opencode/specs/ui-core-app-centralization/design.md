# UI/Core App Centralization

## Objective

Define how GradientPeak should use `@repo/ui` and `@repo/core` so `apps/mobile` and `apps/web` share the same testable logic, keep app layers thin, and avoid feature drift.

## Audit Snapshot

- Branch: `audit/ui-core-shared-app-spec`
- `@repo/ui` usage is already strong in mobile (`238` files) and present but narrower in web (`25` files).
- `@repo/core` usage is strong in mobile (`103` files) but absent from `apps/web/src` (`0` files).
- The current gap is less about primitive adoption and more about missing shared domain adapters, shared feature-level composites, and package-boundary cleanup.

## Current Findings

### 1. `@repo/ui` is mostly a primitive package today

- `packages/ui/src/components/index.ts` is a web-only barrel, so both apps rely on deep imports instead of a stable cross-platform entrypoint.
- `packages/ui/src/hooks/index.ts` and `packages/ui/src/registry/index.ts` are empty, so there is no shared home for higher-level component registration or helpers yet.
- The package exports many platform-aware primitives, but not many reusable composites.
- Web is missing some expected parity surfaces, including a web `Switch` implementation (`packages/ui/src/components/switch/` only has native files).

### 2. `@repo/core` already contains substantial domain logic

- `packages/core` already owns schemas, calculations, training-plan preview/projection logic, estimation, Bluetooth parsing, and reusable utilities.
- Mobile correctly consumes core in places like `apps/mobile/components/settings/ProfileSection.tsx` and `apps/mobile/lib/training-plan-form/localPreview.ts`.
- Web depends on `@repo/core` in `package.json` and transpiles it in `apps/web/next.config.ts`, but does not consume it from `apps/web/src`.

### 3. Web still keeps local feature contracts that should be shared

- `apps/web/src/app/(internal)/settings/page.tsx` defines a local `profileSchema` instead of using `profileQuickUpdateSchema` from `packages/core/schemas/form-schemas.ts`.
- `apps/web/src/app/(internal)/notifications/page.tsx` hand-parses `unknown` records with local getters instead of consuming typed notification/view-model helpers from core.
- `apps/web/src/app/(internal)/messages/page.tsx` and `apps/web/src/app/(internal)/coaching/page.tsx` still own shaping/parsing logic that should move into shared contracts or adapters.

### 4. Mobile still owns several pure logic modules that should move to core

- `apps/mobile/lib/goals/goalDraft.ts` is pure draft hydration and payload-building logic built on core types.
- `apps/mobile/lib/training-plan-form/input-parsers.ts` is reusable parsing and normalization logic.
- `apps/mobile/lib/training-plan-form/validation.ts` contains cross-field plan validation and derived rule logic.
- `apps/mobile/lib/profile/metricUnits.ts` and `apps/mobile/lib/utils/training-adjustments.ts` contain domain logic that should not stay app-local.

### 5. Mobile still owns reusable feature-level UI that should move to ui

- `apps/mobile/components/training-plan/create/inputs/BoundedNumberInput.tsx`
- `apps/mobile/components/training-plan/create/inputs/DurationInput.tsx`
- `apps/mobile/components/training-plan/create/inputs/PaceInput.tsx`
- `apps/mobile/components/training-plan/create/inputs/IntegerStepper.tsx`
- `apps/mobile/components/settings/SettingsGroup.tsx`
- `apps/mobile/components/shared/EmptyStateCard.tsx`
- `apps/mobile/components/shared/ErrorStateCard.tsx`
- `apps/mobile/components/ActivityPlan/MetricCard.tsx`

### 6. Package boundaries need cleanup before wider reuse

- `packages/core/README.md` says the package is database-independent with zero ORM/database dependencies.
- In reality, several runtime-exported core modules import Supabase types directly from `@repo/supabase`.
- That makes `@repo/core` less portable than its contract suggests and increases coupling between app logic and database-generated types.

## Target Architecture

### `@repo/ui`

`@repo/ui` should own reusable presentation primitives and platform-aware composites.

Keep in `@repo/ui`:
- primitives like button/card/input/tabs/avatar
- shared field wrappers and parsed input controls
- reusable display shells such as empty/error/settings/metric cards
- platform-specific implementations behind one export path

Do not keep in `@repo/ui`:
- business rules
- request/response shaping
- Supabase types
- tRPC wiring
- route/navigation behavior

### `@repo/core`

`@repo/core` should own pure schemas, domain rules, parsers, view-model adapters, and formatting helpers.

Keep in `@repo/core`:
- zod schemas and app-facing contracts
- parsing and normalization helpers
- derived-state reducers and validation rules
- feature view-model adapters for notifications, messaging, coaching, goals, plans, and activity summaries
- unit conversion and formatting helpers that are not UI-framework-specific

Do not keep in `@repo/core`:
- React/React Native code
- Supabase clients or framework bindings
- app router/navigation code
- browser/native runtime side effects

### Apps

`apps/mobile` and `apps/web` should primarily compose shared packages.

Apps should own only:
- route structure
- data fetching and mutation wiring
- local runtime integrations (Expo, browser APIs, device services)
- screen-specific orchestration and temporary UI state

## Recommended Shared Surfaces

### First-wave `@repo/core` additions

- `goals/draft` helpers extracted from `apps/mobile/lib/goals/goalDraft.ts`
- `forms/parsers` helpers extracted from `apps/mobile/lib/training-plan-form/input-parsers.ts`
- training-plan form validation/adapters extracted from `apps/mobile/lib/training-plan-form/validation.ts`
- shared notification, messaging, and coaching view-model adapters for web pages currently parsing `unknown`
- shared profile/account update contracts so web and mobile use the same form models

### First-wave `@repo/ui` additions

- parsed numeric/duration/pace field components based on the mobile training-plan inputs
- shared `SettingsGroup`, `EmptyStateCard`, `ErrorStateCard`, and `MetricCard` composites where props can be made app-agnostic
- a web `Switch` implementation so settings forms do not fall back to ad hoc controls
- optional reusable web composites such as `data-table` and `avatar-stack` once they are generalized

## Design Rules For Migration

- Extract pure logic before extracting UI wrappers.
- Prefer shared contracts in core before adding new app features.
- Move generic composites into ui only after prop shapes are app-agnostic.
- Leave app-specific routing, mutation hooks, and platform runtime code in the apps.
- Add tests at the package that owns the behavior: core for logic, ui for shared rendering, apps for wiring.

## Success Criteria

- Web consumes `@repo/core` directly for profile, notification, messaging, coaching, and future training-plan flows.
- Mobile deletes app-local pure helpers that now live in core.
- Shared field/composite UI moves out of app folders into `@repo/ui` with platform-specific exports where needed.
- Package boundaries become clearer: `@repo/core` is genuinely framework-agnostic and database-light, and apps mostly orchestrate rather than implement business rules.
