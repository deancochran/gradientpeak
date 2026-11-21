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

Implementation and final evidence will be recorded as they become available;
this document does not claim that planned checks have passed.
