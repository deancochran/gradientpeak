---
description: Plan a safe parallel fan-out for bounded multi-agent work.
agent: coordinator
subtask: false
---

Plan a parallel fan-out for `$ARGUMENTS` using the workflow lifecycle rules.

For each proposed workstream, define:

1. objective
2. exact scope
3. allowed files or file areas
4. required context
5. excluded context
6. deliverable shape
7. completion criteria
8. verification expectation
9. blocker escalation rule

Also decide:

- whether the work is truly safe to parallelize
- the fan-in owner
- the merge boundary
- the order of synthesis after results return

Rules:

- do not parallelize overlapping file rewrites without a clear merge owner
- prefer fan-out for research, contract splits, validation planning, or low-conflict implementation slices
- fall back to a single delegated task if the workstreams are too coupled

Return:

- recommended workstreams
- specialist assignment per workstream
- fan-in plan
- reasons the plan is safe or not safe
