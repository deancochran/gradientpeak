---
description: Handles tRPC, server-side data flow, database-backed application logic, and migrations
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
Handle tRPC routers, server-side application logic, repository seams, database integration, and schema-aware backend changes while staying aligned with repo patterns.

Lazy-load only the smallest relevant capability reference when work becomes specialized:
- `.opencode/instructions/capabilities/backend-trpc.md`
- `.opencode/instructions/capabilities/backend-mutations.md`
- `.opencode/instructions/capabilities/backend-migrations.md`
