---
description: Perform a static repository audit for OpenCode safety, quality, and maintainability.
agent: code-improvement-reviewer
subtask: false
---

Perform a static, read-only audit of repository `$ARGUMENTS` if provided. Otherwise audit the current repository.

Review:

1. code quality and internal consistency
2. security and safety risks
3. documentation accuracy and transparency
4. functionality vs stated scope
5. repository hygiene and maintainability

Explicitly review OpenCode-relevant execution surfaces:

- custom agents
- custom commands
- skills and instructions
- plugins and MCP configuration
- shell execution patterns
- persistent state or generated files that affect behavior

Rules:

- do not execute code or scripts
- separate confirmed findings from uncertainty
- call out declared vs observed behavior mismatches
- score each category from 1 to 10
- list red flags and the smallest remedies that would improve the result
