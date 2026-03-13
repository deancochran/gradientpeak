# Implementation Plan: Scheduling UX + Refresh Simplification

## 1. Strategy

Treat this as a product-correctness and workflow-simplification pass.

Implementation should proceed in this order:

1. stabilize post-mutation freshness,
2. repair broken scheduling entry points,
3. simplify activity-plan scheduling flows,
4. simplify training-plan scheduling actions and copy,
5. validate the full cross-screen experience.

The main goal is to make scheduling feel immediate and coherent, not to add more branching UI.

## 2. Current Issues To Address

### A. Cache freshness is not deterministic after scheduling writes

Current mutation and query behavior allows screens to render stale data after create, update, delete, and apply flows.

### B. Screen-specific invalidation has drifted

Different scheduling surfaces invalidate different query families, causing some views to refresh while others remain stale.

### C. Calendar scheduling is not schedule-first

Choosing planned activity from calendar currently redirects users into discover-style browsing instead of completing a schedule-focused flow.

### D. Shared-plan flows create unnecessary friction

The current shared activity-plan and training-plan experiences require users to interpret ownership and template semantics before the app helps them complete the scheduling job.

### E. Some CTAs are broken, misleading, or too technical

`Schedule Now`, `Apply Template`, `Edit Structure`, and some scheduling warnings need cleanup so the user sees accurate, actionable next steps.

## 3. Target Product Behavior

### A. Refresh behavior

- scheduling mutations refresh the affected schedule views deterministically,
- success navigation happens only after required refresh work is queued or completed,
- plan and calendar surfaces agree immediately after scheduling changes,
- users do not need pull-to-refresh for the normal happy path.

### B. Calendar behavior

- calendar remains the fastest path for creating a scheduled item,
- selecting planned activity opens a direct scheduling flow,
- the chosen day stays preselected throughout the flow.

### C. Activity-plan behavior

- owned plans can be scheduled in one direct flow,
- shared plans use a continuous duplicate-first scheduling flow,
- no schedule CTA leads to a dead-end alert.

### D. Training-plan behavior

- primary CTA language emphasizes scheduling outcomes,
- editable-copy actions remain available but clearly secondary,
- warnings match real backend behavior,
- success returns users to an updated destination that clearly shows the scheduled result.

## 4. Backend / Client Contract Changes

### A. Query freshness contract

- audit query defaults for schedule-sensitive domains,
- introduce tighter refresh behavior for scheduling-related queries,
- avoid depending on long stale windows for event, plan, and projection surfaces.

### B. Mutation helper cleanup

- update shared mutation helpers so invalidations/refetches are awaited before onSuccess navigation where needed,
- support a consistent post-mutation refresh sequence.

### C. Invalidation standardization

- define the exact query families affected by event create/update/delete and training-plan apply flows,
- centralize that mapping instead of letting each screen guess.

### D. Follow-up architecture note

If targeted fixes still expose structural issues, document a follow-up spec for first-class applied training-plan instances.

## 5. Mobile App Changes

### A. Calendar

- replace calendar -> discover redirect for planned activity with a schedule-first selection flow,
- preserve selected date and streamline completion back into calendar.

### B. Activity-plan detail

- replace alert-based shared-plan schedule blocking with a continuous duplicate-and-schedule path,
- ensure success returns to an updated, correct destination.

### C. Activity-plan creation success

- repair `Schedule Now` so it opens a valid scheduling flow for the newly created plan.

### D. Training-plan detail

- rename scheduling CTAs toward outcome language,
- demote copy/edit actions relative to schedule actions when appropriate,
- align warning dialogs with actual backend behavior,
- ensure apply/schedule success visibly updates downstream plan/calendar UI.

### E. Shared supporting surfaces

- review plan tab, scheduled activities list, event detail, and related schedule entry points for refresh consistency.

## 6. Validation

Required focused checks after implementation:

```bash
pnpm --filter mobile check-types
pnpm --filter @repo/trpc check-types
pnpm --filter mobile test -- --runInBand
```

Required product validations:

- schedule from calendar and see result immediately,
- schedule from owned activity plan and see result immediately,
- schedule from shared activity plan through duplicate-first flow,
- schedule/apply from training plan and see downstream plan/calendar updates,
- create activity plan -> `Schedule Now` opens a working next step,
- no key flow requires manual refresh in the happy path.

## 7. Rollout Order

1. Refresh contract and mutation helper fixes.
2. Calendar planned-activity entry repair.
3. Activity-plan duplicate-and-schedule flow.
4. Training-plan CTA/copy/warning cleanup.
5. Cross-screen validation and regression cleanup.

## 8. Expected Outcomes

- Scheduling feels trustworthy because success is immediately visible.
- Users take fewer steps to reach a usable scheduled event.
- CTA language better matches user intent.
- The app exposes less internal product complexity during scheduling.
