# Design: System Activity Plan Library Expansion

## 1. Vision

GradientPeak should have a system activity-plan library rich enough to let its system training plans express coach-quality variety, progression, specificity, and recovery behavior.

The heuristic engine may decide what load and progression should happen, and the training plan may decide when sessions should happen, but the activity-plan library determines whether those sessions are actually varied, specific, and physiologically appropriate.

This spec focuses on auditing, expanding, and validating the system activity-plan catalog so system training plans can better mirror heuristic intent and better deliver meaningful training stimulus and adaptation.

## 2. Core Problem

The current system training-plan verification work shows that alignment depends not only on plan structure and heuristic outputs, but also on the underlying system activity templates. If the activity-plan library is too shallow or repetitive, then even a well-sequenced training plan can:

- repeat the same stimulus too often,
- fail to progress session difficulty appropriately,
- lack recovery/support variety,
- hit the right rough TSS while missing real coaching quality,
- struggle to mimic heuristic load outputs precisely.

## 3. Product Objective

Build a broader, more structured system activity-plan library that supports:

- better session variety,
- better progression ladders,
- better stimulus specificity,
- better recovery and support coverage,
- better plan-to-heuristic alignment,
- stronger internal validation of coaching quality.

## 4. Scope

### In scope

- audit the current system activity-plan library,
- map training-plan needs to activity-plan coverage gaps,
- define session archetype coverage requirements by sport and goal family,
- expand the system activity-plan catalog where gaps are most impactful,
- add tests for variety, coverage, and progression suitability,
- establish an internal coverage matrix for system plans vs system activity templates.

### Out of scope

- UI changes,
- replacing the heuristic engine,
- replacing the training-plan verification harness,
- non-system user-generated activity plans.

## 5. Current Code Reality

This work should be grounded in how the current codebase actually models "system" templates today.

- the system activity-plan library is currently a normalized registry assembled from sample files, not a standalone authored catalog,
- system template membership is defined by inclusion in `SYSTEM_TEMPLATES` in `packages/core/samples/index.ts`,
- run templates currently span both indoor and outdoor source files,
- bike templates currently span both indoor and outdoor source files,
- system training plans reference linked activity templates by string `activity_plan_id` values in `packages/core/samples/training-plans.ts`,
- linked activity ids must be normalized through `packages/core/samples/template-ids.ts`,
- current activity sample objects do not carry explicit archetype, progression level, load band, recovery cost, or training intent metadata,
- seeded database templates are still weaker than the code registry for session-level linkage auditing, so code-first audit logic remains the source of truth for this phase.

### Primary source-of-truth files

- `packages/core/samples/index.ts`
- `packages/core/samples/training-plans.ts`
- `packages/core/samples/template-ids.ts`
- `packages/core/samples/indoor-treadmill.ts`
- `packages/core/samples/outdoor-run.ts`
- `packages/core/samples/indoor-bike-activity.ts`
- `packages/core/samples/outdoor-bike.ts`
- `packages/core/plan/verification/systemPlanAudit.ts`
- `packages/core/plan/verification/fixtures/system-plan-mappings.ts`
- `packages/core/plan/verification/fixtures/system-plan-template-crosswalk.md`

## 6. Key Insight

System coaching quality depends on three layers:

1. heuristic engine chooses the desired load and progression,
2. training plan sequences the weekly shape,
3. activity-plan library expresses the actual stimulus.

This spec addresses layer 3 so layers 1 and 2 can succeed more fully.

## 7. Activity-Plan Library Goals

The system library should provide enough depth that plans can choose among multiple valid templates for the same high-level training purpose.

### A. Stimulus coverage

For each sport domain, the catalog should cover at least:

- easy / recovery,
- aerobic endurance,
- steady / moderate,
- tempo,
- threshold,
- VO2 / speed / high intensity,
- race-pace specific,
- long-session variants,
- support / strength / mobility where relevant.

### B. Progression coverage

For major session archetypes, the catalog should include progression ladders such as:

- beginner,
- intermediate,
- advanced,
- conservative / low-availability,
- high-capacity / race-specific.

### C. Variety coverage

Templates should not only differ by TSS. They should also differ by training character, for example:

- duration,
- density,
- intensity distribution,
- rep structure,
- long-session composition,
- support emphasis.

## 8. Required Design Decisions

The current sample template shape is too thin to satisfy the desired coverage matrix directly. This spec therefore must explicitly produce one of the following:

1. derived taxonomy rules that infer archetype and intent from existing template structure, naming, and targets, or
2. a sidecar metadata catalog keyed by normalized system template id.

The implementation may use a hybrid approach, but it must keep the result deterministic, code-reviewable, and easy to test.

For this phase, taxonomy ownership should be code-first and colocated with the system sample registry rather than authored inside `verification/`. Verification code may consume the taxonomy, but should not be the canonical authoring home.

For this phase, taxonomy metadata is internal and code-only. It does not need to be persisted to the database or exposed through tRPC responses unless a later spec explicitly expands product scope.

The spec also requires an explicit normalization policy:

- audits and tests key by normalized template id, never by name alone,
- duplicate names are expected and are not by themselves evidence of duplicate templates,
- missing explicit source ids must normalize deterministically from category plus name,
- generated nested structure ids must be ignored during deep comparisons.

## 9. Product And Surface Constraints

This phase is primarily a core-data and verification improvement, but a few existing app and backend surfaces constrain implementation:

- mobile training-plan detail currently hydrates linked activity templates through paged `activityPlans.list`,
- current list queries cap at 100 rows,
- system training-plan apply currently drops unresolved linked sessions unless all schedulable rows disappear,
- system activity-template and training-plan seed flows are not yet perfectly aligned on session-level linkage,
- there is no meaningful web product surface that needs first-wave UI work in this phase.

Therefore this spec must also ensure:

- unresolved linked activity templates in system training plans become explicit validation failures rather than silently degraded schedules,
- linked-template hydration has an exact-id lookup path or another explicit scaling-safe solution,
- activity-library expansion does not assume any first-wave web UI changes,
- seed-script and code-registry ownership are made explicit enough to avoid parity drift.

## 10. Coverage Matrix Direction

The system should eventually support a coverage matrix that answers:

- which session archetypes exist per sport,
- which progression levels exist per archetype,
- which training plans depend on each archetype,
- which heuristic pathways currently lack enough template coverage.

## 11. Coverage Matrix Minimum Semantics

At minimum, the matrix must support these dimensions for each normalized template id:

- source file,
- sport,
- indoor vs outdoor execution context,
- session archetype,
- training intent,
- intensity family,
- progression level,
- load or duration band derived deterministically,
- recovery cost band derived deterministically or assigned via sidecar metadata,
- dependent system training plans,
- reuse count across the system plan catalog,
- coverage status (`covered`, `under-covered`, `missing`, or `duplicate-risk`).

The coverage matrix should be generated as a deterministic TypeScript artifact that can be imported by tests, rather than only emitted as ad hoc console output or markdown.

## 12. First-Wave Gating Rules

To avoid ambiguous implementation, first-wave validation should use explicit initial thresholds:

- `missing`: zero templates exist for a required first-wave cell,
- `under-covered`: exactly one template exists for a required first-wave cell,
- `covered`: two or more templates exist for a required first-wave cell,
- `weak variety`: a representative run or bike system plan has fewer than three unique linked template ids across its materialized sessions,
- `over-reuse`: a representative run or bike system plan assigns more than 50 percent of its materialized sessions to one normalized template id,
- `duplicate-risk`: two templates land in the same taxonomy cell and have near-identical duration plus primary-work structure, requiring manual review before both count toward coverage.

Required first-wave cells are the ones already exercised by shipped run and bike system plans:

- run easy or recovery,
- run tempo or threshold,
- run long,
- run high intensity or race-pace,
- bike recovery or easy endurance,
- bike threshold or sweet spot,
- bike long endurance,
- bike high intensity or climbing.

## 13. Required Validation Set

The minimum first-wave gated plans are:

- `Marathon Foundation (12 weeks)` in `packages/core/samples/training-plans.ts`,
- `Half Marathon Build (10 weeks)` in `packages/core/samples/training-plans.ts`,
- `5K Speed Block (8 weeks)` in `packages/core/samples/training-plans.ts`,
- `Cycling Endurance Builder (12 weeks)` in `packages/core/samples/training-plans.ts`.

Audit-only exceptions for this phase are:

- `Sprint Triathlon Base (10 weeks)`,
- `General Fitness Maintenance (6 weeks)`.

These audit-only plans should remain visible in reports, but they do not block first-wave run/bike completion.

## 14. First-Wave Audit Questions

- Which system activity plans currently exist by sport and archetype?
- Which system training plans overuse the same templates?
- Which heuristic-recommended progression paths cannot be expressed because templates are missing?
- Which support/recovery templates are too generic?
- Which plans lack enough session diversity for believable coaching quality?

## 15. Deterministic Audit Constraints

- Run and bike audits must cover indoor and outdoor source files together because current plans mix both contexts.
- Duration and load-friendly audit signals should remain structure-derived where possible so tests stay stable.
- Tests must compare normalized ids and normalized structures rather than raw generated builder ids.
- Linkage audits should remain code-first until seeded DB session linkage reaches parity.
- Mixed-sport templates or plans may be cataloged, but first-wave pass/fail gates should remain focused on run and bike.
- System training-plan application should fail fast if any linked system activity template required by a shipped system plan cannot be resolved.

## 16. Seed And Parity Rules

- `packages/core/samples/index.ts` and `packages/core/samples/training-plans.ts` remain the canonical source for authored system templates and system training plans.
- Seed scripts must be treated as synchronization mechanisms, not alternate authoring sources.
- If template ids change, the implementation must relink dependent system training plans and rerun seed/parity validation in the same change.
- If the checked-in SQL migration continues to lag the script-driven canonical registry, that drift must be documented as an explicit limitation rather than left implicit.

## 17. Success Criteria

- system activity templates are audited into a concrete coverage matrix,
- the highest-impact missing archetypes and progression ladders are identified,
- first-wave system activity-plan expansion lands for the most critical gaps,
- tests verify that representative system training plans have sufficient session variety and coverage,
- training-plan verification can rely on a richer template vocabulary instead of a thin template set,
- the spec produces an explicit taxonomy/metadata strategy rather than assuming rich fields already exist on sample templates,
- normalized template-id handling and duplicate-name behavior are documented and enforced by tests,
- mobile and backend linked-template flows have explicit non-silent behavior as the system library grows.
