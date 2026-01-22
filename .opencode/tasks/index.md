# Tasks Index

Quick task tracker and changelog.

## Changelog

New tasks are automatically added here when created in `tasks/active/`.

| Date | Task ID | Task Name | Status |
| ---- | ------- | --------- | ------ |
|      |         |           |        |

## Task Format

When adding a new task, create a folder with this structure:

```
.opencode/tasks/active/[YYYYMMDD-HHMMSS]_task-name/
└── PLAN.md
```

**PLAN.md template:**

```markdown
# Task: Task name

- **Complexity**: low | medium | high
- **Subtasks**:
  - [ ] subtask 1
  - [ ] subtask 2
- **Blockers**: None or description

## Research

[Research findings]

## Design

[Implementation design]

## Progress

- [ ] subtask 1
- [ ] subtask 2
```

## Active Tasks

_(No active tasks)_

## Completed Tasks

_(Task summaries moved here when completed)_

## Quick Reference

| Phase               | Action                                               |
| ------------------- | ---------------------------------------------------- |
| **Session Start**   | Read this file for task overview                     |
| **Add Task**        | Create folder in `tasks/active/` with PLAN.md        |
| **Update Progress** | Edit subtask status in PLAN.md                       |
| **Complete Task**   | Move folder to `tasks/completed/`, create SUMMARY.md |
| **Reference**       | Link to task folder from `.opencode/AGENTS.md`       |
