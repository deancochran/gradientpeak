# Worktrunk Reference

Focused guidance for using Worktrunk in this repository.

## Current Status

- `wt` is installed locally at `/home/deancochran/.local/bin/wt`.
- Bash shell integration is installed in `~/.bashrc`; a new shell session is needed before wrapper-based directory switching becomes active.
- User Worktrunk config should set this repo to use `~/worktrees/{{ repo }}/{{ branch | sanitize }}`.
- OpenCode should allow `~/worktrees/GradientPeak/**` via `external_directory` in global user config so agents can operate there normally.
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
[projects."github.com/deancochran/GradientPeak"]
worktree-path = "~/worktrees/{{ repo }}/{{ branch | sanitize }}"
```

Optional cloud IDE fallback if a single mounted root makes external worktrees impractical:

```toml
worktree-path = "{{ repo_path }}/.worktrees/{{ branch | sanitize }}"
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

If the worktree is launched from an IDE with multi-root support, add the created worktree as another root rather than digging through hidden folders.

For local desktop use, keep the coordinator in `~/GradientPeak` and worker sessions under `~/worktrees/GradientPeak/<branch>`.

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

Use user-level OpenCode config to allow the external worktree root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "external_directory": {
      "~/worktrees/GradientPeak/**": "allow"
    }
  }
}
```

This keeps repo config portable while letting local agents treat `~/worktrees/GradientPeak/**` as trusted workspace extensions.

## Cloud IDE Notes

- In-repo `.worktrees/` is a compatibility fallback for single-root web IDEs, not the standard local workflow.
- Multi-root workspaces are still preferred over browsing hidden folders directly.

## Verification And Troubleshooting

- Run `wt config show --full` to inspect config, version, and diagnostics.
- Use `wt config state logs get` to inspect background hook logs.
- If `wt switch` does not change directories in an existing shell, restart the shell so the installed wrapper loads.
