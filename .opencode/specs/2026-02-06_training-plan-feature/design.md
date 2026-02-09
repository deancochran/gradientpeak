Training Plan Feature Spec - Revision
Last Updated: 2026-02-06
Status: Draft for implementation planning
Owner: Mobile + Core + Backend

Document Role and Relationship
∙ `./design.md` is the high-level product/design source of truth (what and why)
∙ `./plan.md` is the low-level technical implementation source of truth (how in code)
∙ `./ui-plan-tab-and-onboarding.md` is the low-level UX/UI source of truth (screen structure, interactions, component behavior)
∙ All three documents must stay consistent; design intent should not conflict with technical or UX implementation details

1. Problem Statement
   Users need clearer understanding than a standalone load number. They need to see how their plan design, schedule, and completed training compare over time so they can make informed training decisions toward sprint, endurance, or multisport goals.
   Recent data model changes (profile_metrics and activity_efforts) enable dynamic, non-stale derivations of capability and readiness. This unlocks progression and adherence insights based on fresh best-effort evidence and power/pace curves instead of stale snapshots.
   This spec defines an MVP training-plan redesign that is novice-friendly by default, advanced when needed, and explicit about progression state, safety boundaries, and adherence drift.

2. Product Goals
   ∙ Provide three aligned dynamic paths: Ideal Path, Scheduled Path, and Actual Path
   ∙ Keep progression and adherence insights dynamic and non-stale through derived computations
   ∙ Support any activity category and multisport training plans
   ∙ Offer sensible defaults for inexperienced users with progressive disclosure for advanced users
   ∙ Help users understand timeline, progression, calendar tradeoffs, and boundary-state risk
   ∙ Preserve training safety via fatigue, ramp-rate, and spacing guardrails with clear visual cues when boundaries are exceeded
   ∙ Make adherence visible as a time-series guide, not only aggregate weekly summaries
   ∙ Keep setup and day-to-day interaction minimal while preserving core planning and insight functionality
   ∙ Prefer minimalistic UI with high-quality charts and clear visual states; avoid complex motion and style-heavy interactions
3. Non-Goals
   ∙ This spec does not define final interval-builder UX for custom workout authoring
   ∙ This spec does not replace all existing analytics screens in this phase
   ∙ This spec does not require external coach tooling in initial rollout
   ∙ This spec does not introduce a recommendation engine or auto-prescribed workouts
   ∙ This phase does not require database schema changes; implementation should use existing tables and evolve training plan JSON configuration
   ∙ This phase does not use expanded readiness signals from profile_metrics beyond weight and LTHR

4. Primary User Story
   As a user, I want to understand whether my recent and planned training keeps me on track and inside safe boundaries, so I can make my own choices and progress toward my goals.

5. Personas Creating Training Plans
   ∙ Novice Athlete
   ∙ Wants very quick setup and confidence
   ∙ Uses defaults for schedule, progression, and intensity distribution
   ∙ Needs clear progression status and obvious safety cues
   ∙ Intermediate Athlete
   ∙ Expects adaptive plan behavior when schedule changes
   ∙ May customize some constraints but relies on sensible defaults
   ∙ Advanced Athlete
   ∙ Wants deeper control (sport weighting, ramp aggressiveness, distribution model, constraints)
   ∙ Expects transparent model assumptions, boundary logic, and confidence indicators

6. Data Foundations
   Core Inputs
   ∙ activity_efforts: canonical evidence of activity efforts and recency; used to find best efforts in a given timeframe
   ∙ profile_metrics: limited to weight and LTHR usage in this phase
   ∙ activity_categories contract from Supazod-generated schemas/types (avoid hardcoded category enums in feature schemas)
   ∙ Recent activity history and training load signals
   ∙ Training plan configuration (goals, timeline, constraints, calendar)
   Derived Artifacts (Dynamic)
   ∙ Power/pace curve model by activity category
   ∙ Current capability estimate by phenotype (sprint, threshold, endurance); used to calculate FTP or threshold pace/speed estimations
   ∙ Deficit signals between goal trajectory and projected trajectory
   ∙ Progression-state insights and divergence annotations for each time window
   ∙ Daily/weekly/yearly adherence model across Ideal, Scheduled, and Actual paths
   ∙ Boundary-state classifications (safe, caution, exceeded) based on ramp, fatigue, and density limits
   Model-Shaping Inputs and Calculation Pipeline
   The model must be explicitly shaped by four input groups: 1. Training plan configuration
   ∙ Goal intent + target date/end date, optional activity category/ies, and optional advanced config (constraints, progression settings) define the Ideal Path and expected adaptation slope
   ∙ Goal modeling must support both approachable input (plain-language goal intent) and precise measurable targets (e.g., race distance + target finish time, FTP target) 2. User training load history
   ∙ Completed activity load history (TSS/HR load proxies) drives Actual Path plus rolling fitness/fatigue state (CTL/ATL/TSB or equivalent category-specific signals) 3. Best effort evidence (activity_efforts)
   ∙ Best sustained outputs by duration and category provide objective anchors for capability modeling
   ∙ Must leverage latest usable activity efforts by category 4. User profile metrics (profile_metrics)
   ∙ Scope-limited inputs in this phase: latest usable weight and LTHR only
   Critical Power / Critical Speed Derivation
   Power-based categories:
   ∙ Derive capability from best-effort duration-output points using a two-parameter critical power model:
   ∙ P(t) = W' / t + CP
   ∙ where CP is the asymptotic sustainable power and W' is finite work capacity above CP
   Speed-based categories:
   ∙ Derive capability using critical speed distance-time modeling:
   ∙ D(t) = CS \* t + D' (equivalently v(t) = CS + D' / t)
   ∙ where CS is the asymptotic sustainable speed and D' is finite distance capacity above CS
   Fit quality requirements:
   ∙ Required effort windows per category should include short, medium, and long durations (e.g., 3-5 min, 10-20 min, 30-60+ min) to avoid unstable fits
   ∙ Fit quality must include recency weighting and outlier handling (sensor spikes, corrupted files, implausible values)
   ∙ If effort coverage is sparse, use conservative priors from profile_metrics and mark confidence as low
   Capability Projection Across Plan Timeline
   At any date τ within the plan horizon, compute projected capability from:
   ∙ Baseline capability (CP₀ / CS₀) from latest valid effort fit
   ∙ Cumulative planned stimulus up to τ (Ideal and Scheduled paths)
   ∙ Realized stimulus and fatigue state up to τ (Actual path + CTL/ATL/TSB deltas)
   ∙ Profile constraints and adaptation limits
   Ideal Path computation assumes a “perfect athlete” execution model (full compliance and stable recovery response) to provide a clean normative baseline for comparison.
   The system must expose projections for:
   ∙ goal_date / plan end_date
   ∙ Intermediate checkpoints (daily/weekly)
   ∙ Arbitrary query dates inside the active horizon
   Projection outputs should include at minimum:
   ∙ Projected CP/CS at τ
   ∙ Projected TSS/load at τ
   ∙ Expected performance for goal-relevant durations/distances at τ
   ∙ Uncertainty/confidence score and key drivers
   Projections are informational only and used to help users interpret likely outcomes from current trajectory.
   Canonical Path Definitions
   ∙ Ideal Path: normative load trajectory implied by plan design (blocks/progression), independent of scheduling/completion
   ∙ Scheduled Path: calendar-specific workload from planned activities, with immutable scheduled snapshots
   ∙ Actual Path: realized workload from completed activities and derived load metrics
   ∙ Adherence Score: normalized score (0-100) combining Actual-vs-Scheduled alignment and Scheduled-vs-Ideal alignment
   Freshness and Recompute Rules
   Recompute dynamically triggered on:
   ∙ New/updated/deleted activity
   ∙ Goal/profile/config edits
   ∙ Calendar edits or missed/completed sessions
   ∙ Daily rollover
   Recalculation must run after any plan adjustment and regenerate all three paths for the active horizon.

7. Domain Model (Feature-Level)
   Core Entities
   ∙ Goal and GoalTarget (objective, target date, KPI, priority)
   ∙ Every goal must have an associated priority (defaulted if not user-specified) so calculations can weight higher-value goals when timelines or schedules conflict
   ∙ TrainingPlan (active version for a goal window)
   ∙ PlanBlock → WeekPlan → DayPlanTarget hierarchy (mapped to existing DayPrescription schema naming where needed)
   ∙ ConstraintSet (availability, duration caps, equipment, injury flags)
   ∙ Goal model remains outcome-only; plan config/constraints hold training structure decisions (volume, frequency, weekly caps)
   Goal Modeling Requirements
   ∙ Goals must be precise when possible, but approachable by default
   ∙ Supported goal archetypes must include:
   ∙ Race performance goals (distance + target time + activity type)
   ∙ Power threshold goals (target watts + test duration)
   ∙ Speed threshold goals (target speed in meters/second + test distance in meters)
   ∙ Heart-rate threshold goals (target LTHR)
   ∙ Multisport event goals (segment targets + total target time)
   ∙ General intent goals (e.g., improve health/fitness) when no strict KPI is provided
   ∙ System should normalize all goal inputs into one internal target model used by feasibility and projection calculations
   Computed State
   ∙ DerivedPerformanceState and CurveModel (ephemeral computed state)
   ∙ DeficitSignal (what is behind target trajectory)
   ∙ BoundaryState (status + violated thresholds + severity)
   ∙ ProgressInsight (plain-language interpretation of path divergence and trend)
   ∙ CapabilityModel (cp, w_prime, cs, d_prime, fit quality, recency score, confidence)
   ∙ ProjectionPoint (date, projected_cp_or_cs, projected_goal_result, uncertainty, drivers)
   Path and Adherence Data Contracts
   ∙ IdealLoadPoint (date, ideal_tss, optional ideal_ctl, plan-version metadata)
   ∙ ScheduledLoadPoint (date, scheduled_tss, scheduled_sessions, schedule-version metadata)
   ∙ ActualLoadPoint (date, actual_tss, actual_ctl, actual_atl, actual_tsb)
   ∙ AdherencePoint (date, adherence_score, load_adherence, session_adherence, timing_adherence, state label)
   ∙ CapabilityPoint (date, category, cp_or_cs, fit_confidence, source_effort_count)
   ∙ GoalProjectionPoint (date, goal_metric_projection, confidence, delta_vs_goal_target)
   Planned vs Actual Activity Requirements
   ∙ Activities remain user-authoritative and are not required to link to a specific planned-activity instance
   ∙ Adherence attribution should be computed from time window, activity category, planned load intent, and actual load outcomes

8. Planning Workflow

1) Goal Setup
   ∙ User provides goal intent and target date/horizon (minimal required)
   ∙ If user provides measurable detail (e.g., race performance, power threshold, speed threshold, HR threshold, multisport target), system derives normalized performance targets using standard units (meters, seconds, m/s)
   ∙ If user provides only general intent, system creates a conservative baseline target model and labels confidence appropriately
   ∙ Activity categories default intelligently from goal intent; user customization is optional
2) Calendar Configuration
   ∙ User selects available days/time windows
   ∙ System applies constraint defaults and feasibility checks
   ∙ System materializes Scheduled Path from concrete planned activities
3) Progression Construction
   ∙ Plan blocks generated by goal + current readiness + experience mode
   ∙ Safety guardrails applied before progression acceptance
   ∙ System materializes Ideal Path from blocks and progression targets
4) Daily Insight Refresh
   ∙ System computes updated progression and adherence interpretation for current horizon
   ∙ System surfaces boundary-state cues with severity and contributing factors
5) Adaptation Loop
   ∙ Completed/missed sessions update derived state
   ∙ Path divergence and boundary-state labels are recalculated while preserving plan stability where possible
   ∙ Actual Path and adherence timeline are recalculated and reflected in UI
6) Plan Adjustment and Re-baselining
   ∙ User can adjust plan constraints, intensity, timeline, or priorities
   ∙ Priority must be used as an explicit weighting signal when two goals are too close or conflicting for simultaneous optimal progression
   ∙ System stores adjustment history and recomputes Ideal, Scheduled, and projected adherence from active configuration

9. Progress Insight Contract
   Each insight payload for a timeline window must include:
   ∙ Aligned daily points for ideal, scheduled, actual, and adherence
   ∙ Boundary-state label (safe, caution, exceeded) for each point
   ∙ Violated threshold identifiers when boundary state is not safe
   ∙ Trend direction and confidence markers
   ∙ Plain-language interpretation of major divergence drivers
   Explainability Model
   ∙ Top insight sentence on card-level (e.g., “actual load is 18% over scheduled this week”)
   ∙ Expanded panel listing top drivers (phase objective, load/fatigue trend, scheduling variance, data quality)
   ∙ “What would change this state” section to improve user trust and self-guided decision making

10. Mobile IA and Key Screens
    Screen Overview
    ∙ Today: progression snapshot, boundary-state badge, and key divergence callouts
    ∙ Plan: timeline view (base/build/peak/recovery), weekly focus and checkpoints
    ∙ Calendar: week/month schedule, drag-to-reschedule, lock-day constraints
    ∙ Progress: current trajectory, effort curve changes, on-track indicator
    ∙ Must visualize three-path overlay (Ideal vs Scheduled vs Actual) and adherence trend
    ∙ Profile: goals, availability, defaults, advanced controls
    Core Interaction Requirements
    ∙ Progression and boundary status available in ≤2 taps from app open
    ∙ Calendar changes trigger path and boundary recomputation in the same interaction flow
    ∙ Users can inspect divergence drivers and threshold details in-context
    ∙ Users can see whether divergence is from undertraining, overtraining, or schedule non-adherence
    ∙ Any plan adjustment updates path visualizations and adherence state without requiring re-onboarding
    ∙ Detailed visual and interaction behavior for Plan tab and onboarding quickstart lives in `./ui-plan-tab-and-onboarding.md`

11. Onboarding and Configuration UX
    Novice-First Default Flow
    1. Choose goal (approachable input) and target date/horizon
    2. Confirm and start
       The two required user-entered inputs for MVP are goal and date. Everything else is optional with sensible defaults, including an auto-assigned goal priority when not explicitly chosen.
       Approachable goal input should allow simple phrases and guided presets while still supporting precise targets when available (e.g., "Marathon in 3:30", "Hit 300W FTP", "Swim CSS 1.50 m/s", "Ironman under 12 hours").
       Optional Setup (After Defaults)
       ∙ Activity categories
       ∙ Training availability
       ∙ Weekly volume preferences
       ∙ Session frequency and peak-duration caps
       Optional setup can be deferred until after plan creation to keep first-time interaction minimal.
       Advanced Optional Controls
       ∙ Intensity distribution preference
       ∙ Ramp aggressiveness
       ∙ Sport weighting for multisport
       ∙ Weekly caps and hard constraints
       ∙ Event prioritization and recovery preferences
       Defaulting Rules
       ∙ If data is sparse, use conservative starter plans and calibration workouts
       ∙ If data quality is high, scale targets from latest valid efforts and profile metrics
       ∙ If optional setup is skipped, system still generates a full dynamic plan from goal/date and current activity history
       ∙ Quickstart onboarding and post-create enrichment UX details are specified in `./ui-plan-tab-and-onboarding.md`

12. Safety, Guardrails, and Risk Mitigation
    Core Safety Principles
    ∙ Never classify unsafe progression as acceptable when fatigue/ramp thresholds are exceeded
    ∙ Prevent excessive hard-day clustering
    ∙ Detect infeasible schedule constraints and provide clear resolution path
    ∙ If confidence is low or data is stale, shift to conservative boundary interpretation and label clearly
    Feasibility and Risk Communication
    ∙ Feasibility checks must explicitly flag unrealistic goals (e.g., marathon in one week from no recent training)
    ∙ Unsafe or infeasible plans must show clear visual boundary states and plain-language reasons (why unsafe, what boundary was exceeded)

13. Edge Cases and Fallback Behavior

| Scenario                          | Behavior                                                                 |
| --------------------------------- | ------------------------------------------------------------------------ |
| **Cold start (no reliable data)** | Baseline plan + calibration guidance                                     |
| **General goal without hard KPI** | Intent-based baseline progression + explicit confidence labeling         |
| **Sparse multisport data**        | Precise insight where data exists, conservative interpretation elsewhere |
| **Missed workouts**               | Re-plan near-term with no-guilt language                                 |
| **Conflicting constraints**       | Minimum-effective-session fallback + prompt to adjust constraints        |
| **Sensor/data gaps**              | Fallback to duration + RPE targets                                       |

14. Acceptance Criteria
    Setup and Onboarding
    ∙ User can complete setup and receive first progression/adherence view in ≤2 minutes on defaults
    ∙ A new user can create a usable plan with only goal + date user input in ≤60 seconds; priority is always attached to the goal via defaulting if omitted
    ∙ System supports single-sport and multisport plans with consistent workflow
    Core Functionality
    ∙ Today screen always provides current progression state, adherence state, and safety/boundary status
    ∙ Insight states derive from fresh effort/profile data and avoid stale best-effort assumptions
    ∙ Calendar edits and missed sessions update near-term path/adherence insights automatically
    ∙ Goal system supports precise measurable goals (race performance, power threshold, speed threshold in m/s, HR threshold, multisport events) and general intent goals under one workflow
    User Experience by Persona
    ∙ Low-data users receive safe, explicitly labeled low-confidence states and conservative boundary handling
    ∙ Advanced users can configure progression and distribution controls without affecting novice flow
    ∙ Visual design remains minimalistic with low interaction overhead while preserving access to core insight details
    Safety and Guardrails
    ∙ Guardrails prevent unsafe ramping and intensity clustering
    ∙ UI provides explicit visual cues for boundary breaches (color/state badge + reason), including overload and undertraining risk
    Path and Adherence System
    ∙ System computes and exposes Ideal, Scheduled, and Actual load paths for daily and weekly views
    ∙ Scheduled Path is based on time-sensitive planned-activity snapshots, not recomputed estimates only
    ∙ Actual Path is sourced from completed activities and current load calculations (CTL/ATL/TSB)
    ∙ Adherence score and state labels are derived from a documented, consistent weighting model
    ∙ Completed activities are reflected in adherence via dynamic aggregation against the active plan window, without requiring one-to-one schedule-instance linkage
    ∙ Plan adjustments trigger recomputation and visual refresh of all adherence artifacts
    Capability and Projection System
    ∙ Capability model derives CP/CS (or equivalent per category) from activity_efforts using documented fit methods and confidence scoring
    ∙ System provides projected goal-result estimates for end date and intermediate dates, with uncertainty and main drivers

15. Testing and Quality Strategy
    Unit Tests
    ∙ Progression and guardrail logic invariants
    ∙ Derivation logic for load/capability/deficit computations
    ∙ CP/CS fitting math and fallback behavior under sparse or noisy effort data
    Integration Tests
    ∙ Input freshness semantics for profile_metrics and activity_efforts
    ∙ Progress insight contract completeness and boundary-state behavior
    ∙ End-to-end projection pipeline correctness from effort ingestion → capability fit → date-based projection outputs
    E2E Tests (Mobile)
    ∙ Novice happy path from onboarding to day-1 progression visibility
    ∙ Advanced configuration path with multisport and calendar constraints
    ∙ Missed-workout adaptation with adherence and boundary-state updates
    Definition of Done
    ∙ All critical invariants covered
    ∙ Safety and fallback scenarios validated
    ∙ Feature-level instrumentation and alerts active

16. Instrumentation and Rollout
    Metrics
    Insight Quality:
    ∙ Insight generation success rate
    ∙ Insight confidence distribution
    ∙ Low-confidence fallback rate by activity category
    ∙ Stale-data state frequency
    ∙ Boundary breach detection count
    Adherence:
    ∙ Adherence score distribution by cohort and sport
    ∙ Path divergence rate (Ideal vs Scheduled, Scheduled vs Actual)
    ∙ Plan-adjustment recompute latency
    API Requirements
    Adherence API/Query:
    ∙ Provide aligned timeline endpoint for 7/30/90 day windows with {date, ideal, scheduled, actual, adherence} points
    ∙ Provide weekly adherence summary endpoint with status buckets (on-track, slight-miss, major-miss, overload)
    ∙ Use athlete-local timezone and explicit week-boundary rules consistently across all adherence calculations
    Capability and Projection API/Query:
    ∙ Provide capability timeline endpoint returning {date, category, cp_or_cs, fit_confidence, effort_count}
    ∙ Provide projection endpoint for arbitrary date query returning {date, projected_capability, projected_goal_metric, confidence, uncertainty_band, drivers}
    ∙ Ensure projections can be queried for goal/end date and any in-plan checkpoint date
    Rollout Strategy 1. Feature-flagged phased rollout: internal → small cohort → wider cohort 2. Shadow evaluation mode before full exposure 3. Rollback triggers on safety, error, or latency regressions
    Implementation Constraints (MVP)
    ∙ No database schema migrations are required for this phase
    ∙ Any additional planning state should be represented in training plan JSON configuration and derived server-side computations

17. Open Questions
    Confidence Display and Behavior
    Question: How should confidence behave and be displayed when data is sparse or inconsistent?
    Considerations:
    ∙ Should we show numerical confidence scores (0-100%) or qualitative labels (Low/Medium/High)?
    ∙ At what confidence threshold do we suppress projections entirely vs. show with heavy caveats?
    ∙ How do we communicate the specific reasons for low confidence (e.g., “Only 2 recent efforts found” vs. “No efforts in last 90 days”)?
    Proposed approach for discussion:
    ∙ Use qualitative three-tier system: High (≥75%), Medium (40-74%), Low (<40%)
    ∙ Always show projections with appropriate visual treatment, never suppress entirely
    ∙ Provide specific, actionable explanation of confidence drivers in expandable detail panel
    Feasibility Scoring Rule
    Question: What exact feasibility scoring rule should classify a goal as feasible, aggressive, or unsafe at setup time?
    Considerations:
    ∙ Should feasibility depend on absolute metrics (e.g., weeks until goal, current fitness level) or relative metrics (required vs. historical ramp rates)?
    ∙ How do we balance preventing genuinely dangerous plans while not being overly conservative for motivated athletes?
    ∙ Should feasibility classification differ by persona (novice vs. advanced)?
    Proposed approach for discussion:
    ∙ Use multi-factor model considering:
    ∙ Time available vs. minimum safe preparation period for goal type
    ∙ Required weekly load increase vs. safe ramp rate thresholds (7-10% per week baseline)
    ∙ Current fitness vs. goal demand (deficit analysis)
    ∙ Three-tier classification with clear boundaries:
    ∙ Feasible: achievable within safe ramp rates with <20% deficit
    ∙ Aggressive: requires sustained near-maximum safe ramp rates (10%+) or 20-40% deficit
    ∙ Unsafe: requires ramp rates >15% weekly average or >40% capability deficit or <50% of minimum preparation time
    ∙ Provide specific alternative goal dates/targets when flagging as aggressive or unsafe
