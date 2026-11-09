# Plan Tab — Daily Training Command Center

The **Plan tab** is the athlete's command center for answering one question:

> What should I do next?

Plan summarizes four signals without becoming the canonical diagnostic surface:

1. Goal progress
2. Threshold development
3. Load, fatigue, and readiness
4. Planned versus completed training

Calendar remains the detailed scheduling surface. It places and edits activities, but it does not define whether the athlete has an active or inactive Plan dashboard.

Full trajectory reasoning, readiness explanations, confidence, threshold evidence, and contributing activities belong to Goal detail. Advanced analysis owns reproducible investigation of the underlying evidence.

## Product boundary

- **Plan:** what should I do next?
- **Goal detail:** how am I progressing toward this goal, and why?
- **Advanced analysis:** let me investigate the underlying evidence.

## Dashboard hierarchy

The landing screen is organized around the athlete's decision:

1. Compact primary-goal card with small trajectory and readiness signals
2. One navigable completed-versus-planned Load timeline
3. One selected-day context containing Load, today's recommendation when applicable, and that day's work and actions

The dashboard does not lead with a globally active training plan, a separate Today card, or a duplicate Upcoming list.

## Goal summary

The highest-priority goal supplies compact context. Higher numeric priority wins; ties resolve by target date and then stable identity. Chart-marker selection never replaces this primary card.

The canonical Goal card shows the objective, goal date, and small trajectory/readiness status signals. Tapping it opens Goal detail. Plan does not show readiness reason codes, confidence, threshold provenance, or contributing activities.

All goal markers are chronological on the Load timeline. The primary goal is visually emphasized, same-date goals collapse into a count, and goals outside the rendered viewport have edge indicators. Marker taps open Goal detail; same-date goals also appear in selected-day context. The projection contract currently returns the first 100 priority-ordered markers and explicitly reports truncation; supporting more requires a paginated lightweight marker read rather than an unbounded projection response.

## One temporal grammar

A continuous timeline connects past evidence, today's physiological state, future scheduled training, and the selected goal date:

```text
Past performance ─── Today ─── Future training ─── Goal
     actuals          state          plan             target
```

The shared chart shell preserves that temporal context across Goal detail and Advanced analysis:

- **Plan:** completed and planned Load only, with explicit Today and goal context.
- **Goal detail:** comparable calculated threshold progress, target, tolerance, confidence, and provenance.
- **Advanced analysis:** exactly one of Progress, Load, Fitness, Fatigue, or Form.

All charts share exactly four analysis windows: **6 weeks, 3 months, 6 months, and 1 year**. Each is an inclusive calendar-date range centered as closely as possible on one selected anchor date. The Plan Load timeline defaults to one bar position per calendar day. A separate, explicit **Day / Week / Month** binning control can aggregate the currently selected window without silently changing resolution when the date range changes. One year is a window size, never a grouping resolution. Load bars and the Fitness, Fatigue, and Form trend lines are visible by default, while users may independently hide each trend; the selected binning applies to those trends as calendar-bucket endpoint values rather than summing state metrics. Every rendered bucket has a value for each trend. Core calculations remain authoritative, use the prior state plus the 42-day Fitness and 7-day Fatigue responses, and assume zero for a day where no Load can be established; this trajectory assumption does not convert an unavailable Load bar into a known-zero bar. The chart uses smooth curves and fills any presentation-only gaps without crossing the actual/projected boundary at Today. Moving backward or forward shifts the anchor by one complete period, while selecting or scrubbing a bar changes selection without changing the window.

The landing Plan dashboard keeps its default projection cheap. Wider windows are requested on demand, and no projection request may exceed 366 inclusive calendar days. Historical evidence is never stretched to the goal date; missing, partial, zero, and unavailable days retain their authoritative meanings throughout a wider projection.

Advanced analysis lives at `/plan-analysis`. Its goal, anchor date, view, metric, and range are URL-owned. Training analysis selects exactly one of Load, Fitness, Fatigue, or Form; these are not global persisted display preferences.

## Evidence rules

Interpretation must not present rising Load as evidence of improving performance. Actual and projected series remain distinct, and missing values remain gaps.

When fewer than two comparable threshold assessments exist, Goal detail and Progress analysis state:

> A performance trend requires two or more comparable threshold assessments.

Complete, partial, zero, stale, and unavailable data remain distinct. A finite partial completed-Load subtotal remains numerically visible and plotted while its internal status prevents coaching and projection logic from treating it as complete. Goal readiness, threshold confidence, and physiological state are shown as their own signals rather than collapsed into a false universal score.

## Selected day

Plan has one selected-day composition below the timeline. Past days show completed work and observed Load; today shows completed and planned work, Load, and one short next-action statement; future days show scheduled work and planned Load; empty dates show one concise Add state. Canonical calendar/activity rows provide item navigation. Plan does not repeat goal-specific readiness diagnosis.

## Goal detail

Goal detail is the canonical diagnosis surface. It owns trajectory, readiness reason codes, confidence, freshness, threshold progress, selected evidence, contributing activities, and the entry point to Advanced analysis. Unavailable, insufficient, stale, and adverse signals remain visibly distinct.

## Freshness and coherence

Every coaching signal exposes calculation time and freshness. Signals may be described as aligned only when their authoritative revisions agree. Partial refresh failure keeps usable cached data visible while identifying which signal is unavailable or stale.

## Programs as scheduling sources

Applying a program creates or updates calendar activities. Scheduled activities retain their source, and multiple goals or program sources may coexist where valid. Pausing or removing a program affects future scheduled work without rewriting completed history.

The Plan dashboard derives its state from goals, thresholds, calendar activities, completed results, and athlete-state projections—not from one globally active plan card.

## Application responsibilities

- **Home:** social and activity feed
- **Plan:** primary goal health, navigable Load, and selected-day work and actions
- **Goal detail:** complete goal diagnosis and evidence
- **Advanced analysis:** reproducible evidence investigation
- **Calendar:** detailed scheduling and day management
- **Record:** activity recording
- **Profile:** identity, history, achievements, and account information
