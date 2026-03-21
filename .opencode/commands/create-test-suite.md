---
description: Create or extend a focused test suite for a file, feature, or package.
agent: build
subtask: true
---

Create or extend a focused test suite for `$ARGUMENTS`.

Process:

1. Inspect the implementation and existing tests.
2. Choose the smallest correct test scope: unit, component, integration, or E2E.
3. Cover relevant happy paths, edge cases, failures, cleanup, and interactions.
4. Mock only external boundaries.
5. Run the narrowest relevant verification and report any remaining gaps.

Return:

- test files added or updated
- scenarios covered
- targeted verification run
