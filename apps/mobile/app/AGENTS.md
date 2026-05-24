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
- For list screens, default to this order unless the screen has a clear reason not to: header actions, intro, primary controls, result summary, list content, one persistent create or schedule entry point.
- Treat owner-library `My ...` screens as browse and manage surfaces first, not creation hubs, unless the workflow clearly depends on creation from that screen.
- For detail screens, default to this order unless the screen has a clear reason not to: header actions, identity card, linked primary content, analytical content, structured body content, engagement or secondary content.
- Keep screen-level management actions in the header overflow menu, and keep at most one lightweight personal action near the identity block.
- Make linked first-class content appear early and look tappable, and keep charts or metrics visually quieter than the identity and linked-content layers they support.
- Linked first-class content must use the linked resource's canonical card, not ad hoc labels or screen-local summary rows, and should navigate to that resource's detail route when viewable.
- Simple create/edit/settings screens should put the primary action in `headerRight` and rely on the header back button for cancel/back instead of duplicating bottom Cancel/Save rows.
- Use bottom action bars only for multi-step flows, modal/sheet flows, sticky review flows, or actions that must remain visible while scrolling.
- Keep simple settings visually light: one clear label, a trailing control, and only meaningful supporting text. Do not wrap one obvious toggle in a full card/section unless it is part of a larger group.
- Optional route-owned form fields must support returning to their unset/null state with compact, colocated clear affordances rather than large secondary clear buttons.
- Avoid blocking success modals for routine saves; use save loading state, return navigation, or lightweight feedback unless the user must decide something.

## Avoid

- Putting shared business rules directly in screen files.
- Smuggling app-wide state management into route components when it belongs in providers or stores.
- Breaking route-group semantics with feature-specific shortcuts.
- Displaying associated resource data as raw IDs, text labels, or one-off cards when a canonical card/detail pattern exists.
- Repeating cancel/save actions in content when header navigation and `headerRight` already cover the flow.
- Adding section chrome, helper copy, or descriptions that merely repeat an obvious setting label.

## References

- https://docs.expo.dev/router/basics/notation/
- https://docs.expo.dev/router/advanced/protected/
- https://docs.expo.dev/router/reference/url-parameters/
- https://docs.expo.dev/router/advanced/authentication/
