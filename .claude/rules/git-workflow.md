# Git Workflow Rules for GradientPeak

## Branch Strategy

### Main Branch
- **`main`** - Production-ready code
- Always deployable
- Protected branch (requires reviews if configured)
- Direct commits discouraged

### Feature Branches
```bash
# Create feature branch from main
git checkout main
git pull origin main
git checkout -b feature/activity-recording-improvements

# Work on feature
git add .
git commit -m "Add cadence tracking to activity recorder"

# Push to remote
git push -u origin feature/activity-recording-improvements
```

### Branch Naming Conventions
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates
- `test/description` - Test additions/improvements
- `chore/description` - Maintenance tasks

**Examples:**
- `feature/strava-integration`
- `fix/recording-service-memory-leak`
- `refactor/activity-recorder-hooks`
- `docs/update-api-documentation`
- `test/add-tss-calculation-tests`
- `chore/update-dependencies`

## Commit Messages

### Format
```
<type>: <short summary>

<optional body>

<optional footer>
```

### Types
- `feat:` - New feature
- `fix:` - Bug fix
- `refactor:` - Code refactoring
- `test:` - Adding or updating tests
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, no logic change)
- `chore:` - Maintenance tasks
- `perf:` - Performance improvements

### Examples

**Good commit messages:**
```bash
feat: add cadence tracking to activity recorder

- Add cadence sensor support in ActivityRecorder
- Implement cadence display in recording UI
- Add cadence to session stats interface

Closes #123

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

```bash
fix: prevent memory leak in recording service

The ActivityRecorder was not cleaning up event listeners
properly when the recording screen was unmounted. This
caused a memory leak on repeated recordings.

- Add cleanup method to remove all listeners
- Call cleanup in useEffect return
- Add tests for cleanup behavior

Fixes #456
```

```bash
refactor: extract metrics calculations to core package

Move TSS, IF, and NP calculations from tRPC router to
@repo/core package for reusability across mobile and web.

- Create calculations/tss.ts in core package
- Add comprehensive tests for calculations
- Update tRPC router to use core package functions
```

**Bad commit messages:**
```bash
# ❌ Too vague
fix: bug fix

# ❌ No context
update files

# ❌ Multiple unrelated changes
feat: add strava integration, fix recording bug, update docs
```

### Co-Authoring with Claude
When Claude Code helps with commits, include co-author line:
```bash
git commit -m "$(cat <<'EOF'
feat: add activity plan progression tracking

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

## Committing Process

### Before Committing
1. **Review changes**: `git diff` or `git status`
2. **Run linter**: `pnpm lint`
3. **Run type check**: `pnpm check-types`
4. **Run tests**: `pnpm test` (if configured)

### Staging Changes
```bash
# Stage specific files
git add apps/mobile/lib/services/ActivityRecorder/index.ts
git add apps/mobile/lib/hooks/useActivityRecorder.ts

# Stage all changes in a directory
git add apps/mobile/components/recording/

# Stage all changes (use carefully)
git add .

# Review staged changes
git diff --staged
```

### Committing
```bash
# Simple commit
git commit -m "feat: add heart rate zone tracking"

# Commit with body (using HEREDOC for formatting)
git commit -m "$(cat <<'EOF'
feat: add heart rate zone tracking

- Calculate zones based on max heart rate
- Display current zone in recording UI
- Add zone distribution to session stats

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
EOF
)"
```

### Amending Commits
```bash
# Amend last commit (only if not pushed)
git add forgotten-file.ts
git commit --amend --no-edit

# Amend commit message (only if not pushed)
git commit --amend -m "New commit message"
```

## Pushing Changes

### Push to Remote
```bash
# First push (set upstream)
git push -u origin feature/my-feature

# Subsequent pushes
git push

# Force push (use with caution, only on feature branches)
git push --force-with-lease
```

### Before Pushing
- ✅ Ensure all tests pass
- ✅ Ensure code is formatted
- ✅ Ensure types are correct
- ✅ Review commit messages
- ✅ Verify no sensitive data (API keys, credentials)

## Pull Requests

### Creating a Pull Request
```bash
# Using GitHub CLI (recommended)
gh pr create --title "Add activity recording improvements" --body "$(cat <<'EOF'
## Summary
- Add cadence tracking
- Improve GPS accuracy
- Fix memory leak in recording service

## Test plan
- [x] Test cadence sensor connection
- [x] Test GPS tracking outdoors
- [x] Test repeated recording sessions
- [ ] Manual testing on iOS device

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

### Pull Request Template
```markdown
## Summary
<!-- Brief description of changes (1-3 bullet points) -->

- Change 1
- Change 2
- Change 3

## Changes
<!-- Detailed list of changes made -->

### Mobile App
- Added X feature
- Fixed Y bug

### Web Dashboard
- Updated Z component

### Core Package
- Refactored W calculation

## Test Plan
<!-- How to verify these changes work -->

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## Screenshots (if applicable)
<!-- Add screenshots or videos showing the changes -->

## Breaking Changes
<!-- List any breaking changes, or remove section -->

None

## Additional Notes
<!-- Any other context or information -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### Before Submitting PR
- ✅ All tests pass locally
- ✅ Code is formatted and linted
- ✅ Types are correct
- ✅ Commit messages are clear
- ✅ PR description is complete
- ✅ Breaking changes are documented

## Merging Strategy

### Merge Methods
1. **Squash and merge** (recommended for feature branches)
   - Clean commit history on main
   - One commit per feature
2. **Merge commit** (for larger features with meaningful commits)
   - Preserves feature branch history
3. **Rebase and merge** (for small, clean PRs)
   - Linear history

### After Merging
```bash
# Switch to main and pull
git checkout main
git pull origin main

# Delete feature branch locally
git branch -d feature/my-feature

# Delete feature branch remotely
git push origin --delete feature/my-feature
```

## Working with Remote Changes

### Pulling Updates
```bash
# Pull main branch
git checkout main
git pull origin main

# Update feature branch with main changes
git checkout feature/my-feature
git merge main

# Or rebase (cleaner history)
git checkout feature/my-feature
git rebase main
```

### Resolving Conflicts
```bash
# Pull/merge/rebase creates conflicts
# Fix conflicts in affected files

# Mark conflicts as resolved
git add resolved-file.ts

# Continue merge
git merge --continue

# Or continue rebase
git rebase --continue

# Abort if needed
git merge --abort
git rebase --abort
```

## Git Hooks

### Pre-commit Hook (if configured)
```bash
# .husky/pre-commit
pnpm lint
pnpm check-types
pnpm test --bail --passWithNoTests
```

If pre-commit hook fails:
1. Fix the issues
2. Stage the fixes
3. Commit again

### Bypassing Hooks (use sparingly)
```bash
# Only use when you know what you're doing
git commit --no-verify -m "WIP: partial implementation"
```

## Git Best Practices

### Do's ✅
- ✅ Commit frequently with clear messages
- ✅ Keep commits focused (one logical change per commit)
- ✅ Pull main regularly to avoid large conflicts
- ✅ Review your own changes before committing
- ✅ Test before pushing
- ✅ Use meaningful branch names
- ✅ Delete merged branches
- ✅ Use co-author tags when appropriate

### Don'ts ❌
- ❌ Don't commit commented-out code
- ❌ Don't commit console.log statements (unless intentional)
- ❌ Don't commit sensitive data (API keys, credentials)
- ❌ Don't commit large binary files
- ❌ Don't force push to main branch
- ❌ Don't commit broken code
- ❌ Don't mix unrelated changes in one commit
- ❌ Don't use vague commit messages

## Stashing Changes

### Save Work in Progress
```bash
# Stash changes
git stash

# Stash with message
git stash save "WIP: recording improvements"

# List stashes
git stash list

# Apply most recent stash
git stash apply

# Apply and remove stash
git stash pop

# Apply specific stash
git stash apply stash@{1}

# Delete stash
git stash drop stash@{1}
```

## Viewing History

### Git Log
```bash
# Simple log
git log

# One line per commit
git log --oneline

# Graph view
git log --graph --oneline --all

# Last N commits
git log -n 5

# Commits by author
git log --author="Claude"

# Commits in date range
git log --since="2 weeks ago"
```

### Git Blame
```bash
# See who changed each line
git blame file.ts

# See changes in specific line range
git blame -L 10,20 file.ts
```

## Undoing Changes

### Unstage Files
```bash
# Unstage specific file
git reset HEAD file.ts

# Unstage all files
git reset HEAD
```

### Discard Changes
```bash
# Discard changes in specific file
git checkout -- file.ts

# Discard all changes
git checkout -- .
```

### Revert Commit
```bash
# Create new commit that undoes a previous commit
git revert <commit-hash>

# Revert without committing (stage changes)
git revert -n <commit-hash>
```

### Reset (use with caution)
```bash
# Soft reset - keeps changes staged
git reset --soft HEAD~1

# Mixed reset - keeps changes unstaged (default)
git reset HEAD~1

# Hard reset - discards changes (DANGEROUS)
git reset --hard HEAD~1
```

## Working with .gitignore

### Common Ignored Files
```
# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
.next/
.expo/

# Environment variables
.env
.env.local
.env.production

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# Testing
coverage/
```

### Adding Files to .gitignore
```bash
# Add pattern to .gitignore
echo "*.log" >> .gitignore

# Remove already tracked file
git rm --cached file.log
git commit -m "chore: remove log file from tracking"
```

## Emergency Procedures

### Accidentally Committed Sensitive Data
```bash
# Remove from last commit (not yet pushed)
git reset --soft HEAD~1
# Remove sensitive data from files
git add .
git commit -m "feat: add feature (without sensitive data)"

# If already pushed - contact team lead immediately
# May need to rotate credentials and force push
```

### Broke Main Branch
```bash
# Revert to last working commit
git revert <bad-commit-hash>
git push origin main

# Or create hotfix branch
git checkout -b hotfix/fix-broken-main
# Fix the issue
git push -u origin hotfix/fix-broken-main
# Create PR for immediate merge
```

## Git Configuration

### User Configuration
```bash
# Set name and email
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"

# Set default editor
git config --global core.editor "code --wait"

# Set default branch name
git config --global init.defaultBranch main
```

### Repository Configuration
```bash
# View config
git config --list

# Set upstream default
git config push.default simple

# Set pull strategy
git config pull.rebase false
```

## Critical Git Safety Rules

- 🚨 **NEVER force push to main** - Can destroy team's work
- 🚨 **NEVER commit secrets** - API keys, passwords, credentials
- 🚨 **NEVER rewrite published history** - Others may have pulled
- 🚨 **ALWAYS review before pushing** - Double-check changes
- 🚨 **ALWAYS pull before starting work** - Avoid conflicts
- 🚨 **ALWAYS test before pushing** - Don't break main
