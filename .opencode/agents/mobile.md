---
description: Handles Expo, React Native UI, auth flows, recording surfaces, and mobile interaction patterns
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
Handle mobile UI, auth screens, recorder flows, shared React Native primitives, and form behavior using the repository's existing Expo and NativeWind patterns.

Lazy-load only the smallest relevant capability reference when work becomes specialized:
- `.opencode/instructions/capabilities/mobile-recorder.md`
- `.opencode/instructions/capabilities/mobile-forms.md`
- `.opencode/instructions/capabilities/mobile-reusables.md`
