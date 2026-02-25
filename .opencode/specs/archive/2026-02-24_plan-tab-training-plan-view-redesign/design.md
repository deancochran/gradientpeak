# Plan Tab & Training Plan View Redesign

Date: 2026-02-24
Owner: Product Design + Mobile App
Status: Proposed
Type: UX/IA Separation + Mobile Interaction Simplification

## Executive Summary

The Plan Tab and Training Plan View currently overlap too heavily, creating a blurred mental model.
This redesign enforces clear ownership:

1. Plan Tab = schedule execution and near-term decision support.
1. Training Plan View = full plan understanding, analytics, and editing authority.

The result should feel familiar to users coming from TrainingPeaks/Strava-style workflows while
remaining fast for daily use on mobile.

## Problem Statement

- Plan Tab exposes too much training-plan detail and management UI.
- Training Plan View does not provide enough compact, interactive insight surfaces.
- Users can encounter duplicate content across both screens, reducing clarity.
- Manage and Edit Structure controls appear in the wrong place.

## Goals

1. Enforce strict separation of concerns between Plan Tab and Training Plan View.
1. Make Plan Tab primarily calendar/scheduling focused with clear upcoming obligations.
1. Move Manage and Edit Structure controls exclusively to Training Plan View.
1. Add gallery-style chart cards in Training Plan View, specifically for adherence and readiness.
1. Meet navigation targets:
- One tap from Plan Tab to any primary screen.
- Two interactions from Plan Tab to reach and submit any editable database record.
1. Deliver a mobile-friendly, minimal, interactive experience with familiar training-app conventions.

## Non-Goals

- No changes to training science, scoring algorithms, or backend schema semantics.
- No full IA rewrite outside Plan Tab and Training Plan View.
- No desktop-first interaction patterns.

## Research Synthesis (Best Practices)

Observed patterns across training, periodization, and goal-tracking apps:

- Calendar-first operational home is the strongest daily-use model.
- Deep analytics and structure editing work best on a dedicated detail workspace.
- Users respond better to actionable score cards when each score includes short rationale.
- Quick edit actions should be in-context and reversible (auto-save + undo pattern).
- Migrating users expect chronological lists, familiar training terms, and tap-to-open detail flows.

Anti-patterns to avoid:

- Duplicating full dashboards across both Plan and detail screens.
- Hiding schedule-critical actions in overflow menus.
- Showing opaque readiness/capability scores without contributor context.
- Requiring more than two interactions for common edit-and-submit tasks.

## Information Architecture: Ownership Matrix

|Surface / Capability              |Plan Tab       |Training Plan View|
|----------------------------------|---------------|------------------|
|Today + next 72h obligations      |Primary        |Secondary context |
|Calendar scheduling (week/day)    |Primary        |Context only      |
|Full plan timeline (phases/blocks)|Link only      |Primary           |
|Workout detail metadata           |Preview only   |Primary           |
|Adherence/readiness deep analysis |Snapshot only  |Primary           |
|Manage Plan controls              |Not available  |Primary           |
|Edit Structure controls           |Not available  |Primary           |
|Record edit + submit              |Routed into TPV|Primary           |

Screen contract:

- Plan Tab: Read + Navigate + Start.
- Training Plan View: Read + Analyze + Edit + Manage.

## Navigation Model

### One-tap access from Plan Tab

Plan Tab must expose direct, one-tap entry points to all primary destinations:

- Calendar
- Workouts
- Progress
- Training Plan View
- Record/Start flow for immediate workout execution

### Two-interaction edit-and-submit model

Design quick workflows as:

1. Interaction 1: Select target item from Plan Tab deep link (opens TPV in focused edit state).
1. Interaction 2: Submit/Save from focused editor.

Examples:

- Edit planned workout note: tap row `Edit` -> tap `Save`.
- Adjust workout intent/intensity preset: tap row `Adjust` -> tap preset `Save`.
- Reschedule with day chips: tap row `Move` -> tap day chip (auto-save counts as submit).

Advanced workflows can exceed two interactions, but default/common paths cannot.

## Plan Tab Redesign Specification

Primary purpose: scheduling and immediate execution.

### Component hierarchy

1. Active Plan Header
- Plan name, cycle window, status.
- CTA: `Open Full Plan` (to Training Plan View).
1. Next Up Card (largest card)
- Required next session only.
- CTAs: `Start`, `View Details`.
1. Upcoming Obligations List (next 72h)
- Required/optional/done/missed states.
- Inline deep links to focused TPV edit states.
1. Calendar Block
- Compact week-first with tap-to-expand day agenda.
1. Weekly Snapshot Strip
- Planned vs completed volume and missed count only.
1. Lightweight Health Indicators
- Small readiness/adherence signal chips; no detailed charts.

### Content rules

- Do show what the user needs to do now and soon.
- Do not show full plan architecture, advanced analytics, or structure management controls.
- Do not expose Manage Plan or Edit Structure actions on this screen.

## Training Plan View Redesign Specification

Primary purpose: full plan detail, management, and editing.

### Top-level sections

1. Analyze
- Trend ranges (7/30/90 days), plan performance context.
1. Manage Plan
- Lifecycle operations and settings.
1. Edit Structure
- Phase/block/week structure editing.

### Required gallery cards

Add a tappable horizontal card gallery near top of screen.

Minimum required cards:

1. Adherence
1. Readiness (replace “Capability” label where still present)

Recommended supporting cards:

- Fatigue trend
- Event readiness/risk

Card design requirements:

- Small chart-style visual (sparkline or compact bar/area).
- Current value, directional trend, and simple status state.
- One-line explanation (“why this status”).
- Tap opens detail modal.

### Card detail modal requirements

For adherence and readiness modals:

- Metric definition and current interpretation.
- Contributor breakdown.
- Time range toggles.
- Recommended action CTA (e.g., proceed, reduce, reschedule).
- Dismiss via close button and gesture.

## Mobile UX Guidelines

- Keep high-priority actions above the fold.
- Use progressive disclosure for advanced controls.
- Maintain thumb-friendly targets (44x44 pt minimum).
- Preserve chronological presentation for sessions by default.
- Use familiar terminology: planned, completed, duration, distance, RPE, pace/power.
- Provide immediate visual feedback for all taps and loading states.

## Interaction Flows (Reference)

### Daily execution

1. Open Plan Tab.
1. Read `Next Up`.
1. Tap `Start`.

### Edit from Plan Tab with ownership preserved

1. Tap `Edit` from obligation row.
1. Land in TPV with focused editor open.
1. Tap `Save`.

### Insight deep dive

1. Open Training Plan View.
1. Tap `Adherence` or `Readiness` card.
1. Review modal + optional action.

## Acceptance Criteria

1. Plan Tab shows schedule and upcoming obligations without full plan-detail duplication.
1. Manage Plan and Edit Structure controls are not present on Plan Tab.
1. Training Plan View contains adherence and readiness gallery cards with tap-to-modal details.
1. Users can reach any primary screen in one tap from Plan Tab.
1. Users can complete common edit+submit flows in two interactions from Plan Tab entry.
1. Migrating users (TrainingPeaks/Strava familiarity cohort) report >= 4/5 familiarity for core tasks.