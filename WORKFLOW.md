Got it 👍 — right now your workflow **describes the project**; what you want is a workflow that **gives the agent instructions**: how to use the docs, how to act, and how to keep state consistent.

Here’s a rewrite that turns it into an **instructive agentic workflow**. Think of it like rules of engagement for your AI dev partner:

---

# TurboFit Agentic Development Workflow

This document is written for **AI assistants and contributors** working on the TurboFit monorepo. It explains not only *what exists* in the repo, but *how to use it* to stay aligned with the project’s active state, context, and history.

---

## 1. Orientation Rules

1. Always read the **context manifest (`context.json`)** first.

   * It tells you where `TASKS.md`, `CHANGELOG.md`, and directory-level READMEs are located.
   * Use this to pull in only the docs relevant to your task.

2. Use **scoped READMEs** to understand a directory before editing its code.

   * Every app/package has a `README.md` describing purpose, entrypoints, and TODOs.
   * If missing or outdated, update it after your change.

3. Keep your reasoning transparent by updating:

   * `TASKS.md` → intent and progress
   * `CHANGELOG.md` → what actually changed

---

## 2. Active State Management

### 🔥 Tasks

* All ongoing and future work must be logged in `TASKS.md`.
* When creating a new task, link to the directory or file (e.g., `apps/native/components/WorkoutCard.tsx`).
* When completing a task, mark it ✅ and create a matching entry in `CHANGELOG.md`.

### 📝 Changelog

* After every significant change, add an entry in `CHANGELOG.md`.
* Reference the relevant `TASKS.md` item so history is traceable.
* Follow Keep-a-Changelog structure (`Added`, `Changed`, `Fixed`, etc).

### 📂 Scoped Docs

* If you add or modify APIs, logic, or architecture, update the relevant `README.md`.
* Each README should always answer: *What is this?*, *How do I use it?*, *What’s pending here?*

---

## 3. Working Instructions for the Agent

When asked to develop or edit code:

1. **Check Tasks**

   * Load `TASKS.md`.
   * If the requested change isn’t listed, add it under “In Progress” first.

2. **Check Local Context**

   * Load the directory’s `README.md`.
   * Understand its purpose and TODOs before modifying files.

3. **Apply Change**

   * Modify only the files relevant to the task.
   * Keep business logic in `core`, persistence in `drizzle`, API endpoints in `web`, and UI in `native`/`web`.

4. **Update Docs**

   * Update `TASKS.md` (mark task done or adjust scope).
   * Update `CHANGELOG.md` with a clear summary of the change.
   * Update scoped `README.md` if functionality, setup, or conventions changed.

---

## 4. Development Rules

* **Code Organization**

  * `core` → pure, db-agnostic functions and types
  * `drizzle` → schema + migrations
  * `web/api` → API routes, orchestrates DB + core
  * `web/components` / `native/components` → presentation & UI

* **Dependencies**

  * Add project-specific deps at app/package level
  * Add shared dev tooling at the root

* **Testing & CI**

  * Run `bun test` locally before PRs
  * Do not merge without passing tests + lint

---

## 5. Git & PR Discipline

1. Every feature/bugfix → new branch.
2. Update `TASKS.md` and `CHANGELOG.md` before committing.
3. Commit messages should reference the task ID from `TASKS.md`.
4. PR checklist:

   * ✅ Tests pass
   * ✅ Lint/format applied
   * ✅ Task closed in `TASKS.md`
   * ✅ Change logged in `CHANGELOG.md`
   * ✅ README updated if scope changed

---

## 6. Summary

The **agentic loop** is:

* **Intent** → log in `TASKS.md`
* **Context** → consult scoped `README.md`
* **Action** → modify code
* **Traceability** → update `CHANGELOG.md`
* **Continuity** → keep READMEs fresh

Following this ensures both humans and AI contributors always operate with the right context and leave the project in a consistent, documented state.
