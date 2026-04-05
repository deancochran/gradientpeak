# Core Schemas And Calculations Capability

Load when touching shared schemas, calculations, validation contracts, or other domain logic that must stay database-independent.

Focus:
- Keep `@repo/core` free of DB and ORM concerns.
- Prefer pure deterministic functions.
- Use shared schemas for runtime validation and cross-package contracts.

Important paths:
- `packages/core/`
- `packages/core/schemas/`
- `packages/core/calculations/`

Verify with:
- `pnpm --dir packages/core check-types`
- `pnpm --dir packages/core test`

References:
- `https://zod.dev/`
- `.opencode/instructions/project-reference.md`
