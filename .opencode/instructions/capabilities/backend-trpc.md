# Backend tRPC Capability

Load when changing routers, procedures, request validation, or server-client contract boundaries.

Focus:
- Keep validation explicit at procedure boundaries.
- Reuse shared schemas and core logic where possible.
- Keep auth, authorization, and error handling visible in the procedure flow.

Important paths:
- `packages/api/src/routers/`
- `packages/api/src/context.ts`
- `packages/core/`

Verify with:
- `pnpm --dir packages/api check-types`
- `pnpm --dir packages/api test`

References:
- `https://trpc.io/docs`
- `.opencode/instructions/project-reference.md`
