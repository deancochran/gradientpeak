# Dependency Order Matrix

## Purpose

Show what must be decided first, what can run in parallel, and what depends on prior cut lines.

## Sequence Matrix

| Workstream | Depends on | Can run in parallel with | Blocks |
| --- | --- | --- | --- |
| Final package map | none | current-state inventory | all later package decisions |
| Current-state inventory | none | final package map | accurate migration planning |
| `packages/db` ownership design | package map, DB inventory | auth design | API DB refactor |
| `packages/auth` ownership design | package map, auth inventory | DB design | API auth refactor, web auth rewrite |
| API package naming decision | package map | DB/auth design | import migration planning |
| API context redesign | DB design, auth design | web route mapping | final API migration plan |
| TanStack Start web route design | package map, web inventory | API context redesign | web cutover planning |
| Expo mobile auth migration design | package map, mobile auth inventory, auth design | web route design | mobile cutover planning |
| shared tooling design | package map, tooling inventory | web route design | package/app config migration |
| final cutover design | all prior design decisions | none | completion criteria |

## Critical Path

1. finalize package map
2. complete inventories
3. finalize `packages/db` and `packages/auth` ownership
4. finalize API package naming and context
5. finalize TanStack Start web route and endpoint design
6. finalize Expo mobile auth/bootstrap design
7. finalize tooling move
8. finalize cutover and cleanup gates

## Parallelizable Work

- DB design and auth design can progress in parallel after the package map and inventories exist
- web route mapping, mobile inventory/scaffolding, and tooling migration planning can progress in parallel once the core package map is stable
- web and mobile final integration should wait until the API context and auth contracts are stable
- artifact updates can happen continuously as long as they reflect the latest decisions

## Completion Condition

- no later-phase artifact depends on an unresolved earlier-phase architecture choice
