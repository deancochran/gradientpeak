# Training Plan Mobile UI Spec (Plan Tab + Onboarding Quickstart)

Last Updated: 2026-02-09  
Status: Draft for implementation planning  
Owner: Mobile + Product + Design

This document defines the visual and interaction contract for the Training Plan MVP mobile experience. It complements `./design.md` and `./plan.md` by specifying exactly what users see and how they interact.

---

## 1) Goals and Scope

### In Scope

- Plan tab information architecture and visual hierarchy
- Plan tab component inventory and states
- Chart surfaces available in MVP
- Chart and panel interaction behaviors
- Onboarding quickstart enhancements beyond current flow
- Related UI updates needed to keep setup and Plan tab coherent

### Out of Scope

- Workout interval-builder UI
- Coach or multi-user collaboration tooling
- New design system primitives

---

## 2) Plan Tab Information Architecture

Plan tab is a decision-support screen, not a settings screen.

Top-to-bottom order:

1. **Header strip**
   - active goal name
   - goal date badge
   - feasibility state chip (`feasible | aggressive | unsafe`)
2. **Status summary card**
   - boundary state badge (`safe | caution | exceeded`)
   - one-sentence divergence summary
   - quick confidence indicator (High/Medium/Low)
3. **Primary chart: Three-path load chart**
   - Ideal vs Scheduled vs Actual
4. **Secondary chart row**
   - adherence trend sparkline
   - capability/projection mini chart
5. **Drivers panel (expandable)**
   - top reasons and threshold details
   - "what would change this state" guidance
6. **Action row**
   - Edit plan constraints
   - View calendar
   - Recheck feasibility

---

## 3) Plan Tab Components

## 3.1 Header Strip

- Goal title (single-line truncation)
- Date chip (`target_date`)
- Priority chip (always present in UI, sourced from defaulted/stored priority)
- If multiple goals: compact goal switcher control with current goal highlighted

## 3.2 Status Summary Card

- Boundary badge with semantic color only:
  - safe = green
  - caution = amber
  - exceeded = red
- Feasibility badge shown beside boundary when goal is aggressive/unsafe
- Primary sentence pattern:
  - "Actual load is {x}% over/under scheduled this week"
- Secondary sentence:
  - top driver (example: "2 missed key sessions on Tue/Thu")

## 3.3 Three-Path Chart Container

- Title: "Load Path"
- Legend order fixed: Ideal, Scheduled, Actual
- Time range chips: `7D`, `30D`, `90D`
- Optional empty state when timeline has insufficient data

## 3.4 Secondary Chart Row

1. Adherence mini chart

- Y-axis hidden, percentage labels at start/end only
- State tint on latest point (safe/caution/exceeded context)

2. Capability/projection mini chart

- Current estimated capability marker
- Goal-date projection marker with confidence tint
- Supports CP or CS presentation by activity category

## 3.5 Drivers Panel (Expandable)

- Collapsed default on first load
- Sections:
  - "Top Drivers"
  - "Thresholds Near/Exceeded"
  - "What would change this state"
- Must include explicit reason identifiers from backend (humanized labels)

## 3.6 Action Row

- `Adjust Plan`
- `Open Calendar`
- `Recalculate`

Action row remains visible below drivers panel and uses low-emphasis styling.

---

## 4) Charts Available in MVP

1. **Three-Path Load Chart (Primary)**
   - Lines: `ideal_tss`, `scheduled_tss`, `actual_tss`
   - Supports date scrub and point tooltip
2. **Adherence Trend Sparkline**
   - Line: `adherence_score`
   - Optional threshold guides: 60 and 80
3. **Capability/Projection Mini Chart**
   - Points: capability timeline (`cp_or_cs`)
   - Marker: projected value at goal date

No additional chart types are required for MVP in Plan tab.

---

## 5) Plan Tab Interactions

## 5.1 Global Interactions

- Pull-to-refresh triggers `getInsightTimeline` refetch
- Time range chip selection updates all chart windows together
- Goal switcher updates summary, charts, and drivers in one transaction

## 5.2 Chart Interactions

- Tap/drag on primary chart shows synchronized vertical cursor across mini charts
- Tooltip displays date + Ideal/Scheduled/Actual + adherence
- Long-press opens per-day detail drawer
- Legend toggles are allowed only for secondary emphasis; Actual line cannot be hidden

## 5.3 Drivers/Details Interactions

- Tap status summary card opens drivers panel directly
- Tap boundary badge opens threshold detail modal
- Modal includes plain-language reason + machine reason key

## 5.4 Empty/Error/Loading States

- Loading: skeleton summary + skeleton chart blocks
- Empty: clear explanation and next action ("Schedule your first week")
- Error: inline retry action, no blocking full-screen takeover

---

## 6) Onboarding Quickstart Enhancements

Goal: move from full onboarding dependency to fast plan-start, then progressive enrichment.

## 6.1 Quickstart Entry

- Add "Start Quick Plan" path in onboarding and profile setup
- Required fields remain exactly:
  - goal name
  - target date
- Priority is optional input and defaulted server-side when omitted

## 6.2 Quickstart Flow

1. Goal + date input
2. Optional precision helper (collapsed)
3. Feasibility preview
4. Create plan
5. Post-create checklist (non-blocking)

## 6.3 Post-Create Enrichment (Non-blocking)

- Prompt cards shown after plan creation:
  - add availability
  - set weekly volume preference
  - connect profile metrics data sources
- Dismissed cards should not re-block Plan tab usage

## 6.4 Unsafe Goal Handling UX

- `aggressive`: allow create with warning banner
- `unsafe`: require explicit confirmation sheet before create
- Confirmation copy must state this is guidance, not prescription

---

## 7) Related UI Updates Outside Plan Tab

- **Today tab**: add compact boundary + adherence snapshot card that deep-links to Plan tab drivers panel.
- **Calendar tab**: after schedule edits, show transient "Plan updated" state and provide one-tap return to Plan tab.
- **Training plan create screen**: collapse advanced controls by default and keep one-goal form above fold.
- **Profile settings**: move advanced planning preferences to a dedicated subsection; do not expose in quickstart.

---

## 8) Accessibility and Usability Requirements

- Color is never the only state signal; all badges include text labels.
- Touch targets minimum 44x44 points.
- Charts must provide textual fallback summary for screen readers.
- Dynamic type support required for summary card and action row.
- Interaction count target: boundary state + top driver visible within 2 taps from app open.

---

## 9) Implementation Mapping

Primary files expected to change:

- `apps/mobile/app/(internal)/(tabs)/plan.tsx`
- `apps/mobile/components/charts/PlanVsActualChart.tsx`
- `apps/mobile/components/training-plan/create/SinglePageForm.tsx`
- `apps/mobile/app/(internal)/(standard)/training-plan-create.tsx`

Supporting files likely:

- `apps/mobile/components/...` (new status summary, drivers panel, chart wrappers)
- `packages/trpc/src/routers/training_plans.ts` (payload fields consumed by UI)

---

## 10) Acceptance Criteria (UI-Specific)

- Plan tab shows boundary state, feasibility state, and divergence sentence above charts.
- User can view Ideal/Scheduled/Actual and adherence trend in a single scroll without entering another screen.
- Time window switching updates all chart surfaces consistently.
- Drivers panel exposes both plain-language and explicit threshold reason details.
- Quickstart allows plan creation with only goal name + target date input in under 60 seconds.
- Post-create enrichment is suggested, never blocking.
