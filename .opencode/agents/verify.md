---
description: Runs the narrowest relevant verification and returns actionable failures or confidence signals
mode: subagent
temperature: 0.1
permission:
  edit: deny
  bash:
    "*": deny
    "git status*": allow
    "git diff*": allow
    "git log*": allow
    "git rev-parse*": allow
    "git merge-base*": allow
    "pnpm check-types*": allow
    "pnpm lint*": allow
    "pnpm test*": allow
    "pnpm --filter *": allow
---
Choose the narrowest relevant verification first, expand only when the results require it, and return status, commands run, pass or fail, failing surfaces, likely cause, and the exact next action.
