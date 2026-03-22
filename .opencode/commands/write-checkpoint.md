---
description: Write a lifecycle checkpoint for the active spec before pausing or changing phases.
agent: coordinator
subtask: false
---

Create a checkpoint for the active spec using the standard workflow lifecycle template.

Record:

1. current lifecycle state
2. completed work
3. active decisions
4. open questions or blockers
5. verification status
6. exact next recommended action

Update the smallest correct repo memory surface:

- `tasks.md` for execution truth
- `plan.md` for sequencing changes
- `design.md` for contract or architecture changes
- `.opencode/tasks/index.md` if active-spec status changed

Return:

- files updated
- checkpoint summary
- any missing information that prevented a complete checkpoint
