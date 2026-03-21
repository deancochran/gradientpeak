# Workflow Lifecycle Reference

Use this reference when coordinating medium or high complexity work.

## Lifecycle States

### 1. `intake`

- Identify the user goal.
- Identify whether an active spec already exists.
- Decide whether the work is direct, spec-only, or implementation-bound.

### 2. `orient`

- Measure `.opencode/tasks/index.md` first, compact it if it is over budget, then read it.
- Read the active spec in order: `design.md`, `plan.md`, `tasks.md`.
- Measure active spec and instruction docs before appending to them; compact first if the next update would make them bloated.
- Load only the smallest relevant skill set.

Exit when the coordinator can name the current task boundary, constraints, and expected validation.

### 3. `plan`

- Select the next bounded unit of work.
- Decide whether the unit is best handled directly or through delegation.
- Identify whether parallel fan-out is safe.

Exit when the next work unit has a clear owner and success condition.

### 4. `delegate`

- Issue one or more bounded task packets.
- Keep context narrow and task-specific.
- Name the fan-in owner before parallel work begins.

Exit when all required task packets are issued.

### 5. `execute`

- Perform direct work only for the currently selected slice.
- If delegated work is running, wait for bounded outputs rather than re-expanding scope.

Exit when the direct slice is complete or delegated results return.

### 6. `fan_in`

- Reconcile delegated outputs.
- Resolve conflicts before starting more work.
- Update the canonical plan when assumptions or sequencing change.

Exit when one coherent next step remains.

### 7. `verify`

- Run the narrowest relevant checks for the completed slice.
- Prefer task-level validation before phase-level or repo-wide validation.

Exit when the validation result is recorded.

### 8. `review`

- Confirm code reality matches spec reality.
- Confirm tasks marked done are actually done.
- Confirm blockers and risks are captured.
- Confirm active repo-memory docs are still within size budget and remove completed sections that no longer belong in working memory.

Exit when repo memory tells the truth.

### 9. `handoff`

- Record what changed.
- Record what remains.
- Record validation performed.
- Leave one exact next action.

Exit when a new session could resume without relying on chat history.

### 10. `closed`

- Use only when the work is actually complete or explicitly cancelled.

## Parallel Fan-Out Rules

Parallel work is safe only when:

- file ownership is independent or low-conflict,
- the integration surface is known,
- return packets are bounded,
- the coordinator remains the only fan-in authority.

Good fan-out patterns:

- research plus implementation prep,
- backend contract plus frontend consumption,
- test design plus implementation review,
- docs updates in separate files.

Avoid fan-out when two workers are likely to rewrite the same files or redefine the same contract at the same time.

## Finish Checklist

Before ending a session, make sure repo memory includes:

- active status,
- truthful done vs pending state,
- blockers or open risks,
- validation performed,
- exact next action.

## Memory Size Controls

Apply these rules whenever reading, appending to, or writing OpenCode-managed markdown:

- Check current line count first for `.opencode/tasks/*.md`, `.opencode/specs/**/*.md`, and `.opencode/instructions/*.md`.
- Compact before writing if the file is already oversized or the next update would push it past budget.
- Keep `.opencode/tasks/index.md` under about 120 lines and limited to active or blocked work.
- Remove completed sections from active `tasks.md`; keep only open work, active blockers, pending validation, and a terse completed summary when needed.
- Prefer archives for durable history, but keep archives out of the default startup context.
