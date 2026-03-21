---
description: Prepare a truthful end-of-session handoff from repo memory.
agent: coordinator
subtask: false
---

Produce a finish handoff for `$ARGUMENTS` or for the active spec if no argument is provided.

The handoff must confirm:

1. active status: `completed`, `in_progress`, `blocked`, or `cancelled`
2. what changed
3. what remains pending
4. blockers or unresolved risks
5. validation performed
6. one exact next action

Rules:

- prefer repo memory over chat recollection
- do not mark work complete if `tasks.md` says otherwise
- call out any mismatch between spec truth and code truth

Return:

- final handoff summary
- repo memory files reviewed
- any truth gaps that should be fixed before ending the session
