---
name: worktrunk
description: Git worktree orchestration, Worktrunk commands, hooks, and parallel agent workflow guidance
---

# Worktrunk Skill

## When to Use

- Creating or switching isolated worktrees for parallel agent work
- Replacing raw `git worktree` flows with `wt` commands
- Designing or troubleshooting Worktrunk hooks, path templates, or merge cleanup
- Running multi-agent work from local terminals, OpenVSCode Web, or Codespaces

## Rules

1. Prefer `wt switch`, `wt list`, `wt merge`, and `wt remove` over raw `git worktree` commands when `wt` is available.
2. Keep one branch and one worktree per agent or bounded workstream.
3. Keep the coordinator in the primary worktree unless there is a strong reason to isolate it too.
4. Prefer a centralized external worktree root like `~/worktrees/{{ repo }}/{{ branch | sanitize }}` for local development.
5. Put shared automation in Worktrunk config and hooks, not in ad hoc shell history.

## Repo-Specific Guidance

- For this repo, the standard local layout is `~/worktrees/{{ repo }}/{{ branch | sanitize }}`.
- Keep nested in-repo worktrees as an exceptional cloud-IDE fallback, not the default workflow.
- Use `.config/wt.toml` for shared project hooks and list display settings.
- Use `~/.config/worktrunk/config.toml` for user-specific path templates and personal defaults.
- Allow external worktree access in OpenCode so agents can read, edit, and run commands there without repeated prompts.
- This repo's shared starter hooks currently run `pnpm install --frozen-lockfile` on `pre-start`, `pnpm check-types` + `pnpm lint` + `pnpm test` on `pre-merge`, and clear Worktrunk markers on `post-remove`.
- Do not let multiple agents edit the same files without explicit coordinator ownership.

## Core Commands

```bash
wt switch --create feature-api
wt switch feature-api
wt list
wt merge main
wt remove
```

## OpenCode Workflow Shape

1. Keep the main repo checkout for orchestration and review.
2. Create one Worktrunk worktree per delegated branch.
3. Launch `opencode` or another agent inside the target worktree.
4. Use `wt list` to monitor branch status, markers, and cleanup state.
5. Merge and remove finished worktrees with `wt merge` or `wt remove`.

## Hook Guidance

- Use `pre-start` for blocking setup that must finish before work begins.
- Use `post-start` for background tasks like dev servers, long builds, and cache copying.
- Use `pre-merge` for validation that must pass before integrating changes.
- Approve project hooks deliberately; they execute shared shell commands.

## Avoid

- Mixing raw `git worktree` cleanup and `wt` cleanup casually in the same workflow
- Broad hook commands that mutate unrelated state across all worktrees
- Assuming a web IDE can see sibling worktrees without explicit multi-root setup
- Treating worktree isolation as protection against merge conflicts when file ownership still overlaps

## Quick Checklist

- [ ] one branch per agent
- [ ] path layout matches the IDE/runtime constraints
- [ ] hooks are scoped and understandable
- [ ] ownership and merge target are explicit
- [ ] cleanup path is defined
