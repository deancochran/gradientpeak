# Training Plan Feature Spec

**Last Updated:** 2026-02-06
**Status:** Draft for implementation planning
**Owner:** Mobile + Core + Backend

---

## 1) Problem Statement

Users need clearer guidance than a standalone load number. They need to know exactly which activity to perform, at what intensity and duration, to stay on track toward sprint, endurance, or multisport goals.

Recent data model changes (`profile_metrics` and `activity_efforts`) enable dynamic, non-stale derivations of capability and readiness. This unlocks recommendations based on fresh best-effort evidence and power/pace curves instead of stale snapshots.

This spec defines a training-plan redesign that is novice-friendly by default, advanced when needed, and explicit about why each recommendation is suggested.

---

## 2) Product Goals

- Provide activity-level prescriptions (not only aggregate TSS targets).
- Provide three aligned dynamic paths: Ideal Path, Scheduled Path, and Actual Path.
- Keep recommendations dynamic and non-stale through derived computations.
- Support any activity category and multisport training plans.
- Offer sensible defaults for inexperienced users with progressive disclosure for advanced users.
- Help users understand timeline, progression, and calendar tradeoffs.
- Preserve training safety via fatigue, ramp-rate, and spacing guardrails.
- Make adherence visible as a time-series guide, not only aggregate weekly summaries.

## 3) Non-Goals

- This spec does not define final interval-builder UX for custom workout authoring.
- This spec does not replace all existing analytics screens in this phase.
- This spec does not require external coach tooling in initial rollout.

---

## 4) Primary User Story

As a user, I want to know what activity plan I should complete to stay on track, not just a number, so I can train in the right zones and optimally progress toward my goals.

---

## 5) Personas and Experience Modes

- **Novice Athlete**
  - Wants quick setup and confidence.
  - Uses defaults for schedule, progression, and intensity distribution.
  - Needs clear explanation and safe fallback sessions.
- **Intermediate Athlete**
  - Wants limited customization (days, duration caps, goal focus).
  - Expects adaptive plan behavior when schedule changes.
- **Advanced Athlete**
  - Wants deeper control (sport weighting, ramp aggressiveness, distribution model, constraints).
  - Expects transparent recommendation rationale and confidence.

---

## 6) Data Foundations

### Core Inputs

- `activity_efforts`: canonical evidence of best efforts and recency.
- `profile_metrics`: athlete metrics and profile state used for personalized derivations.
- Recent activity history and training load signals.
- Training plan configuration (goals, timeline, constraints, calendar).

### Derived Artifacts (Dynamic)

- Power/pace curve model by activity category.
- Current capability estimate by phenotype (for example: sprint, threshold, endurance).
- Deficit signals between goal trajectory and projected trajectory.
- Ranked recommendation set for daily prescriptions.
- Daily and weekly adherence model across Ideal, Scheduled, and Actual paths.

### Canonical Path Definitions

- **Ideal Path:** normative load trajectory implied by plan design (blocks/progression), independent of scheduling/completion.
- **Scheduled Path:** calendar-specific workload from planned activities, with immutable scheduled snapshots.
- **Actual Path:** realized workload from completed activities and derived load metrics.
- **Adherence Score:** normalized score (0-100) combining Actual-vs-Scheduled alignment and Scheduled-vs-Ideal alignment.

### Freshness and Recompute Rules

- Recompute triggered on:
  - new/updated/deleted activity,
  - goal/profile/config edits,
  - calendar edits or missed/completed sessions,
  - daily rollover.
- Planning windows:
  - **Hot (0-14 days):** full recalculation.
  - **Warm (current block beyond hot window):** partial recalculation.
  - **Cold (future blocks):** template projection recalculated when entering horizon.
- Recalculation must run after any plan adjustment and regenerate all three paths for the active horizon.

---

## 7) Domain Model (Feature-Level)

- `Goal` and `GoalTarget` (objective, target date, KPI, priority).
- `TrainingPlan` (active version for a goal window).
- `PlanBlock` -> `WeekPlan` -> `DayPrescription` hierarchy.
- `ConstraintSet` (availability, duration caps, equipment, injury flags).
- `DerivedPerformanceState` and `CurveModel` (ephemeral computed state).
- `DeficitSignal` (what is behind target trajectory).
- `RecommendationSet` (ranked actionable options with rationale and confidence).

### Path and Adherence Data Contracts

- `IdealLoadPoint` (`date`, `ideal_tss`, optional `ideal_ctl`, plan-version metadata).
- `ScheduledLoadPoint` (`date`, `scheduled_tss`, `scheduled_sessions`, schedule-version metadata).
- `ActualLoadPoint` (`date`, `actual_tss`, `actual_ctl`, `actual_atl`, `actual_tsb`).
- `AdherencePoint` (`date`, `adherence_score`, `load_adherence`, `session_adherence`, `timing_adherence`, state label).

### Planned and Actual Activity Linkage Requirements

- `planned_activities` must store immutable scheduled snapshots (`planned_tss`, `planned_duration`, optional `planned_if`) at schedule time.
- `planned_activities` must support execution lifecycle status (`scheduled`, `completed`, `skipped`, `rescheduled`, `expired`) plus audit fields.
- `activities` must be linkable to schedule instances (nullable `planned_activity_id`) to measure exact plan adherence.
- Keep workout-template lineage separate from schedule-instance lineage.

---

## 8) Planning Workflow

1. **Goal Setup**
   - User selects goal type and horizon.
   - System maps intent to structured target(s).

2. **Calendar Configuration**
   - User selects available days/time windows.
   - System applies constraint defaults and feasibility checks.
   - System materializes Scheduled Path from concrete planned activities.

3. **Progression Construction**
   - Plan blocks generated by goal + current readiness + experience mode.
   - Safety guardrails applied before progression acceptance.
   - System materializes Ideal Path from blocks and progression targets.

4. **Daily Prescription**
   - System outputs primary workout and alternatives.
   - Every recommendation includes "why this now" and confidence.

5. **Adaptation Loop**
   - Completed/missed sessions update derived state.
   - Near-term prescriptions are re-ranked while preserving plan stability where possible.
   - Actual Path and adherence timeline are recalculated and reflected in UI.

6. **Plan Adjustment and Re-baselining**
   - User can adjust plan constraints, intensity, timeline, or priorities.
   - System stores adjustment history and recomputes Ideal, Scheduled, and projected adherence from active configuration.

---

## 9) Recommendation Engine Contract

Each `DayPrescription` must include:

- activity type,
- session archetype,
- duration and zone targets,
- expected impact on target deficit,
- confidence level,
- safety notes,
- at least one substitution option (shorter/easier/alternate modality),
- plain-language rationale.

### Explainability Model

- Top recommendation reason on card-level (one sentence).
- Expanded panel listing top drivers (phase objective, load/fatigue, deficit type, constraints).
- "What changes this recommendation" section to improve user trust.

---

## 10) Mobile IA and Key Screens

- `Today`: primary recommendation, quick actions (start/swap/snooze/complete), rationale.
- `Plan`: timeline view (base/build/peak/recovery), weekly focus and checkpoints.
- `Calendar`: week/month schedule, drag-to-reschedule, lock-day constraints.
- `Progress`: current trajectory, effort curve changes, on-track indicator.
- `Progress` must visualize three-path overlay (Ideal vs Scheduled vs Actual) and adherence trend.
- `Profile`: goals, availability, defaults, advanced controls.

### Core Interaction Requirements

- Recommendation available in <= 2 taps from app open.
- Calendar changes trigger recommendation refresh in the same interaction flow.
- Alternative workouts show impact preview before selection.
- Users can see whether divergence is from undertraining, overtraining, or schedule non-adherence.
- Any plan adjustment updates path visualizations and adherence state without requiring re-onboarding.

---

## 11) Onboarding and Configuration UX

### Novice-First Default Flow

1. Choose goal and target date/horizon.
2. Choose activity categories.
3. Choose training availability.
4. Confirm defaults and start.

### Advanced Optional Controls

- intensity distribution preference,
- ramp aggressiveness,
- sport weighting for multisport,
- weekly caps and hard constraints,
- event prioritization and recovery preferences.

### Defaulting Rules

- If data is sparse, use conservative starter plans and calibration workouts.
- If data quality is high, scale targets from latest valid efforts and profile metrics.

---

## 12) Safety, Guardrails, and Risk Mitigation

- Never recommend unsafe progression beyond configured fatigue/ramp thresholds.
- Prevent excessive hard-day clustering.
- Detect infeasible schedule constraints and provide clear resolution path.
- If confidence is low or data is stale, shift to conservative prescriptions and label clearly.

---

## 13) Edge Cases and Fallback Behavior

- **Cold start (no reliable data):** baseline plan + calibration guidance.
- **Sparse multisport data:** precise recommendations where data exists, conservative elsewhere.
- **Missed workouts:** re-plan near-term with no-guilt language.
- **Conflicting constraints:** minimum-effective-session fallback + prompt to adjust constraints.
- **Sensor/data gaps:** fallback to duration + RPE targets.

---

## 14) Acceptance Criteria

- User can complete setup and receive first recommendation in <= 2 minutes on defaults.
- System supports single-sport and multisport plans with consistent workflow.
- Today screen always provides one primary actionable prescription when feasible.
- Every recommendation displays rationale, confidence, and safety context.
- Recommendations derive from fresh effort/profile data and avoid stale best-effort assumptions.
- Calendar edits and missed sessions update near-term recommendations automatically.
- At least one alternative workout option is always provided for each daily prescription.
- Low-data users receive safe, explicitly labeled fallback recommendations.
- Advanced users can configure progression and distribution controls without affecting novice flow.
- Guardrails prevent unsafe ramping and intensity clustering.
- System computes and exposes Ideal, Scheduled, and Actual load paths for daily and weekly views.
- Scheduled Path is based on time-sensitive planned-activity snapshots, not recomputed estimates only.
- Actual Path is sourced from completed activities and current load calculations (CTL/ATL/TSB).
- Adherence score and state labels are derived from a documented, consistent weighting model.
- Completed activities linked to scheduled instances are reflected in adherence within the active recalculation window.
- Plan adjustments trigger recomputation and visual refresh of all adherence artifacts.

---

## 15) Testing and Quality Strategy

### Unit

- Progression and guardrail logic invariants.
- Derivation logic for load/capability/deficit computations.

### Integration

- Input freshness semantics for `profile_metrics` and `activity_efforts`.
- Recommendation contract completeness and fallback behavior.

### E2E (Mobile)

- Novice happy path from onboarding to day-1 recommendation.
- Advanced configuration path with multisport and calendar constraints.
- Missed-workout adaptation and swap/alternative actions.

### Definition of Done

- All critical invariants covered.
- Safety and fallback scenarios validated.
- Feature-level instrumentation and alerts active.

---

## 16) Instrumentation and Rollout

### Metrics

- recommendation generation success rate,
- recommendation confidence distribution,
- fallback rate by activity category,
- stale-data state frequency,
- unsafe recommendation prevention count.
- adherence score distribution by cohort and sport,
- path divergence rate (Ideal vs Scheduled, Scheduled vs Actual),
- plan-adjustment recompute latency.

### Adherence API/Query Requirements

- Provide aligned timeline endpoint for 7/30/90 day windows with `{date, ideal, scheduled, actual, adherence}` points.
- Provide weekly adherence summary endpoint with status buckets (on-track, slight-miss, major-miss, overload).
- Use athlete-local timezone and explicit week-boundary rules consistently across all adherence calculations.

### Rollout Strategy

- Feature-flagged phased rollout (internal -> small cohort -> wider cohort).
- Shadow evaluation mode before full exposure.
- Rollback triggers on safety, error, or latency regressions.

---

## 17) Open Questions

- How should phenotype goals be normalized across categories (for example run pace vs bike power)?
- What is the minimum data threshold to exit baseline mode per activity category?
- How much week-to-week plan variance is acceptable before user trust drops?
- Which confidence thresholds should gate high-intensity recommendations?
