# Mobile Routes Guide

Use this file when working in `apps/mobile/app`.

## Scope

- Expo Router screens.
- Route-group layouts.
- Navigation shells.
- Access and onboarding flow structure.
- Physical screen files that define the app's navigation and public versus authenticated route structure.

## Rules

- Keep route files focused on screen composition, navigation, and route-owned state.
- Preserve route-group meaning such as `(external)` for public flows and `(internal)` for authenticated app flows.
- Keep layout files responsible for navigation structure, providers, and broad gating behavior.
- Prefer layout-level access enforcement and route-group structure over duplicated public and private screen trees.
- Keep route params typed and use local param hooks unless cross-route URL reactivity is actually needed.
- Use screen files to describe flow structure and gating, not to host reusable runtime services or domain workflows.
- Move reusable screen sections into `components/`.
- Move durable non-UI logic into `lib/`.
- Keep form ownership local to the screen and use React Hook Form context and controller APIs instead of ad hoc controlled-field plumbing.

## Avoid

- Putting shared business rules directly in screen files.
- Smuggling app-wide state management into route components when it belongs in providers or stores.
- Breaking route-group semantics with feature-specific shortcuts.

## References

- https://docs.expo.dev/router/basics/notation/
- https://docs.expo.dev/router/advanced/protected/
- https://docs.expo.dev/router/reference/url-parameters/
- https://docs.expo.dev/router/advanced/authentication/
