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
- For mobile UI/UX work, load and apply the `mobile-frontend` skill before designing or editing screens, cards, forms, inputs, lists, search results, picker results, or detail surfaces.

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

## UI/UX Resource Standards

- User-facing entities should have canonical cards and detail screens when users browse, inspect, select, configure, or navigate to them.
- Reuse canonical cards anywhere the entity appears, including lists, search results, pickers, previews, and associated-content sections.
- Associated resources on detail screens should appear as tappable cards and navigate to their detail screens when the user can view them.
- Do not render associated resource IDs, labels, or one-off mini summaries when a canonical card exists.
- Examples: activity plans use `ActivityPlanCard`, training plans use `TrainingPlanCard`, group events use `GroupEventCard`, groups use `GroupCard` or `GroupCompactCard`, and activities use `ActivityCard`.

## UI/UX Field Standards

- User-configured fields must use the canonical input and display pattern for the semantic field type.
- Rich configured fields should not be displayed as raw text when a semantic display exists.
- Avatar URLs display as avatars with fallback initials; cover URLs display as wide images; routes display as route previews/cards/maps; dates and times display formatted schedule values; enum/status values display as badges, pills, selects, or segmented controls.
- Forms must prefer shared wrappers from `@repo/ui/components/form` before raw inputs.
- Optional fields must be reversible to null or their unset state from the same input area.
- Clear/unset actions should be compact and colocated, such as a trailing icon, subtle `Clear` text, chip remove action, or image-preview remove icon.
- Avoid full-width `Clear date` or `Remove value` buttons for simple optional fields.
- Helper text should explain privacy, validation, formatting, sync/import behavior, or why a field matters; avoid filler text that repeats the label or states obvious persistence such as `Stored on your profile`.

## Visual Weight And Actions

- Match UI chrome to task complexity.
- Simple settings should be compact rows, not full cards with repeated titles, descriptions, labels, helper text, and switch labels.
- A single obvious toggle should usually be one label with a trailing switch and, at most, one short supporting line.
- Use cards/sections only when they group related fields, separate sensitive/destructive controls, contain rich content, represent a distinct object/workflow, or provide meaningful decision context.
- Simple create/edit/settings screens should use the app header: back handles cancel/back and `headerRight` handles `Save`, `Create`, `Done`, or `Add`.
- Avoid bottom `Cancel`/`Save` rows when the header already provides navigation and a primary action slot.
- Reserve bottom action bars for multi-step flows, modals/sheets, sticky review flows, or actions that must remain visible while scrolling.
- Use lightweight save feedback for routine saves; avoid blocking success modals unless the user must make another decision.

## Avoid

- Creating app-local duplicate primitives that belong in `packages/ui`.
- Moving native runtime concerns into `packages/core`.
- Smearing route concerns, component composition, and runtime services across the wrong top-level directories.
- One-off displays for resources that already have canonical cards or detail routes.
- Heavy wrappers around simple settings and obvious controls.
- Duplicated bottom cancel/save actions on simple screens that can use the header.

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
