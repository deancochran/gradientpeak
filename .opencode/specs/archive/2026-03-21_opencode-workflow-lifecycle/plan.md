# Implementation Plan: Repository-Level OpenCode Workflow Lifecycle

## 1. Strategy

Add the smallest durable workflow upgrade first: define coordinator states, a delegation contract, checkpoint rules, and fan-out and fan-in review points using the existing `.opencode` memory structure.

## 2. Planned File Areas

### Repo Instructions

- `AGENTS.md`
- `.opencode/tasks/index.md`

### Workflow References

- `.opencode/instructions/*` as needed
- `.opencode/specs/<active-spec>/design.md`
- `.opencode/specs/<active-spec>/plan.md`
- `.opencode/specs/<active-spec>/tasks.md`

### Optional Templates Or Examples

- `.opencode/specs/archive/*` for reference patterns
- reusable coordinator and delegation templates if the repo wants standard packets later

## 3. Change Map

### Phase 1: Lifecycle contract

Define and document:

- coordinator states,
- state entry and exit criteria,
- coordinator-only responsibilities,
- finish modes.

### Phase 2: Delegation contract

Define:

- required task packet fields,
- required return packet fields,
- escalation and blocker rules,
- ownership boundaries between coordinator and delegated workers.

### Phase 3: Context routing and checkpoint model

Define:

- context tiers,
- routing rules,
- checkpoint triggers,
- which repo artifact owns which kind of memory.

### Phase 4: Parallel fan-out and fan-in rules

Define:

- when parallel delegation is safe,
- required independence criteria,
- fan-in synthesis steps,
- merge and conflict ownership.

### Phase 5: Verification and review policy

Define:

- task-level verification expectations,
- phase-level review gates,
- final handoff requirements,
- criteria for reopening work after failed review.

### Phase 6: Finish handoff integration

Define:

- how `tasks.md` reflects current truth,
- how `.opencode/tasks/index.md` reflects spec status,
- what the next session must be able to infer without chat history.

## 4. Exact Repo-Level Decisions To Lock

### A. Status vocabulary

Use one shared set of states across spec tracking and coordinator lifecycle where possible.

### B. Source of truth split

- `design.md` owns why and contract decisions,
- `plan.md` owns execution structure,
- `tasks.md` owns live progress and blockers.

### C. Verification timing

Prefer narrow validation after meaningful changes, with final broad validation only when warranted by scope.

## 5. Validation

Focused validation for this workflow spec should include:

```bash
pnpm check-types
pnpm lint
pnpm test
```

If implementation is doc or process only, at minimum verify:

- spec docs are internally consistent,
- task phases map cleanly to the plan,
- lifecycle terminology is consistent across all three docs.

## 6. Risk Controls

- avoid inventing a second memory system outside `.opencode/specs/*`,
- avoid overloading delegated workers with coordinator duties,
- avoid "parallel by default" when merge ownership is unclear,
- require checkpoint writes at phase boundaries to prevent silent state loss.

## 7. Follow-Up Boundary

If this first pass works, follow-up specs can standardize:

- reusable delegation packet templates,
- automated checkpoint generation,
- explicit review and verification commands,
- archive and resume conventions for interrupted specs.
