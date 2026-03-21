# Delegation Contract Reference

Use this reference when packaging work for a subagent or recording the result of a delegated unit.

## Task Packet Template

```text
Objective:
- What this worker must achieve.

Scope:
- Exact files, directories, or decision boundary.

Allowed Files Or Areas:
- Files the worker may inspect or change.

Required Context:
- Relevant spec sections, prior decisions, and constraints.

Excluded Context:
- Context that should not be re-expanded or reconsidered.

Deliverable Shape:
- Code patch, audit summary, design notes, checklist update, or validation result.

Completion Criteria:
- What must be true for the work to count as complete.

Verification Expectation:
- Checks the worker should run or explicitly leave for fan-in.

Blocker Escalation Rule:
- When to stop and return control instead of continuing.
```

## Return Packet Template

```text
Status:
- completed | blocked | needs_review | aborted

Outcome:
- Concise summary of what happened.

Decisions Taken:
- Any choices locked during the task.

Files Touched Or Proposed:
- Exact paths changed or recommended.

Verification Run:
- Commands run, checks performed, or why no verification was possible.

Unresolved Risks:
- Remaining uncertainty, merge risk, or follow-up need.

Exact Next Step:
- The next action if the work is incomplete or needs fan-in.
```

## Checkpoint Template

```text
Lifecycle State:
- intake | orient | plan | delegate | execute | fan_in | verify | review | handoff | closed

Completed Work:
- What is now true.

Active Decisions:
- Contract or sequencing decisions currently in force.

Open Questions Or Blockers:
- Anything that prevents safe continuation.

Verification Status:
- What has and has not been validated.

Next Recommended Action:
- One exact next move.
```

## Routing Rules

- Send only the minimum context needed for the task.
- Prefer file references over repeated prose.
- Include prior checkpoints only when they materially affect the task.
- Do not push coordinator-only responsibilities onto delegated workers.
