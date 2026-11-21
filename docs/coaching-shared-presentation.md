# Shared coaching presentation

## Outcome and boundaries

The November 20 systemic audit identified shared primitives underneath inconsistent
coaching themes, app-local chart semantics, and independently composed summaries
and states. This implementation makes the existing system coherent rather than
introducing a new design system or a universal screen/entity framework.

Acceptance is owned in the shared Beads objective `gp-6sa`. Its initial useful
slices are semantic coaching theme/controls/navigation, a shared training-state
visual family with real web/native consumers, and bounded identity/state patterns.
Each slice requires implementation, regression evidence, independent review,
publication, and an explicit shared-preview disposition.

Existing product capabilities and platform interactions remain. This work does
not authorize new coaching data access, projected coach data, schema changes,
production deployment, provider activation, or a new native coaching workspace.

## Required behavior

- Organization selection, athlete directories/workspaces and administration
  use the same light/dark theme semantics as the personal workspace. Custom
  status colors must remain legible in both themes.
- Search keeps its existing submission and URL ownership. Clearing, empty
  results, loading, and recoverable failures remain distinct.
- Desktop and compact coaching navigation consume one app-owned destination
  model. Administration navigation remains reachable across its existing pages.
  The current destination is recognizable, keyboard behavior works, and sheet
  dismissal restores focus.
- Web historical training state and native actual/projected state consume the
  same visual semantics without assuming equivalent data entitlements.
  Unknown values remain unknown; gaps are not connected, zero is not missing,
  negative form is retained, and source/date/unit labels remain accurate.
- Shared identity/state presentations preserve reading order, long-name
  containment, primary versus secondary actions, and appropriate announcements.
  Retry/query/permission decisions stay app-owned.
- Public platform entrypoints remain explicit and do not import native runtime
  dependencies into the web graph. Native differences are intentional, not
  accidental prop or layout drift.

## Evidence contract

Focused web/native component tests cover the shared contracts and actual
consumers. Types, formatting, generated artifacts, architecture and the required
quality gates remain mandatory.

`apps/web/e2e/specs/coaching-shared-presentation.spec.ts` exercises keyboard theme
selection/reload, organization selection, administration continuity, directory
search/clear, active navigation and unshared athlete context. The guarded
disposable runner owns its synthetic fixture relationships. Desktop is 1440×1000
and compact web is 390×844; screenshots supplement interaction assertions.

The existing `coach-training-history.spec.ts` remains the authorization and
populated-history journey: actual history, negative form, a readable table,
athlete switching, and consent withdrawal must still work. Shared chart/state
fixtures supplement—not replace—these app-level journeys.

No shared-preview records are seeded or mutated for visual acceptance. Prepared
preview accounts are used only for read-only walkthroughs. Browser screenshots
are not native-device, screen-reader, or production acceptance. Native renderer
tests, native runtime evidence, and browser evidence must be reported separately.

## Starting evidence

Before implementation, source `156df86bc50403e6b6ed774067cdf294df3f8a63` was
assembled from fetched `origin/main` plus exact existing feature prerequisites,
never from preview. Relevant coaching, UI, and mobile Plan trees matched audited
preview `51aedd50da7e39b5a2ab655c6290925d4d4fc7fa`.

The baseline rendered walkthrough showed the coaching shell retaining the same
slate background in Light and Dark preferences while shared buttons changed.
The existing web history charts were confirmed in source; the prepared preview
athlete did not have populated historical observations. No populated-history
visual result is inferred from that preview fixture.

## Implemented presentation boundaries

- Coaching shells and administration pages use semantic theme tokens and existing
  shared controls. One destination model drives desktop and compact navigation;
  exact Router matching prevents duplicate current links, and administration keeps
  its active tab inside the horizontal navigation viewport.
- `@repo/ui/components/training-state-chart` explicitly exports paired web/native
  renderers. Both consume the same required `series` selection and point contract.
  Web uses SVG; native owns the existing Victory renderer rather than accepting an
  app-local injected plot. Selected series govern availability, geometry, labels
  and accessibility. Source-specific presentation, sparse markers, null gaps,
  zeroes, negative values, units and planning timezone are retained.
- The web athlete overview supplies recorded historical series only. The native
  planning ledger explicitly supplies its authorized recorded/projected data.
  Adapters, domain decisions, directions and permission handling remain app-owned.
- Native rendering reuses `victory-native` 41.20.2 and the existing peer snapshot:
  only its UI importer declaration was added to the lockfile. No new native module
  or package version was introduced.
- Shared `IdentitySummary` and `EmptyStateCard` have real web/native consumers.
  State tone, vertical reading order, unbroken text/action wrapping, native heading
  semantics and selector descriptions are explicit. Denied content does not
  introduce a nested main landmark. Retry and navigation callbacks remain with
  their apps.
- Both chart stories and fixture-driven preview surfaces exercise six selected
  recorded/projected series. State stories include empty, unavailable, recoverable
  error and denied cases; the unbroken fixture contains strings without spaces or
  hyphens.

## Accepted evidence at implementation checkpoint `4d63c8a6`

Independent source review of the summary follow-up and final chart/navigation
corrections found no remaining concrete blocker in their bounded scopes. The
chart follow-up also inspected supplied web fixture screenshots. Review is
separate from the checks executed by the implementation coordinator.

- Canonical Node toolchain via `mise exec`: UI/web/mobile typechecks, scoped
  Biome, generated UI artifact checks and architecture (zero new violations)
  passed.
- Full shared-UI suite before the last corrective additions: **221 web tests and
  245 native tests passed**. After those additions, focused UI chart/semantic tests
  **8 web / 4 native**, mobile ledger/presentation **7**, web overview **9**, and
  administration route tests **19** passed. These counts describe different
  runs, not a summed final full-suite result.
- Final independent disposable acceptance run
  `acceptance-2712078-1795237162884`: **4/4 passed** at the exact implementation
  checkpoint. It executes the two specifications named above on 1440×1000 and
  390×844 browser projects, including ready administration content, visible current
  tabs, theme persistence, search/clear, unshared context, populated history and
  consent withdrawal.
- Final populated-history and ready administration screenshots were inspected.
  Shared chart fixture captures at 1440/390 in Light/Dark show six series and
  three projected selections without horizontal overflow. The compact unbroken
  state fixture retains a readable wrapping action.
- Production web build passed, confirming the web export graph bundles without
  pulling the native renderer into that surface. Existing bundle/chunk warnings
  are not interpreted as runtime or production acceptance.
- Local Expo iOS and Android exports passed with Hermes bytecode generation and
  two Metro workers. These prove platform import/bundle compatibility, not native
  binary compilation or device usability. Telemetry/upload credentials were
  disabled; nothing was uploaded, installed or deployed. The initial export
  destination was unwritable, so the successful exports used ignored feature-local
  `.logs/coaching-shared-ui/bundles/` without changing host permissions.

Detailed local logs and captures live in `.logs/coaching-shared-ui/` and the
disposable run directory. They are ignored artifacts, not published test data.
The shared-preview activation ledger records exact integrations and runtime
identity separately; preview walkthroughs never replace disposable acceptance.

## Evidence and delivery limits

Native component tests exercise selection/data/accessibility contracts with the
canvas boundary mocked. No attached native device was available: native visual
layout, gestures, text scaling and TalkBack/VoiceOver remain unverified. The
previously inactive shared Metro service is not started by this task.

The complete implementation checkpoint is **live in web preview**, integrated
from `09580d94fb6dfa0cca39c86fdfc82e93277de0bd` to
`e34933e5c026bccc8ea4edf2b4438f5479d73ba2`. Locked ancestry/clean-status checks,
HTTP health and served overview/navigation module checks passed. The owned web
PID stayed `1140936`; no dependency install or service restart was needed.

The final prepared-account overview walkthrough passed at 1440/390 in Light/Dark:
theme persistence, disclosure collapse/reopen and no horizontal overflow, with
screenshots inspected and stable preview/runtime identity. This prepared account
has no populated historical observations; that case is proven by disposable
acceptance, not inferred from preview. No preserved account/data/provider writes
or external requests occurred. Earlier accepted chooser/directory walkthrough
evidence remains in the same local artifact directory.

Full quality/publication results are tracked by `gp-6sa` and the consolidated PR;
they are not inferred from the preview checks above.
Main/release prerequisite reconciliation remains separately owned by `gp-awt.42`;
this presentation work does not authorize schema changes, preserved-data resets,
provider activation, production deployment or bypassing required checks.
