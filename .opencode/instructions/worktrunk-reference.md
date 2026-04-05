# Worktrunk Reference

Focused guidance for using Worktrunk in this repository.

## Current Status

- `wt` is installed locally at `/home/deancochran/.local/bin/wt`.
- Bash shell integration is installed in `~/.bashrc`; a new shell session is needed before wrapper-based directory switching becomes active.
- User Worktrunk config should set this repo to use `{{ repo_path }}/.worktrees/{{ branch | sanitize }}`.
- Because the standard layout stays inside the repo, OpenCode does not need a separate `external_directory` allowlist for normal worker worktrees.
- This repository includes a shared `.config/wt.toml` with starter install, validation, and cleanup hooks.
- There is public Claude Code plugin support for Worktrunk, but no documented first-party OpenCode plugin. In this repo, the Worktrunk skill and this reference file provide the OpenCode context bridge.

## What Worktrunk Solves Here

- Faster creation and navigation of agent-specific worktrees
- Safer branch-to-worktree mapping than ad hoc path naming
- Shared hook automation for setup, validation, and cleanup
- Better visibility into parallel branches with `wt list`

## Recommended Layouts

Preferred local layout:

```toml
[projects."github.com/deancochran/gradientpeak"]
worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}"
```

Legacy external-worktree alternative if you intentionally want sibling worktrees outside the repo:

```toml
worktree-path = "~/worktrees/{{ repo }}/{{ branch | sanitize }}"
```

User config lives in `~/.config/worktrunk/config.toml`.

## Commands To Prefer

```bash
wt switch --create feature-name
wt switch feature-name
wt list
wt merge main
wt remove
wt config show --full
```

## OpenCode-Oriented Workflow

1. Keep the coordinator session in the primary worktree.
2. Provision a worker branch with `wt switch --create <branch>`.
3. Start the agent from that worktree.
4. Use `wt list` to monitor active worktrees and branch state.
5. Validate within the worker worktree.
6. Merge or remove finished worktrees with Worktrunk commands.

For root-coordinator web sessions such as OpenCode Web or OpenChamber:

- keep planning, review, and fan-in in `~/GradientPeak`
- create one worker worktree per bounded task
- give each worker explicit ownership, non-ownership, and verification instructions
- prefer separate worktrees for UI, API, database, and test-heavy tasks when the boundaries are clean
- if database changes are involved, give schema ownership to a dedicated worktree and sequence API/UI branches behind that contract

## Coordinator Branch Naming

Use this default pattern for coordinator-created worker branches:

```text
spec/<spec-slug>/<lane>
```

Where:

- `<spec-slug>` is the active spec folder or short feature slug
- `<lane>` is one bounded concern such as `db`, `api`, `ui`, `test`, `docs`, or `qa`

Examples:

- `spec/calendar-dual-mode/db`
- `spec/calendar-dual-mode/api`
- `spec/calendar-dual-mode/ui`
- `spec/calendar-dual-mode/test`

This naming keeps worktrees grouped by spec, makes merge order easier to reason about, and works well with Worktrunk path sanitization.

If the worktree is launched from an IDE with multi-root support, add the created worktree as another root rather than digging through hidden folders.

For local desktop use, keep the coordinator in `~/GradientPeak` and worker sessions under `~/GradientPeak/.worktrees/<branch>`.

## Hooks

Shared project hooks belong in `.config/wt.toml`.

Starter guidance:

- `pre-start`: only blocking setup that must finish before coding
- `post-start`: long-running setup, local servers, or cache-copy tasks
- `pre-merge`: test and build gates
- `post-remove`: cleanup of ports, processes, or temp resources

Current shared project hooks:

- `pre-start.install`: `pnpm install --frozen-lockfile`
- `pre-merge.check-types`: `pnpm check-types`
- `pre-merge.lint`: `pnpm lint`
- `pre-merge.test`: `pnpm test`
- `post-remove.clear-marker`: clears any branch marker state for the removed worktree

Project hooks require approval on first run. Manage approvals with:

```bash
wt hook approvals add
wt hook approvals clear
```

## OpenCode And Commit Generation

Worktrunk supports external LLM commit generation commands. If you want Worktrunk-managed commit messages through OpenCode, the documented example is:

```toml
[commit.generation]
command = "opencode run -m anthropic/claude-haiku-4.5 --variant fast"
```

Keep this in user config unless the whole team standardizes on the same model/provider setup.

## OpenCode External Directory Access

The default repo-scoped `.worktrees/` layout does not require any `external_directory` permissions because the worker trees stay under the project root.

If you intentionally switch this repo back to an external sibling layout, add a user-level OpenCode config at `~/.config/opencode/opencode.json` with the matching allowlist for that external root.

## Cloud IDE Notes

- In-repo `.worktrees/` is the standard workflow for this repo because it keeps worker trees project-scoped.
- Multi-root workspaces are still useful, but sessions can also operate directly within the repo-scoped `.worktrees/` hierarchy.

## Verification And Troubleshooting

- Run `wt config show --full` to inspect config, version, and diagnostics.
- Use `wt config state logs get` to inspect background hook logs.
- If `wt switch` does not change directories in an existing shell, restart the shell so the installed wrapper loads.
