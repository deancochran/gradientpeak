# Web App Router Capability

Load when touching Next.js route structure, layouts, loading or error boundaries, or server-client component boundaries.

Focus:
- Default to Server Components and add `"use client"` only when required.
- Preserve existing route, layout, loading, and error conventions.
- Keep server-client boundaries deliberate rather than incidental.

Important paths:
- `apps/web/src/app/`
- `apps/web/src/components/`
- `apps/web/src/lib/`

Verify with:
- `pnpm --dir apps/web check-types`
- `pnpm --dir apps/web test`

References:
- `https://nextjs.org/docs/app`
- `.opencode/instructions/project-reference.md`
