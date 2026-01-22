# Tasks Index

Quick task tracker and changelog.

## Changelog

New tasks are automatically added here when created in `specs/`.

| Date | Topic | Status |
| ---- | ----- | ------ |
|      |       |        |

## Task Format

When adding a new task, create a folder in `.opencode/specs/` with this structure:

```
.opencode/specs/{YYYY-MM-DD}_task-name/
├── design.md    # What and why
├── plan.md      # Phases and steps
└── tasks.md     # Granular checklist
```

**design.md template:**

```markdown
# Design: Task name

## Overview

Brief description of what and why.

## Goals

- Goal 1
- Goal 2

## Non-Goals

- What we're not solving

## Background

Context and motivation
```

**plan.md template:**

```markdown
# Plan: Task name

## Phases

1. Phase 1: Description
2. Phase 2: Description

## Steps

### Phase 1

- [ ] Step 1
- [ ] Step 2
```

**tasks.md template:**

```markdown
# Tasks: Task name

## Task List

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3
```

## Active Tasks

_(No active tasks)_

## Completed Tasks

_(Task summaries moved here when completed)_

## Quick Reference

| Phase               | Action                                |
| ------------------- | ------------------------------------- |
| **Session Start**   | Read this file for task overview      |
| **Add Task**        | Create folder in `.opencode/specs/`   |
| **Update Progress** | Edit status in `tasks.md`             |
| **Complete Task**   | Document lessons learned in `plan.md` |
