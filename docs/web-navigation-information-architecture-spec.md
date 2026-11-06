# Web Navigation and Information Architecture Specification

## Purpose

Make GradientPeak's web workspace easier to understand and move through by
giving each major product area one clear home, separating navigation from
account settings, and preserving context as people move between lists, details,
and authoring flows.

This specification is implementation-ready planning for the web application. It
does not authorize a route migration, an API change, or changes to the mobile
application.

## Current evidence

The standard shell currently presents `Home`, `Activities`, `Routes`, `Record`,
`Plan`, and `Calendar` as primary destinations in
`apps/web/src/components/protected/protected-header.tsx`. The user menu also
contains Dashboard, Calendar, messages, notifications, plans, goals, groups,
training preferences, integrations, and settings in
`apps/web/src/components/protected/user-nav.tsx`.

The resulting problems are:

1. Major capabilities such as activity plans, training plans, goals, and groups
   are discoverable principally through the user menu.
2. The user menu duplicates global destinations and mixes workspace navigation,
   communications, coaching entry, account identity, and configuration.
3. `Plan`, `/activity-plans`, and `/training-plans` do not express a predictable
   relationship.
4. Detail pages have inconsistent return behavior; some preserve list context,
   some rely on browser history, and an activity-plan route contains raw anchors.
5. The command launcher combines navigation and content discovery without
   clearly naming those jobs.

## Scope

### Included

- Standard protected web navigation on desktop and mobile.
- Section-level navigation for planning, groups, discovery, and communication.
- Command launcher destination coverage and discover-page clarity.
- Account/settings and integrations grouping.
- Consistent list-to-detail-to-list return behavior.
- Route naming and hierarchy decisions that can be delivered without breaking
  existing URLs.
- Playwright coverage, test-page-object updates, accessibility checks, and
  delivery-document updates for this work.

### Excluded

- New training, social, recording, or coaching business capabilities.
- API, database, auth, or mobile route changes.
- A mandatory immediate URL migration or removal of existing URLs.
- A redesign of product content inside existing screens.
- Search ranking, indexing, or content-result changes beyond making navigation
  and result scopes understandable.
- Generated `apps/web/src/routeTree.gen.ts` edits by hand.

## Product decisions

### Canonical global navigation

The protected athlete workspace preserves its established global labels and one
persistent action:

| Surface | Canonical destination | Meaning |
| --- | --- | --- |
| Home | `/` | Today, current training state, and attention-needed information. |
| Activities | `/activities` | Completed activity history, imported activities, routes, and activity analysis. |
| Routes | `/routes` | Saved and uploaded routes. |
| Plan | `/plan` | Training outlook, reusable plans, goals, and future work. |
| Calendar | `/calendar` | Schedule browsing and event management. |
| Record (action) | `/record` | Start or continue the immediate recording workflow. |

`Record` remains visually distinct as an action, rather than being treated as a
peer library. This work does not rename, remove, or introduce product-area
terminology in the global navigation.

### Section navigation

Each global area exposes visible, route-aware contextual navigation. It must use
the same labels on desktop and mobile and mark the active destination with
`aria-current="page"`.

| Area | Contextual destinations | Existing URL authority |
| --- | --- | --- |
| Activities | History, Import, Routes, Thresholds | `/activities`, `/activities/import`, `/routes`, `/thresholds` |
| Plan | Overview, Activity plans, Training plans, Goals | `/plan`, `/activity-plans`, `/training-plans`, `/goals` |
| Calendar | Calendar views and event actions | `/calendar` and existing nested calendar routes |
| Groups | Groups and group events | `/groups` and existing nested group routes |
| Discover | Discover, Messages, Notifications | `/search`, `/messages`, `/notifications` |
| Record | Start, route choice, plan choice, active session | `/record` and existing nested record routes |

The detail page for a resource inherits the section that owns its parent list.
For example, activity-plan and training-plan details remain in Plan; a route
detail remains in Routes; group-event details remain in Groups.

### Account and settings navigation

The avatar menu becomes an account menu, not an alternate site map. It contains:

- Profile;
- Settings;
- Coaching organizations, only for an eligible user;
- Log out.

Within settings, present one navigable configuration model with these sections:

1. Profile
2. Account and security
3. Appearance
4. Training preferences
5. Integrations

The first delivery keeps `/settings`, `/training-preferences`, and
`/integrations` as their canonical URLs. A settings side navigation or section
switcher groups them before any future nested-URL decision. A later migration to
`/settings/*` requires a separate compatibility specification with redirects,
deep-link handling, and analytics review.

### Search and discovery

The keyboard/header control is renamed and described as a **command and search
launcher**. It has two explicit groups:

- **Go to:** every global and major contextual destination, including Goals,
  Groups, Activity plans, Training plans, Profile, Integrations, and
  Notifications.
- **Search content:** submits to `/search?q=...`.

The `/search` page is presented as **Discover** and visibly identifies the
available content scopes. Its scope labels must match supported content rather
than promising unavailable results. Navigation commands remain in the launcher;
content results remain on the Discover page.

### Detail continuity

Every owned detail, create, and edit flow must expose a consistent route-aware
return affordance:

- A top-left breadcrumb or `Back to [collection]` link uses TanStack Router
  `Link`, never a raw anchor.
- The target is the owning collection or the explicit supplied origin; browser
  history is supplemental, not the only return path.
- List search, filters, sort, pagination, and selected tab are preserved in
  typed search parameters whenever a route already supports them.
- Calendar detail preserves date, view, and relevant selection state.
- Successful create, edit, delete, duplicate, and schedule actions return to the
  documented canonical route and show the existing success feedback.
- Cross-linked details (for example, a route opened from an activity) provide a
  clear owning-collection return target rather than making an implicit origin
  claim.

## Route and compatibility rules

1. Existing public and protected URLs remain valid in the initial delivery.
2. This work changes route presentation and navigation ownership first; it does
   not rename `/routes`, `/training-preferences`, `/integrations`, or
   `/groups/events/:groupEventId`.
3. `routeTree.gen.ts` remains tool-owned. Changes to route files use the normal
   route-generation workflow and verify generated output freshness.
4. A proposed nested group-event hierarchy is deferred. It requires an explicit
   decision on permalink compatibility and an origin-independent event detail
   route before implementation.
5. Coaching remains a distinct workspace in `coach-shell.tsx`, with an explicit
   Standard app return. It is not folded into athlete navigation.

## Implementation plan

### Phase 1 — Shared navigation model and shell

**Owned paths**

- `apps/web/src/components/protected/protected-header.tsx`
- `apps/web/src/components/protected/user-nav.tsx`
- `apps/web/src/components/protected/search-launcher.tsx`
- New focused navigation-model/helper files under
  `apps/web/src/components/protected/`

**Work**

1. Define one typed, app-local destination model for global, contextual, and
   account navigation.
2. Render the same primary model in desktop navigation and the mobile sheet.
3. Move Routes into Activities context; make Record an emphasized action.
4. Reduce the avatar menu to identity, settings, eligible coaching entry, and
   logout.
5. Update launcher destinations from the shared model and separate Go to from
   content search.

**Acceptance**

- Every canonical global and contextual destination has one label and one
  route authority.
- Desktop/mobile destinations agree.
- No primary destination is duplicated in the account menu.
- The active route is programmatically identifiable.

### Phase 2 — Section navigation and settings grouping

**Likely owned paths**

- `apps/web/src/routes/_protected/plan.tsx`
- `apps/web/src/routes/_protected/activities/index.tsx`
- `apps/web/src/routes/_protected/calendar.tsx`
- `apps/web/src/routes/_protected/groups/index.tsx`
- `apps/web/src/routes/_protected/search.tsx`
- `apps/web/src/routes/_protected/settings.tsx`
- `apps/web/src/routes/_protected/training-preferences.tsx`
- `apps/web/src/routes/_protected/integrations.tsx`
- New app-specific section-navigation compositions under
  `apps/web/src/components/protected/`

**Work**

1. Add section navigation at each canonical area boundary without duplicating
   shared UI primitives.
2. Make Plan's Overview, Activity plans, Training plans, and Goals relationship
   explicit.
3. Add a settings section switcher and common labels while retaining current
   URLs.
4. Clarify Discover scopes and empty/no-result outcomes.

**Acceptance**

- Major libraries are discoverable from their owning area without using the
  avatar menu.
- Settings, preferences, and integrations are visibly one configuration model.
- All local navigation is keyboard reachable and responsive at the mobile
  viewport.

### Phase 3 — Detail-flow continuity

**Likely owned paths**

- `apps/web/src/routes/_protected/activities/$activityId/index.tsx`
- `apps/web/src/routes/_protected/routes/$routeId/index.tsx`
- `apps/web/src/routes/_protected/activity-plans/$activityPlanId.tsx`
- `apps/web/src/routes/_protected/training-plans/$planId/index.tsx`
- `apps/web/src/routes/_protected/goals/$goalId/index.tsx`
- `apps/web/src/routes/_protected/groups/$groupId/index.tsx`
- `apps/web/src/routes/_protected/calendar/events/$eventId/index.tsx`

**Work**

1. Standardize the breadcrumb/back-link composition and replace raw anchors.
2. Preserve supported list and calendar context using typed route search state.
3. Align post-mutation destinations and success feedback with the owning
   collection.

**Acceptance**

- A person can return to the appropriate collection from each supported detail
  without relying on browser history.
- The return target preserves context where the collection exposes that state.
- Router navigation is used consistently.

### Phase 4 — Optional URL taxonomy migration

This phase is explicitly deferred. It may introduce nested settings URLs and a
group-event hierarchy only after product approval, redirect/deep-link design,
and compatibility test design are accepted.

## E2E test plan

E2E tests remain outcome-based: they use the browser, local E2E database, and
real route navigation. Unit tests may cover the destination model and active
state, but they do not replace browser proof.

### Test ownership

- Add a focused shell/navigation Playwright spec, preferably
  `apps/web/e2e/specs/navigation-information-architecture.spec.ts`.
- Extend `apps/web/e2e/specs/capability-p3-settings-coaching.spec.ts` for
  settings grouping and coaching-entry regression.
- Extend the existing domain specs only where they own a changed detail journey:
  activities, routes, plans, calendar, goals, groups, messaging, notifications,
  and discovery.
- Update affected page objects under `apps/web/e2e/pages/` rather than repeating
  selectors in specs. Add a focused shell page object if the shared header is
  exercised by more than one spec.

### Required browser outcomes

1. Desktop primary navigation reaches Home, Activities, Routes, Plan, and
   Calendar; Record reaches the recording start workflow.
2. Mobile navigation exposes the identical primary destinations, closes after a
   choice, and reports the current page.
3. Activities context reaches Thresholds; Plan context reaches both plan
   libraries and Goals; Groups and Discover surfaces reach their existing
   Groups, Messages, Notifications, and search destinations.
4. The avatar menu contains Profile, Settings, eligible Coaching organizations,
   and Log out, but no duplicated workspace destinations.
5. The launcher lists all supported major destinations, supports keyboard
   activation, and distinguishes navigation from content search.
6. Discover shows its supported scopes, submits a query, and handles no results
   without presenting an error as an empty result.
7. Settings navigation reaches profile, training preferences, and integrations;
   existing settings persistence coverage continues to pass.
8. From each changed detail route, `Back to [collection]` returns to the
   canonical list and preserves supported query/calendar state.
9. Create/edit/delete detail flows retain the existing authorization behavior
   and land on the specified canonical route.
10. The coaching shell remains reachable only for eligible users and preserves
    its Standard app exit.
11. Keyboard focus order, accessible names, Escape behavior for menus/sheets,
    and `aria-current` are asserted for changed navigation controls.

### E2E data and stability rules

- Reuse current fixture/page-object helpers and actor identities.
- Use test-owned records for list/detail mutation coverage and clean them with
  the existing cleanup helpers.
- Do not make navigation tests depend on result ordering, global records, or
  another spec's setup.
- Keep responsive coverage focused: one desktop primary-navigation proof and
  one 390px-wide mobile navigation proof are required; add variants only for a
  distinct failure boundary.
- Preserve existing P0/P1/P2 tests. This change is P3 navigation/shell work but
  must not weaken domain journey assertions.

### Verification commands

Run focused tests first, then broaden only after the relevant proof is green:

```sh
pnpm --filter web check-types
pnpm --filter web exec vitest run <affected-navigation-unit-test-paths>
pnpm --filter web test:e2e -- e2e/specs/navigation-information-architecture.spec.ts
pnpm --filter web test:e2e -- e2e/specs/capability-p3-settings-coaching.spec.ts
pnpm quality:agent
```

The `test:e2e` script forwards Playwright arguments through
`apps/web/scripts/run-playwright.mjs`; it therefore keeps the project's GPU
isolation behavior. Run it only with the existing local E2E environment. If a
focused selector is not supported by that runner, run the smallest supported
spec invocation rather than claiming an unexecuted filter passed.

## Documentation delivery

The implementation delivery updates documentation only when there is real
evidence to record:

1. Keep this specification current for accepted information-architecture and
   compatibility decisions.
2. Update route or contributor guidance only if implementation introduces a
   reusable navigation ownership convention that is not already covered by the
   app and route `AGENTS.md` files.
3. Do not manually edit generated route artifacts or create status transcripts.

## Non-functional requirements

- Use `@repo/ui` primitives before adding an app-local primitive.
- Keep route files responsible for route boundaries and page composition;
  navigation models and reusable app-specific compositions belong under
  `apps/web/src/components`.
- Maintain typed TanStack Router links, params, and search contracts.
- Do not turn a loading or failed Discover request into an empty result.
- Meet existing responsive, keyboard, focus, accessible-name, and contrast
  expectations for changed controls.

## Completion criteria

This specification is delivered when the phases are implemented in order or an
explicit approved deviation is recorded; all required focused browser outcomes
pass; relevant existing domain tests remain green; document status is updated
with actual evidence; and the integration gate passes. No route taxonomy
migration is implied by completion of Phases 1–3.
