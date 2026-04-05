# Backend Mutations Capability

Load when changing write paths, mutation side effects, repository orchestration, or invalidation-sensitive behavior.

Focus:
- Prefer existing use-case and repository seams over inline write logic.
- Keep side effects explicit and close to the mutation flow that owns them.
- Re-check client invalidation or optimistic assumptions when server behavior changes.

Important paths:
- `packages/api/src/application/`
- `packages/api/src/repositories/`
- `packages/api/src/routers/`

Verify with:
- `pnpm --dir packages/api check-types`
- `pnpm --dir packages/api test`

References:
- `https://trpc.io/docs`
- `https://tanstack.com/query/latest/docs`
- `.opencode/instructions/project-reference.md`
