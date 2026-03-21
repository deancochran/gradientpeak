# Design: Core Package Consolidation Refactor

## 1. Objective

Make `@repo/core` the single source of truth for shared fitness calculations, domain heuristics, parsing helpers, and reusable constants so mobile, web, and tRPC consume one canonical implementation.

Primary outcomes:

- training load calculations flow through one canonical load engine,
- per-activity heuristics live in one sport registry instead of scattered utility modules,
- goal parsing, duration parsing, and threshold estimation are reusable core contracts rather than app-owned logic,
- legacy barrels become compatibility facades instead of source owners,
- extracted functions are small, composable, and safe for mobile and web reuse.

## 2. Problem Statement

The current package has the right responsibilities, but not a single canonical path for several critical domains. The audit found overlapping implementations for:

1. TSS, normalized power, and intensity factor,
2. CTL, ATL, TSB, form, and load replay,
3. duration estimation for structured workouts,
4. threshold and onboarding metric estimation,
5. activity-type defaults and load heuristics,
6. power, heart-rate, and intensity zone definitions,
7. goal target parsing and validation.

This creates three classes of problems:

- callers have to choose between old and new helpers without a clear contract,
- mobile and tRPC still duplicate domain rules that should live in core,
- new feature work risks adding yet another parallel implementation.

## 3. Core Design Decision

### A. Introduce canonical domain modules, keep compatibility facades temporarily

The refactor should not start with breaking public exports. Instead, it should introduce canonical source modules first, migrate internal callers second, and reduce old modules to compatibility facades last.

This preserves runtime safety while making ownership explicit.

### B. Organize by domain responsibility, not by historical file growth

The target structure should separate these domains:

- `load` for training load and workload progression,
- `sports` for per-activity defaults and heuristics,
- `zones` for threshold-derived zone definitions,
- `duration` for structured-workout duration interpretation,
- `goals` for target parsing and payload construction,
- `metrics` or `estimation` for onboarding and threshold estimation.

This organization keeps modules small enough for app reuse and makes ownership discoverable.

### C. Define one-way dependency flow

The canonical direction should be:

- primitive constants and unit helpers,
- domain registries and parsers,
- calculation engines,
- compatibility facades and app consumers.

Higher-level modules may depend on lower-level ones, but not the reverse. For example, `sports` may provide defaults to `duration` or `load`, but `sports` should not depend on UI-specific plan-form code.

## 4. Target Module Architecture

### A. Load domain

Create a canonical load module family under `packages/core/load/`.

Recommended ownership:

- `tss.ts`: canonical TSS, IF, normalized power-derived stress, pace-based stress, and HR-based stress,
- `progression.ts`: CTL, ATL, TSB, daily progression helpers, and projection helpers,
- `replay.ts`: date-keyed TSS replay helpers used by tRPC/home/trends,
- `form.ts`: form labels and form-status interpretation,
- `ramp.ts`: ramp-rate calculations and safety thresholds,
- `workload.ts`: ACWR, monotony, TRIMP, and sparse-history workload envelopes,
- `bootstrap.ts`: starting fitness bootstrap from sparse/no history.

Rules:

- every caller that replays daily TSS should go through a shared replay helper,
- activity-specific fallback stress estimation should not live in tRPC,
- old exports from `calculations.ts` may remain temporarily but should forward into this module family.

### B. Sports domain

Create a sport registry under `packages/core/sports/` that owns all activity-specific defaults and heuristic assumptions.

Recommended ownership:

- `contracts.ts`: shared types for sport defaults,
- `registry.ts`: stable lookup APIs,
- `run.ts`, `bike.ts`, `swim.ts`, `strength.ts`, `other.ts`: per-sport definitions.

Each sport module should own:

- default durations for warm-up / main / cooldown,
- default targets,
- distance-to-duration estimation pace/speed defaults,
- template estimation heuristics,
- stress/load fallback assumptions where sport-specific,
- display-safe activity metadata that is domain-level rather than platform-visual.

The key decision is that per-activity training load heuristics must come from the same registry that defines step defaults and fallback speeds. That prevents drift between planning, estimation, and analytics.

### C. Zones domain

Create `packages/core/zones/` for all threshold-derived and display-friendly zone definitions.

Recommended ownership:

- `hr.ts`: threshold HR / max HR / HRR zone definitions,
- `power.ts`: FTP-based power zones,
- `intensity.ts`: IF-based zones,
- `definitions.ts`: shared contracts and metadata.

This module should expose both:

- numeric boundaries for analytics and calculations,
- label/description metadata for UI consumers.

Mobile and web should consume zone definitions from this domain instead of hardcoding boundaries in presentation components.

### D. Duration domain

Create `packages/core/duration/` to own structured-workout duration interpretation.

Recommended ownership:

- `seconds.ts`: canonical `getDurationSeconds`,
- `format.ts`: duration formatting for duration objects and scalar seconds,
- `totals.ts`: aggregate duration helpers,
- `defaults.ts`: policy defaults sourced from the sport registry.

This module should replace the three competing duration implementations and define one explicit policy for `distance`, `repetitions`, and `untilFinished` estimation.

### E. Goals and target parsing

Create `packages/core/goals/` for all goal target normalization and payload construction.

Recommended ownership:

- `target-types.ts`: canonical goal-target contracts,
- `parse.ts`: string input parsing and validation,
- `payloads.ts`: create/update payload builders,
- `format.ts`: user-facing summaries and metric labels,
- `guards.ts`: shared validation guards and error messages.

This extraction is important because mobile currently owns behavior that is domain logic rather than UI behavior.

### F. Constants and primitives

Split `packages/core/constants.ts` into focused modules:

- `constants/activity.ts`
- `constants/physiology.ts`
- `constants/units.ts`
- `constants/zones.ts`
- `constants/load.ts`
- `constants/ble.ts`

The current mixed file is hard to reason about and encourages broad imports.

## 5. Safe Extraction Strategy

### A. Compatibility-first migration

The refactor must proceed in this order:

1. create canonical modules,
2. add tests around canonical modules,
3. redirect existing internal core callers,
4. redirect tRPC/mobile/web callers,
5. reduce legacy modules to thin re-exports,
6. remove dead code only after call sites are verified.

This avoids a risky “big bang” cutover.

### B. Preserve behavior while reducing ambiguity

When duplicate helpers disagree today, the extraction should not silently pick a winner. Each disagreement must be resolved explicitly in the design of the canonical API, especially for:

- duration defaults for repetitions and `untilFinished`,
- threshold estimation return shapes,
- zone boundary interpretation,
- activity-type stress heuristics.

### C. Keep core platform-safe

Canonical modules must stay free of database, React, or routing dependencies. They may expose metadata and contracts for UI use, but not import icons, components, or platform packages.

## 6. Scope

### In scope

- create canonical module ownership for duplicated domains,
- migrate core internals toward those modules,
- migrate duplicated app and tRPC logic into core when it is domain logic,
- shrink ambiguous barrel exports,
- add focused tests for canonical modules and compatibility facades.

### Out of scope

- changing product behavior unrelated to consolidation,
- redesigning UI surfaces,
- introducing database schema changes,
- fully deleting compatibility exports in the first pass,
- broad renaming across unrelated packages unless needed for consolidation.

## 7. Major Risks And Mitigations

### A. Risk: breaking public imports

Mitigation:

- keep old exports alive as wrappers during the migration,
- update internal callers first,
- remove wrappers only in a later cleanup pass.

### B. Risk: changing formulas unintentionally

Mitigation:

- write fixture tests before cutover for duplicated formulas,
- compare old and new outputs on representative inputs,
- document intentional behavioral changes in each task phase.

### C. Risk: pushing UI-specific concerns into core

Mitigation:

- allow only domain metadata into core,
- keep icon selection, class names, and platform styling in app/UI packages,
- expose stable labels and semantic descriptors only.

## 8. Success Criteria

The refactor is successful when:

- there is one canonical source for load progression,
- there is one canonical source for per-activity heuristics,
- there is one canonical source for duration interpretation,
- goal parsing and payload creation are reusable from core,
- mobile and tRPC stop replaying or hardcoding duplicated domain logic,
- `calculations.ts` and other legacy files are no longer source owners,
- the public surface is easier to discover and safer to reuse across apps.
