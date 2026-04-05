# Mobile Stack Boundary Hardening

## Goal

Reduce mobile complexity by making `apps/mobile` consistently app-facing rather than DB-facing or adapter-facing.

## Decisions

- `apps/mobile` must not depend on `@repo/db`.
- Drizzle validation generation should use `drizzle-orm/zod`, not `drizzle-zod`.
- Mobile server-backed data should default through `@repo/api`.
- Direct mobile Supabase usage should be limited to narrow client-runtime seams that do not yet have a stable API replacement.
- State ownership remains strict:
  - React Query for server state
  - RHF for form state
  - Zustand only for narrow UI or ephemeral client state

## Phase Scope

### Phase 1

- remove `@repo/db` references from mobile package/tooling
- migrate `packages/db` validation generation to `drizzle-orm/zod`
- audit and reduce the safest remaining direct mobile Supabase usages

### Phase 2

- continue mobile screen/form standardization where boundary cleanup intersects existing hotspots
- leave broad route/screen rewrites to follow-on bounded slices

## Non-Goals

- full mobile architecture rewrite in one pass
- replacing every auth/runtime Supabase seam without an existing API-safe contract
