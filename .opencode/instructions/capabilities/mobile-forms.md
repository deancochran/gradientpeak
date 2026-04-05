# Mobile Forms Capability

Load when touching auth forms, validation flow, submit state, or error mapping on mobile.

Focus:
- Reuse existing form helpers and schemas before adding new ones.
- Keep schema-driven validation and error mapping consistent across auth flows.
- Avoid screen-specific submit plumbing when shared helpers already fit.

Important paths:
- `apps/mobile/lib/auth/`
- `apps/mobile/lib/utils/formErrors.ts`
- `apps/mobile/app/(external)/`
- `apps/mobile/components/`

Verify with:
- `pnpm --dir apps/mobile check-types`
- `pnpm --dir apps/mobile test`

References:
- `https://react-hook-form.com/docs`
- `https://zod.dev/`
- `.opencode/instructions/project-reference.md`
