---
name: documentation
description: JSDoc, README, and maintenance-document standards for this repository
---

# Documentation Skill

## When to Use

- Updating READMEs, reference docs, commands, or process docs
- Adding JSDoc for public APIs
- Cleaning up stale or inconsistent project documentation

## Rules

1. Keep docs close to the code or workflow they describe.
2. Explain intent, constraints, and usage; avoid narrating obvious code.
3. Use examples only when they reflect real current behavior.
4. Update docs in the same change set as the code when possible.
5. Prefer short sections with strong headings over long prose.

## Default JSDoc Shape

````ts
/**
 * Resolves the display label for a workout target.
 *
 * Returns `"unavailable"` when the target cannot be represented with the
 * data available in the current session.
 */
export function resolveTrainingTarget(...) {}
````

## Repo-Specific Guidance

- `AGENTS.md` should stay durable and always-on.
- `.opencode/instructions/project-reference.md` should hold detailed reference material.
- Skills and commands should stay concise and specialized.
- Remove stale paths, obsolete terms, and dead examples during edits.

## Avoid

- Copying code into docs without verifying it still matches reality
- Commenting obvious implementation details
- Letting process docs turn into duplicated policy across multiple files

## Quick Checklist

- [ ] concise and specific
- [ ] examples still valid
- [ ] file paths and commands current
- [ ] no obsolete terminology
