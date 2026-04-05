# Web Auth Boundaries Capability

Load when touching protected layouts, auth guards, callback flows, or public-vs-private route behavior.

Focus:
- Keep auth boundaries explicit between external and internal route groups.
- Preserve callback, login, signup, and reset flow contracts.
- Be careful when moving logic across server and client layers.

Important paths:
- `apps/web/src/app/(external)/`
- `apps/web/src/app/(internal)/`
- `apps/web/src/components/auth*`
- `apps/web/src/lib/auth/`

Verify with:
- `pnpm --dir apps/web check-types`
- focused auth-related tests for touched flows

References:
- `https://nextjs.org/docs/app`
- auth provider docs used by the touched flow
