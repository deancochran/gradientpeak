# OpenCode Task Index

Keep this file lean. It is startup context, so it should only track active or blocked work.

## Active

- Cross-platform UI testing migration: `sheet` now has fixture/story/play coverage, `separator`, `table`, and `toggle` have story ownership, browser Storybook coverage is up to 41 suites / 73 tests, and the shared preview registry includes a composite `formFields` scenario. The remaining overlay/navigation primitives were audited for real shared usage: `navigation-menu` is the only web-only story candidate if product usage emerges; `popover`, `hover-card`, `context-menu`, and `menubar` are currently package-test-only because they are not shared across web/mobile product surfaces. Next step is deciding whether to add a dedicated web-only `navigation-menu` story now or keep it deferred until product usage appears.
- UI centralization planning: expanded `.opencode/specs/ui-core-app-centralization/` with a launch-first `@repo/ui` chore focused on Tier 1 only for now: web auth shells/forms, native page-sheet modal shells, and segmented controls. Tier 2 and Tier 3 remain optional follow-on work if they still help launch velocity. Next step is to execute Tier 1 starting with `AuthPageShell` / `AuthCardFrame` plus the first native `PageSheetModal` extraction.

## Archive

- Archived specs live under `.opencode/specs/archive/`.
- Closed session summaries moved to `.opencode/tasks/archive/2026-03.md`.
