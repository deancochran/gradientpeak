---
name: managing-context-window
description: Manage OpenCode context by focusing active work and using compress on closed ranges
---

# Managing Context Window Skill

## When to Use

- A task branch is finished and no longer needs raw message history
- The conversation has accumulated exploratory noise
- You need to keep active implementation context sharp

## Primary Tool

Use `compress` to replace a closed conversation range with a high-fidelity technical summary.

## Rules

1. Compress only closed ranges that are unlikely to be needed in raw form.
2. Prefer small, independent compressions over one large sweep.
3. Keep active editing, precise errors, and immediately relevant file details uncompressed.
4. Summaries must preserve decisions, constraints, paths, and outcomes.
5. Reference files and focused reads instead of re-pasting large content into the conversation.

## Good Candidates for Compression

- completed research passes
- resolved audits
- finished implementation chunks
- dead-end explorations that produced a clear conclusion

## Avoid Compressing

- active debugging loops
- file content you still need verbatim
- tool outputs you are about to act on directly

## Working Style

- keep the current task, relevant files, and latest blockers in active context
- summarize stale work once it is stable
- use file paths and targeted reads to recover detail when needed
