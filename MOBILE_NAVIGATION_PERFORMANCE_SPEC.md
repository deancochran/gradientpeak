# Mobile Navigation Performance

## Goal

Make mobile navigation feel immediate without relying on expensive per-navigation route checks.

The app should:

1. avoid duplicate screens for hub and detail routes by using router-native navigation semantics
2. avoid unnecessary refetches when moving between internal screens
3. keep navigation decisions simple and explicit
4. separate route transitions from unrelated cleanup and mutation orchestration

## Summary

The main navigation slowness is not coming from Expo Router itself.

The bigger problems are:

1. schedule and planning screens refetch too aggressively on mount and focus
2. several destination screens mount large bundles of queries at once
3. navigation callbacks are coupled to overlay teardown, alerts, and mutation side effects
4. root auth and onboarding gating still blocks route entry on multiple async dependencies

The existing custom route-dedupe layer was a symptom-level optimization. Removing it was correct,
but it does not address the main architecture costs.

## Current Problems

### 1. Local query policy overrides the global cache policy

`apps/mobile/lib/api/scheduleQueryOptions.ts` currently forces:

```ts
{
  staleTime: 0,
  refetchOnMount: "always",
}
```

This conflicts with the global scheduling-aware query strategy already defined in:

1. `packages/api/src/query-client.ts`

That global policy already treats scheduling-sensitive queries specially with a shorter stale window.

The local override makes navigation behave like every entry is cold.

### 2. Some screens are architected as query bundles

Examples:

1. `apps/mobile/app/(internal)/(tabs)/plan.tsx`
2. `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
3. `apps/mobile/lib/hooks/useTrainingPlanSnapshot.ts`
4. `apps/mobile/lib/hooks/useProfileGoals.ts`

These screens and hooks mount multiple independent reads immediately, even when only part of the
data is needed above the fold.

This creates a navigation pattern where moving to a screen also means starting a burst of network
and render work.

### 3. Navigation is coupled to side effects

Examples:

1. `apps/mobile/lib/calendar/useCalendarScreenController.ts`
2. `apps/mobile/components/activity-plan/useActivityPlanSchedulingActions.ts`
3. `apps/mobile/components/training-plan/useTrainingPlanTemplateSchedulingController.ts`

In these controllers, navigation is mixed with:

1. overlay dismissal
2. state resets
3. mutation invalidation
4. alerts
5. redirect bookkeeping

This increases perceived latency and makes route behavior inconsistent.

### 4. Shared shell components trigger their own network reads

`apps/mobile/components/shared/HeaderButtons.tsx` fetches unread counts for messages and
notifications whenever the header mounts.

This is not the main bottleneck, but it adds background work to many screens.

### 5. Route intent is still not encoded clearly

The codebase currently mixes:

1. `router.navigate(...)`
2. `router.replace(...)`
3. `useDedupedPush()`

The semantics are mostly correct, but the intent is distributed instead of defined in one place.

## Desired Architecture

### Route semantics

Use three explicit routing intents:

1. `navigate`
   Reuse or focus an existing route when duplicate stack entries are not desired.
   Use for tabs, inbox, notifications, profile, activity detail, plan detail, and similar screens.
2. `replace`
   Use for redirects, auth transitions, onboarding completion, and completion-state flows where the
   previous route should not remain in history.
3. `push`
   Use only when a new stack entry is intentionally required.

Important principle:

Do not implement duplicate-screen prevention by rebuilding route identity in userland when Expo
Router can already express the intended behavior.

### Query policy

Let the global query client own the default freshness policy.

Schedule-sensitive screens may still use tighter freshness than the rest of the app, but that
policy should be centralized in one layer instead of duplicated by local overrides.

### Screen composition

Split heavy screens into:

1. critical route-entry data
2. deferred secondary data
3. manually refreshed or invalidated schedule-sensitive data

Avoid making route entry depend on every chart, aggregate, or secondary panel.

### Controller boundaries

Navigation controllers should decide where to go.

Mutation and cleanup helpers should update state and invalidate caches, but they should not force
every navigation path to wait on unrelated work.

## Concrete Next Pass

### Pass 1: remove over-refetching from planning and scheduling flows

Goal:

Reduce route-entry network churn before touching UI composition.

Files:

1. `apps/mobile/lib/api/scheduleQueryOptions.ts`
2. `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
3. `apps/mobile/app/(internal)/(tabs)/plan.tsx`
4. `apps/mobile/lib/hooks/useTrainingPlanSnapshot.ts`
5. `apps/mobile/lib/hooks/useProfileGoals.ts`

Changes:

1. stop forcing `staleTime: 0` and `refetchOnMount: "always"` in local scheduling query options
2. rely on the global query client defaults for schedule-sensitive keys unless a specific screen
   proves it needs stricter behavior
3. remove duplicate refetch triggers where a screen already refetches on focus or after mutation
4. keep mutation-driven invalidation as the primary freshness mechanism for schedule updates

Expected result:

1. navigating back into calendar and plan screens should use warm cache more often
2. route transitions should become faster and less bursty
3. scheduling updates should still remain correct because invalidation already exists

### Pass 2: reduce above-the-fold query load on plan and calendar

Goal:

Make route entry cheap even when the destination screen is feature-rich.

Files likely involved:

1. `apps/mobile/app/(internal)/(tabs)/plan.tsx`
2. `apps/mobile/components/plan/usePlanDashboardViewModel.ts`
3. `apps/mobile/lib/hooks/useTrainingPlanSnapshot.ts`
4. `apps/mobile/app/(internal)/(tabs)/calendar.tsx`

Changes:

1. identify which queries are truly required for first paint
2. defer secondary chart and analytics reads until after first render or interaction
3. avoid bundling multiple derived queries into one screen mount path when not all panels are visible

### Pass 3: decouple route transitions from side effects

Goal:

Make navigation handlers cheap and predictable.

Files likely involved:

1. `apps/mobile/lib/calendar/useCalendarScreenController.ts`
2. `apps/mobile/components/activity-plan/useActivityPlanSchedulingActions.ts`
3. `apps/mobile/components/training-plan/useTrainingPlanTemplateSchedulingController.ts`

Changes:

1. remove unnecessary delay points around navigation
2. keep overlay teardown minimal and synchronous where safe
3. move broad invalidation and refresh behavior out of direct route callbacks when possible
4. ensure success alerts do not become the main driver of route transitions

### Pass 4: formalize route-intent helpers

Goal:

Make route usage consistent and easy to review.

Changes:

1. rename `useDedupedPush()` to an intent-accurate helper such as `useAppNavigate()`
2. keep `replace` calls explicit in redirect flows
3. reserve raw `push` for the few places where new stack entries are truly intended

## Proposed First Three Code Changes

If we start implementation immediately, the first three changes should be:

1. simplify `apps/mobile/lib/api/scheduleQueryOptions.ts` so it no longer overrides the global
   cache policy with `staleTime: 0` and `refetchOnMount: "always"`
2. remove the extra `useFocusEffect(refetchActivities)` path from `apps/mobile/app/(internal)/(tabs)/calendar.tsx`
   if the screen already gets correct freshness from invalidation and global policy
3. reduce duplicate planning refetch behavior in `apps/mobile/app/(internal)/(tabs)/plan.tsx` and
   `apps/mobile/lib/hooks/useTrainingPlanSnapshot.ts`

## Acceptance Criteria

1. navigating between internal mobile screens no longer triggers unnecessary cold refetches for
   planning and scheduling data
2. calendar and plan screens feel faster when revisited in the same session
3. scheduling and mutation flows still show fresh data after invalidation
4. duplicate route prevention relies on route semantics rather than custom route-key comparison
5. route handlers are easier to classify as `navigate`, `replace`, or `push`

## Suggested Verification

1. manually move between tabs and detail screens while watching request volume
2. confirm calendar and plan screens do not refetch multiple times on a single route entry
3. schedule, edit, and delete an event and confirm invalidation still refreshes the affected views
4. verify hub routes such as messages and notifications do not stack duplicate screens
