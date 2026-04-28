# Mobile App Agent Guide

Use this file when working in `apps/mobile`.

## Stack

- Framework: Expo Router with React Native.
- Styling: NativeWind and shared tokens.
- Shared UI: `@repo/ui`.
- Data access: shared API/auth packages and app-owned providers in `lib/`.
- State: prefer route-owned state, query state, and focused local stores over ad hoc global state.

## Scope

- `app/` owns physical screens, layouts, route groups, and navigation structure.
- `components/` owns app-specific UI composition.
- `lib/` owns app runtime logic, hooks, providers, navigation helpers, services, and stores.

## Rules

- Treat `app/_layout.tsx` as the long-lived app shell and mount persistent providers there instead of scattering them across screens.
- Keep bootstrap and first-paint gating in the root layout so auth hydration, theme setup, and similar startup work complete before route content renders.
- Move reusable primitives to `@repo/ui` when they should work across surfaces.
- Keep app-owned runtime flows in `lib/`, especially device, recording, auth bootstrap, service wiring, and other native concerns.
- Configure TanStack Query mobile lifecycle behavior once near the root provider layer instead of adding screen-level refresh listeners.
- Reuse existing route groups and providers before adding new structural layers.
- Use Zustand only for focused app-runtime state that is not already better owned by route state, query cache, or React Hook Form.

## Conventions

- Use `@repo/ui` components first.
- Keep app-local components focused on mobile-specific behavior and composition.
- Preserve established NativeWind token usage instead of ad hoc color and spacing choices.
- Keep `app/` route-only, `components/` composition-only, and `lib/` runtime-logic-only.
- Start screen and component layout from content hierarchy, not from wrapper containers.
- Prefer one strong parent surface with light child sections, and avoid card-inside-card composition unless the nested card is a truly separate object.
- Use vertical flow by default for rich content like charts, maps, previews, and session structure, and only switch to horizontal layout when scanning clearly improves.
- Remove duplicate identity and metadata where possible, and treat repeated titles, icons, and category labels as a design smell.
- Flatten wrapper-only containers that only add spacing, padding, border, or muted background when the owning content block can carry that responsibility directly.

## Avoid

- Creating app-local duplicate primitives that belong in `packages/ui`.
- Moving native runtime concerns into `packages/core`.
- Smearing route concerns, component composition, and runtime services across the wrong top-level directories.

## Validation

- Prefer the narrowest relevant mobile checks first.
- Common commands from the repo root are `pnpm --filter mobile check-types`, `pnpm --filter mobile lint`, `pnpm --filter mobile test`, and `pnpm --filter mobile test:e2e` when needed.

## References

- https://docs.expo.dev/router/basics/core-concepts/
- https://docs.expo.dev/router/advanced/authentication/
- https://tanstack.com/query/latest/docs/framework/react/react-native
- https://reactnative.dev/docs/0.81/appstate
- https://react-hook-form.com/docs
- https://react-hook-form.com/docs/usecontroller
- https://react-hook-form.com/docs/useformcontext
- https://www.nativewind.dev/v5
- https://www.nativewind.dev/v5/guides/using-with-monorepos
- https://www.nativewind.dev/v5/guides/custom-components
- https://zustand.docs.pmnd.rs/
