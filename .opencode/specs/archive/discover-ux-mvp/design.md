# Discover UX MVP Design

## Goal

Improve the mobile Discover experience so users can browse and understand activity plans, training plans, routes, and profiles faster without adding new product complexity.

## Scope

- Refine `apps/mobile/app/(internal)/(tabs)/discover.tsx`
- Improve linked detail views for:
  - `apps/mobile/app/(internal)/(standard)/activity-plan-detail.tsx`
  - `apps/mobile/app/(internal)/(standard)/training-plan-detail.tsx`
  - `apps/mobile/app/(internal)/(standard)/route-detail.tsx`
  - `apps/mobile/app/(internal)/(standard)/user/[userId].tsx`
- Adjust shared list presentation only where needed for Discover comprehension.

## UX Principles

- Keep search simple: one query box, one active tab, no advanced filtering model.
- Improve information scent: each card should explain what it is before the user taps.
- Prioritize comprehension over actions: summary first, actions second, destructive controls last.
- Keep CTAs honest: hide or demote placeholder actions that do not complete a real flow.
- Preserve MVP constraints: no new entity types, recommendation systems, or complex personalization.

## Proposed Changes

### Discover Tab

- Add a lightweight browse header that explains Discover and makes the current tab feel intentional.
- Add tab-aware search placeholder/helper copy instead of a generic search-only treatment.
- Add small result-count and browse-context labels to improve scanability.
- Make activity category rows feel curated with clearer titles, counts, and preview copy.
- Upgrade training plan, route, and user cards so they expose one more layer of metadata and a clear affordance.
- Remove misleading nested CTAs from cards when the real action is opening the detail page.

### Activity Plan Detail

- Move summary content above dense action clusters.
- Surface schedule/template/privacy context near the title.
- Keep primary actions focused on record, schedule, and duplicate/edit.
- Hide placeholder share behavior for MVP.
- Push comments below the workout understanding layer.

### Training Plan Detail

- Keep the strong summary header but add clearer overview chips for duration, cadence, and sports.
- Tighten action copy so browse users understand when a plan is read-only vs editable.
- Improve structure sections with better hierarchy and calmer supporting labels.

### Route Detail

- Reframe the top section around route understanding first: category, distance, elevation, description.
- Remove the non-functional "Use in Activity Plan" CTA for MVP.
- Show delete only when clearly appropriate for owned routes.

### User Detail

- Make the profile header more informative for public/private/follow state.
- Keep profile information together in a simple summary layout.
- Separate account-management content from profile viewing so the screen still reads clearly.

## Non-Goals

- No new backend search entities such as coaches or series.
- No new ranking, recommendation, or saved-search systems.
- No large IA changes to navigation.
