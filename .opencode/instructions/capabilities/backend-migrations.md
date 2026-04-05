# Backend Migrations Capability

Load when changing schema, persistence contracts, repository ownership, or DB-backed domain boundaries.

Focus:
- Isolate contract changes before broad API or UI fan-out.
- Keep `@repo/core` database-independent.
- Prefer explicit repository seams over spreading storage details through routers and apps.

Important paths:
- `packages/db/src/schema/`
- `packages/db/src/validation/`
- `packages/api/src/repositories/`
- `packages/api/src/infrastructure/repositories/`

Verify with:
- `pnpm --dir packages/db check-types`
- `pnpm --dir packages/api check-types`

References:
- `https://orm.drizzle.team/docs/overview`
- `.opencode/instructions/project-reference.md`
