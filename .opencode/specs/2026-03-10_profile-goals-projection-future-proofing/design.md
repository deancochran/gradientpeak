# Design: Profile Goals + Projection Future-Proofing

## 1. Vision

The application should be able to accept a wide range of athlete contexts and still produce useful, feasible, and honest guidance. A user with no activity history, a master's endurance athlete, a novice preparing for a first 5K, a cyclist targeting FTP, a swimmer training for pace, and a hybrid athlete managing multiple priorities should all be representable without forcing the system into brittle guesses.

The current system has the right intent but the wrong long-term boundary. `@repo/core` already contains a richer typed target model for projections, while persisted `profile_goals` records remain flatter and more ambiguous. This creates translation heuristics, hidden assumptions, and lossy fallbacks between storage, API, and calculation layers.

The target architecture is a canonical athlete-planning domain made of four stable concepts:

1. **Goal**: the user's intent, priority, timing, and ownership.
2. **Goal Objective**: a typed target payload that fully describes what success means.
3. **Athlete Snapshot**: the athlete's measurable capability, constraints, and context.
4. **Preference Profile**: the athlete's training preferences, availability, and planning tolerances.

Projection and recommendation logic should consume those canonical inputs directly and return plan-level and goal-level outputs that distinguish:

- what is desired,
- what is feasible,
- what is recommended,
- what is currently likely,
- and why a goal is limited.

## 2. Product Objectives

- Support users with sparse, stale, or rich history without returning null or misleading projections.
- Support multiple athletic disciplines and future activity types without relying on free-text inference.
- Support multiple goal families beyond simple race and threshold targets.
- Preserve MVP simplicity in CRUD and UI while making room for richer future behavior.
- Keep recommendations feasibility-aware so guidance remains helpful instead of aspirational nonsense.
- Keep readiness semantics honest by separating target attainment, event readiness, and plan feasibility.

## 3. Core Design Principles

### A. Canonical typed payloads over string reconstruction

The system should persist enough structured data so that projections do not need to infer discipline, units, or distance from `title`, `goal_type`, or `target_metric` strings.

### B. User intent should stay separate from engine policy

Stable user-facing preferences should not be stored as a thin alias of the internal training-plan creation config. User settings, engine calibration, and generated planning diagnostics are different concerns and should remain separate over time.

### C. Capability modeling should be continuous and sport-aware

The engine should avoid collapsing athlete readiness and starting state into coarse buckets when better continuous signals can be supported.

This applies to both athlete capability and evidence quality. The system should prefer smooth recency decay, continuous uncertainty, and sport-specific priors over coarse bucket transitions.

### D. Recommendations should be dose-based and feasible

The system should recommend an achievable training dose in context: load, volume, key-session density, intensity mix, ramp shape, and recovery pressure where possible.

Recommendations should be returned in user-comprehensible units even when internal modeling uses load metrics. The product should always be able to explain training guidance in terms of weekly duration, session count, long-session target, and key-workout density.

### E. Multi-goal planning should be explicit about tradeoffs

As users add overlapping goals, the system should explain which goals are constrained by time, capacity, or interference from other goals.

### F. Load should be sport-specific, not universally interchangeable

The system should treat training load as a family of sport-specific stress calculations rather than a single universal TSS equation.

- Cycling load should prefer power-based stress when available.
- Running load should prefer pace or grade-aware stress when available.
- Swimming load should use swim-threshold-specific stress when available.
- Heart-rate-based load should be a fallback with lower confidence, not an equal substitute.

Cross-sport aggregation may still exist for trend views, but it must not be treated as the primary physiological truth.

### G. User trust requires visible confidence and fallback semantics

The engine should expose how it arrived at its conclusions. Every major recommendation and projection should carry confidence, provenance, and fallback depth so users can distinguish measured, inferred, adjacent-sport, and conservative-baseline guidance.

## 4. Target Domain Model

### A. Goal

The persisted goal record should represent the stable header for a user goal:

- identity and ownership,
- title and status,
- priority/importance,
- discipline/activity category,
- timing strategy,
- source metadata,
- a typed objective payload reference or inline payload.

The goal record should remain simple enough for current CRUD flows.

### B. Goal Objective

The objective describes what the athlete is trying to achieve. It should be a versioned discriminated union that can grow over time.

Initial supported families should include:

- event performance,
- threshold or benchmark improvement,
- completion goals,
- volume or consistency goals,
- body-composition or health-adjacent goals only if the app later chooses to support them explicitly,
- hybrid or multi-leg goals when the app is ready.

Each objective should be able to encode units, directionality, tolerances, environmental context, and supporting target details.

### C. Athlete Snapshot

The athlete snapshot should capture what the engine needs to reason about feasibility:

- current measurable state,
- primary and secondary disciplines,
- training age and history quality,
- durability and recovery profile,
- constraints or context that materially affect planning.

The athlete snapshot should also support per-sport capability slices rather than forcing all capability into one blended state. Hybrid athletes should be representable without collapsing run, bike, and swim evidence into one undifferentiated profile.

This should allow sparse-data users to receive conservative, non-null outputs while still letting richer-data users benefit from more specific projections.

### D. Preference Profile

Preferences should represent how the athlete wants to train, not how the engine is internally implemented. This includes:

- availability,
- schedule constraints,
- desired aggressiveness,
- recovery conservatism,
- workout density preferences,
- plan churn tolerance,
- event prioritization behavior.

## 5. Functional Requirements

### A. Goal representation

- A goal must support a first-class `activity_category` or equivalent discipline field.
- A goal must support a typed target payload with versioning.
- A goal must support explicit source attribution for manual and imported flows.
- A goal must support either explicit target timing or event-derived timing with a clear invariant.
- A goal objective must be rich enough to derive a continuous demand profile rather than only a categorical goal type.

### B. Projection inputs

- Projection must consume canonical goal objectives rather than rebuilding them in tRPC.
- Projection must support no-history, sparse-history, and rich-history athletes.
- Projection must support sport-aware feasibility assumptions.
- Projection must support multiple simultaneous goals.
- Projection must support per-sport rolling load state and discipline-specific evidence quality.
- Projection must support method-aware load provenance (`power`, `pace`, `swim_threshold`, `heart_rate`, `manual`).

### C. Projection outputs

- Return recommended training load with feasibility context.
- Return per-goal readiness and attainment likelihood.
- Return confidence and limiting factors.
- Distinguish timeline-limited, capacity-limited, and mixed-limit cases.
- Preserve safe fallback behavior when evidence is weak.
- Return separate user-facing judgments for target attainment, event readiness, and plan feasibility.
- Return recommendation ranges in both load terms and user-facing dose terms.
- Return fallback mode, confidence breakdown, and calculation provenance.
- Return per-goal limiter shares and plain-language change levers where possible.

## 6. Modeling Requirements

### A. Preferred modeling patterns

The projection engine should prefer these patterns when expanding or replacing existing calculations:

- smooth continuous functions over bucket transitions,
- recency decay over stale/not-stale flags,
- saturating dose-response curves over linear extrapolation,
- shrinkage toward sport-specific priors when evidence is weak,
- component-weighted demand profiles over single categorical difficulty labels,
- uncertainty propagation over point-estimate-only scoring,
- partial transfer coefficients over all-or-nothing cross-sport assumptions.

### B. Current calculation weaknesses to correct

The current system contains several patterns that should be reduced over time:

- readiness-derived target metric estimation when explicit sport-specific projection is possible,
- binary sparse-data fitness classification,
- hard feasibility thresholds that create abrupt output jumps,
- single-plan demand-gap logic applied too broadly to multiple goals,
- generic TSS-like reasoning used where sport-specific stress would be more accurate,
- hidden fallback behavior that is not surfaced to the user.

### C. Minimum additive improvements

The following improvements should be treated as the minimum future-proofing package because they deliver high impact without excessive complexity:

1. add calculation provenance and fallback labeling,
2. keep per-sport rolling state before any combined summary,
3. add sport-specific load methods and confidence,
4. replace coarse evidence buckets with continuous recency-weighted evidence,
5. separate target attainment, event readiness, and plan feasibility in outputs,
6. add per-goal limiter decomposition,
7. add a simple mechanical-stress channel for impact-heavy sports,
8. upgrade sparse-data priors from binary classes to continuous capability factors.

## 7. Non-Goals

- This spec does not require a full multi-target consumer UI immediately.
- This spec does not require supporting every athletic domain in the first implementation.
- This spec does not require replacing the current MVP goal editor in one cutover.
- This spec does not require removing current compatibility columns on day one.

## 8. Success Criteria

- New goal types and disciplines can be added without text-parsing hacks.
- Projection logic in `@repo/core` becomes the canonical translation point for goals.
- Recommended load remains available and reasonable for sparse-data users.
- Goal scoring becomes more honest about uncertainty and feasibility.
- Sport-specific load calculations become first-class without requiring a full engine rewrite.
- Outputs become more trustworthy because fallback depth and confidence are visible.
- Small changes in timing or load no longer create abrupt category jumps when a smooth relationship is more appropriate.
- The app can evolve from endurance-focused MVP logic toward broader athlete support without another schema reset.
