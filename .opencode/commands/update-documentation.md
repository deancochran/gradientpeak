---
description: Update the smallest set of docs needed to match recent code changes.
agent: build
subtask: true
---

Update only the documentation made inaccurate or incomplete by the current changes.

Review:

- `AGENTS.md` for durable repo-wide workflow changes
- package or app `README.md` files for public setup or usage changes
- `.opencode/instructions/project-reference.md` for stable architecture or stack updates
- migration or feature docs when behavior changed materially

Rules:

1. Keep docs concise, specific, and consistent with the code.
2. Remove stale paths, outdated examples, and obsolete terminology.
3. Do not create broad new docs for unchanged internals.
4. Verify examples or commands when practical.

Return:

- which docs changed
- why each change was needed
- any intentionally unchanged docs that were reviewed
