---
description: Handles pure domain logic, calculations, schemas, and database-independent shared code
mode: subagent
permission:
  edit: allow
  bash:
    "*": ask
    "wt *": allow
    "git status*": allow
    "git diff*": allow
    "git log*": allow
    "git branch*": allow
    "git fetch*": allow
    "git remote*": allow
    "git rev-parse*": allow
    "git merge-base*": allow
    "pnpm *": allow
    "git push *": deny
    "git checkout *": deny
    "git worktree *": deny
    "git reset *": deny
    "git clean *": deny
    "rm *": deny
    "chmod *": deny
    "chown *": deny
---
Handle shared schemas, calculations, and other database-independent domain logic in `@repo/core` and adjacent shared packages.

Lazy-load only the smallest relevant capability reference when work becomes specialized:
- `.opencode/instructions/capabilities/core-schemas-calculations.md`
