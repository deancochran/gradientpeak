# Training Plan Creation Configuration MVP

Last Updated: 2026-02-10
Status: Draft for implementation planning
Owner: Product + Mobile + Core + Backend

## 1) Purpose

This specification defines the MVP configuration experience at training-plan creation time.

The goal is to produce a usable initial plan configuration that is fast for novices, transparent for advanced users, and fully user-controlled when derived values are suggested by the system.

The design must work across the full athlete spectrum:

- Beginner with little or no historical data
- Intermediate athlete with partial history
- Experienced athlete or racer with dense multi-week training history

The plan must correctly interpret current fitness context (low to high readiness) and expose feasibility and safety signals so users can see whether they are under-reaching, appropriately challenged, or over-reaching.

## 2) In-Scope Features (Creation Time)

The following features are required in the create flow:

1. Availability template selection and editing
2. Baseline load picker
3. Auto-detected recent training influence, with user confirmation and override
4. Configurable constraints and locks

## 3) Explicitly Out of Scope

This MVP does not include autonomous post-create plan mutations based on completed activities.

- Completed activity data may be shown as context, but it must not silently mutate plan configuration after create.
- Adaptive recommendations after create may be generated for review, but they require explicit user confirmation before any plan change.
- Full hands-off auto-adjustment logic remains separate future work.

## 4) Product Principles

1. User has final authority over all configuration values.
2. Every derived or suggested value is editable before final create.
3. Lock behavior must be explicit, visible, and deterministic.
4. The system must never apply silent overrides to user-entered values.
5. If conflicts exist, the UI must show the conflict and resolution path before create.
6. The system must support all experience levels by degrading gracefully when historical data is sparse.
7. Feasibility and safety indicators must be visible and understandable at decision points.

## 5) Athlete Spectrum and Fitness Awareness Requirements

The configuration system must support two extremes and all users between:

1. No-data onboarding: beginner users can still create a valid, safe plan using questionnaire and conservative defaults.
2. High-data onboarding: experienced users receive stronger, data-driven recommendations based on training history quality and volume.

Fitness-awareness requirements:

- Derive an initial fitness/readiness estimate from available inputs (historical load, consistency, recency, effort signals, or questionnaire fallback).
- Map estimate to recommended baseline ranges and risk bounds.
- Keep all recommendations editable with user-overrides and locks.
- Persist confidence and rationale so downstream flows can explain why a value is suggested.

## 6) Creation-Time Configuration Model

### 5.1 Availability Template

Required behavior:

- User can pick a starter template (for example: low, moderate, high availability patterns).
- User can edit day-level availability after template selection.
- Template application is a one-time starting point, not an immutable rule.
- Any templated value can be changed before create.

Output contract:

- Persist normalized weekly availability windows in plan configuration.
- Persist template source metadata only for analytics/explainability (optional to use later).

### 5.2 Baseline Load Picker

Required behavior:

- User can choose baseline load explicitly using guided options and manual numeric entry.
- System can prefill a recommended baseline load from recent history.
- Prefill is advisory only; user confirmation or override is required.

Output contract:

- Persist final baseline load as the user-confirmed value.
- Persist recommendation source and confidence metadata separately from the final value.

### 5.3 Auto-Detected Recent Training Influence

Required behavior:

- System derives a recent training influence suggestion from recent training data quality, recency, and consistency.
- Suggestion must be labeled with confidence and key drivers.
- User must be able to accept as-is, edit the value, or disable influence in create flow.
- If data is sparse or absent, system must fall back to beginner-safe defaults plus short onboarding questions.
- If data is dense and high quality, system may narrow recommendation bands and increase confidence.

Output contract:

- Persist chosen influence value and user action (`accepted`, `edited`, or `disabled`).
- Persist derivation rationale for explainability.

### 5.4 Configurable Constraints and Locks

Required configurable constraints for MVP:

- Weekly load cap/floor
- Hard rest day constraints
- Session frequency bounds
- Maximum single-session duration

Recommended additional MVP-safe constraint:

- Goal difficulty preference (`conservative`, `balanced`, `stretch`) used only to shape suggestions, never to override locks.

Required lock behavior for MVP:

- User can lock selected constraints at create time.
- Locked values cannot be changed by derived suggestions in the same flow.
- Lock state must be visually obvious and included in create payload.

## 7) Lock Precedence and Conflict Policy

Precedence order (highest to lowest):

1. Explicit user-entered locked values
2. Explicit user-entered unlocked values
3. User-confirmed derived suggestions
4. Default/template values

Conflict rules:

- If a newly applied suggestion conflicts with a locked value, locked value wins.
- If constraints conflict with each other, create flow must block completion until user resolves or explicitly relaxes one side.
- The system must present resolution options; it must not auto-resolve conflicts silently.

## 8) Create Flow UX Requirements

1. Show suggested values with clear "Suggested" labeling and rationale entry points.
2. Show lock toggles adjacent to each lockable field.
3. Show an explicit review step before final create, including:
   - Final values
   - Source of each value (user, suggested, default)
   - Active locks
4. Require explicit confirmation action to finalize creation.
5. Show a feasibility and safety visual panel before create, with at minimum:
   - Feasibility score/band
   - Safety risk score/band
   - Clear status labels (`under-reaching`, `on-track`, `over-reaching`)
   - Top factors driving each score
6. Beginner users must see concise plain-language guidance when no historical data exists.
7. Advanced users must be able to inspect recommendation rationale and confidence details.

## 9) Validation and Safety Boundaries

Validation at create boundary:

- Baseline load must be within safe bounds for selected availability and constraints.
- Weekly caps/floors must be internally consistent.
- Hard rest days must remain schedulable with requested session frequency.
- Feasibility and safety scores must be computable for all users, including no-data users (via fallback heuristics).
- Risk classification thresholds must be deterministic and testable.

Failure behavior:

- Block create when invalid combinations are present.
- Provide plain-language cause and corrective actions.
- Preserve user-entered values while showing fixes (no destructive reset).

Feasibility/safety interpretation requirement:

- The user must be able to visually determine whether configuration is over-reaching or under-reaching before final create.
- The UI must display at least one actionable recommendation when risk is elevated (for example: reduce baseline load, increase recovery constraints, or relax goal aggressiveness).

## 10) Risks and Mitigations

### 9.1 Overestimating Capability

Risk:

- Suggested baseline or influence is too aggressive, leading to unsafe initial load targets.

Mitigations:

- Conservative default bias when confidence is medium/low.
- Confidence-driven guardrails that tighten allowed recommendation ranges.
- Clear caution messaging when suggestion implies aggressive progression.
- Easy override plus lock support so users can enforce safer settings.

### 9.2 Underestimating Capability

Risk:

- Suggested baseline or influence is too conservative, reducing training quality and user trust.

Mitigations:

- Provide transparent rationale and source windows so advanced users can adjust upward.
- Allow manual override at all derived fields without hidden penalties.
- Show expected impact preview (for example: conservative vs moderate baseline outcomes).
- Track accept/edit rates to tune future recommendation quality.

### 9.3 User Trust Erosion from Opaque Automation

Risk:

- Users feel system changed their intent without consent.

Mitigations:

- No silent overrides policy enforced in UI and API validation.
- Value provenance persisted and reviewable at create time.
- Lock precedence consistently enforced and test-covered.

### 9.4 Cold-Start Bias for Beginners

Risk:

- No-data users may get inaccurate recommendations if defaults are not conservative enough or questionnaire is too shallow.

Mitigations:

- Conservative cold-start defaults with explicit safety bias.
- Minimum onboarding inputs for no-data users (availability, perceived fitness, recent consistency, injury status).
- Wider recommendation bands and lower confidence until validated by user edits.

### 9.5 Overfitting to Historical Peaks for Advanced Athletes

Risk:

- Dense historical data can overweight prior peak blocks and overstate current readiness.

Mitigations:

- Recency-weighted signals and detraining awareness.
- Cap influence from old peak periods.
- Display confidence and top drivers so user can correct misleading assumptions.

## 11) Acceptance Criteria

1. User can complete creation with availability template, baseline load, recent training influence decision, and constraints/locks configured.
2. Every derived value in create flow is editable before final submission.
3. Lock precedence is deterministic and prevents lower-priority overwrite.
4. No autonomous post-create adjustment is applied without explicit user confirmation in this MVP.
5. System supports beginner/no-data users with safe fallback recommendations and clear guidance.
6. System supports advanced/high-data users with confidence-labeled recommendations based on recent training influence.
7. Feasibility and safety visualization is present before create and clearly indicates under-reaching, on-track, or over-reaching status.
8. Conflict states block create with clear, actionable resolution guidance.
9. API payload includes final value provenance, confidence metadata, and lock metadata needed for deterministic interpretation.
