# Implementation Plan: System Activity Plan Library Expansion

## 1. Strategy

Start by auditing the current system activity-plan catalog and how system training plans consume it. Then expand the catalog only where there is a clear coaching-quality or heuristic-alignment payoff.

Implementation should prefer:

- explicit coverage taxonomy,
- deterministic fixture-based audits,
- small high-value catalog additions,
- tests that catch template over-reuse and missing stimulus classes.

The implementation must explicitly respect the current code shape:

- the effective system library is assembled from `packages/core/samples/index.ts`,
- run and bike templates are split across indoor and outdoor sample files,
- system training plans link templates by string ids in `packages/core/samples/training-plans.ts`,
- all audits must normalize ids via `packages/core/samples/template-ids.ts`,
- taxonomy fields needed by the coverage matrix will need to be derived or stored in a sidecar catalog,
- linkage verification remains code-first because seeded DB training-plan records do not yet fully preserve session-level `activity_plan_id` relationships.

To keep implementation easier and less ambiguous, this phase should make these explicit choices:

- taxonomy ownership lives alongside `packages/core/samples`, not under `verification/`,
- taxonomy remains code-only for this phase,
- the coverage matrix is generated as a deterministic TypeScript artifact consumed by tests,
- any unresolved linked system `activity_plan_id` in a shipped system training plan is treated as a validation error,
- linked-template hydration for training-plan detail must use exact ids rather than broad paged listing once the library grows.

## 2. Source Of Truth

Audit and implementation work should start from these files:

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

## 3. Implementation Phases

### Phase 1: Catalog Audit

- inventory all system activity templates,
- normalize and index template ids before analysis,
- record source file and execution context (indoor vs outdoor),
- classify templates by sport, archetype, intensity family, and progression level,
- choose and document the taxonomy strategy: derived rules, sidecar metadata, or hybrid,
- identify name collisions that require id-based handling,
- identify duplicate or near-duplicate templates,
- identify missing archetypes and ladders.

Deliverable:

- a deterministic catalog artifact keyed by normalized template id with taxonomy fields and source metadata.

### Phase 2: Training-Plan Dependency Audit

- map each system training plan to its linked activity templates,
- resolve links through normalized string ids rather than exported constants,
- measure template reuse frequency,
- identify plans with weak variety or weak progression coverage,
- identify where heuristic alignment is constrained by library gaps,
- explicitly flag linkage that exists only in code and not yet in seeded DB parity.

Deliverables:

- a dependency map from normalized template id to dependent system plans,
- a report of unresolved-link failure risks,
- a recommendation for exact-id linked-template hydration in app/router flows.

### Phase 3: Coverage Matrix

- encode the system activity-plan coverage matrix,
- define required session-archetype coverage for first-wave sports,
- mark which cells are covered, under-covered, or missing,
- include duplicate-risk and over-reuse indicators for heavily repeated templates.

Coverage thresholds for first-wave run and bike cells:

- `missing` = 0 templates,
- `under-covered` = 1 template,
- `covered` = 2 or more templates.

Plan-level thresholds for representative first-wave plans:

- `weak variety` = fewer than 3 unique linked normalized template ids,
- `over-reuse` = more than 50 percent of materialized sessions use the same normalized template id.

### Phase 4: Library Expansion

- add first-wave missing activity templates for highest-impact gaps,
- add progression variants where one template currently does too much work,
- keep new templates deterministic and estimation-friendly,
- preserve normalized-id stability and seed-sync compatibility,
- avoid relying on template names as unique identifiers.

Phase 4 must also decide which new templates are meant to affect shipped system training plans immediately. If a new template is intended to improve an existing shipped plan, the same change should update `packages/core/samples/training-plans.ts` linkage and rerun parity validation.

### Phase 5: Validation

- add tests for template taxonomy and coverage,
- add tests for training-plan template variety,
- add tests for progression ladder availability,
- add smoke checks that representative plans can draw from richer stimulus sets,
- keep structure comparisons resilient to generated nested ids.

Validation should include both code-registry quality gates and consumer-surface safety checks:

- system apply rejects unresolved linked templates,
- training-plan detail linked-template hydration does not rely on a fixed broad list page for correctness,
- activity-template expansion does not regress seed sync or parity flows.

## 4. First-Wave Sports

Primary first-wave focus:

- run,
- bike.

Secondary audit-only initially:

- triathlon / mixed,
- strength-support / general maintenance.

Representative gated plans:

- `Marathon Foundation (12 weeks)`
- `Half Marathon Build (10 weeks)`
- `5K Speed Block (8 weeks)`
- `Cycling Endurance Builder (12 weeks)`

Audit-only plans:

- `Sprint Triathlon Base (10 weeks)`
- `General Fitness Maintenance (6 weeks)`

## 5. Initial Coverage Matrix Shape

Columns should include at minimum:

- normalized template id,
- source file,
- sport,
- execution context,
- session archetype,
- training intent,
- intensity family,
- progression level,
- estimated load band,
- recovery cost band,
- linked system template ids,
- dependent system plans,
- reuse count,
- coverage status.

## 6. Constraints And Heuristics

- Use normalized template ids for joins, assertions, and deduplication.
- Do not key audits by template name because duplicate names already exist.
- Prefer structure-derived duration/load signals before introducing hand-authored estimates.
- Ignore generated `structure` ids during comparisons, matching seed-sync behavior.
- Keep first-wave pass/fail assertions centered on run and bike, while allowing mixed-sport catalog visibility.
- Treat silent dropping of unresolved linked system templates as unacceptable for shipped system plans.
- Do not assume `activityPlans.list(limit: 100)` remains sufficient for linked-template hydration as the system library expands.

## 7. High-Value Missing Categories To Audit First

### Run

- more threshold variants,
- more race-pace variants,
- more long-run variants,
- support/recovery variations,
- beginner vs advanced versions of key session types.

### Bike

- more sweet-spot / threshold options,
- more long-ride variants,
- more climbing / muscular endurance variants,
- better low-fatigue recovery and maintenance rides,
- low-availability bike session alternatives.

## 8. Proposed File Layout

- `packages/core/samples/system-activity-template-taxonomy.ts`
- `packages/core/samples/system-activity-template-taxonomy-sidecar.ts`
- `packages/core/plan/verification/activity-template-catalog.ts`
- `packages/core/plan/verification/activity-template-coverage-matrix.ts`
- `packages/core/plan/verification/training-plan-template-variety.ts`
- `packages/core/plan/__tests__/system-activity-template-catalog.test.ts`
- `packages/core/plan/__tests__/system-activity-template-coverage.test.ts`
- `packages/core/plan/__tests__/system-training-plan-template-variety.test.ts`
- `packages/trpc/src/routers/__tests__/training-plans.apply-template.test.ts`

One of the taxonomy files above may be omitted if a pure derived-rules or pure sidecar approach is chosen, but the spec requires one explicit home for taxonomy decisions.

## 9. Validation

Required checks after implementation:

```bash
pnpm --filter @repo/core check-types
pnpm --filter @repo/core test -- system-plan-source-audit
pnpm --filter @repo/core test -- system-plan-template-resolution
pnpm --filter @repo/core test -- system-training-plan-verification-helpers
pnpm --filter @repo/core test -- system-activity-template-catalog
pnpm --filter @repo/core test -- system-activity-template-coverage
pnpm --filter @repo/core test -- system-training-plan-template-variety
pnpm --filter @repo/trpc test -- training-plans.apply-template
```

If template publish or parity behavior changes as part of expansion, also run:

```bash
pnpm --filter @repo/supabase seed-templates --dry-run
pnpm --filter @repo/trpc test -- training-plans.system-plan-parity
```

## 10. Expected Outcomes

- richer template vocabulary for system plans,
- less repetitive system plans,
- better session progression realism,
- improved ability for training plans to approximate heuristic recommendations,
- explicit evidence of activity-template coverage quality,
- explicit taxonomy and normalization rules that future template additions can follow,
- clearer behavior at app/router boundaries as the system template catalog grows.
