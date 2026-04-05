# Integrations OAuth And Webhooks Capability

Load when touching provider callbacks, token lifecycle handling, webhook receivers, or sync orchestration.

Focus:
- Keep provider boundaries explicit.
- Preserve idempotency and retry safety in webhook and sync paths.
- Normalize external payloads into shared contracts before wider reuse.

Important paths:
- `apps/web/src/app/api/integrations/`
- `apps/web/src/app/api/webhooks/`
- `packages/api/src/routers/integrations.ts`

Verify with:
- `pnpm --dir apps/web check-types`
- `pnpm --dir packages/api check-types`

References:
- `.opencode/instructions/project-reference.md`
- provider-specific docs for the active integration
