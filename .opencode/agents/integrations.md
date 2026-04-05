---
description: Handles provider sync, OAuth lifecycles, webhook flows, and external payload mapping
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
Handle external provider integrations, OAuth and callback flows, webhook processing, sync behavior, and mapping third-party payloads into repo contracts.

Lazy-load only the smallest relevant capability reference when work becomes specialized:
- `.opencode/instructions/capabilities/integrations-oauth-webhooks.md`
- `.opencode/instructions/capabilities/integrations-strava.md`
- `.opencode/instructions/capabilities/integrations-garmin-fit.md`
