# Mobile Architecture ADR

Lazy-load this reference for `apps/mobile` architecture work, route audits, or cross-cutting mobile refactors.

## Status

- Accepted current default.

## Decision

- Use Expo Router for routing, layout grouping, guards, and route-param entry only.
- Keep files in `apps/mobile/app/**` thin and move durable screen logic into feature modules.
- Use React Query for server state and mutation lifecycle.
- Use Zustand only for small client or UI state that does not belong in route params or forms.
- Use React Hook Form plus Zod for non-trivial forms.
- Keep shared mobile-safe schemas, validation, and domain logic in `@repo/core`.
- Treat `@repo/api` as the mobile boundary for server-backed operations.
- Keep Drizzle and database access server-only behind `@repo/db` and server layers.

## Context

- The repo already has the right primitives, but adoption is uneven across `apps/mobile`.
- Current complexity hotspots include `apps/mobile/app/(internal)/(tabs)/calendar.tsx`, `plan.tsx`, `apps/mobile/app/(internal)/(standard)/training-preferences.tsx`, and the training-plan composer surfaces.
- Prior mobile hardening work established the target direction: thin route files, feature-owned orchestration, shared form wrappers, and mobile-safe boundaries through `@repo/api` and `@repo/core`.

## Boundary Model

### Mobile route layer

- `apps/mobile/app/**` owns route registration, layout composition, auth grouping, and route-param parsing.
- Route files should usually parse params and render a feature screen.

### Mobile feature layer

- Feature modules own screen composition, derived view state, query and mutation orchestration, and feature-local helpers.
- Prefer `apps/mobile/features/<feature>/screens`, `hooks`, `components`, and `forms` over growing route files.

### Shared UI layer

- `@repo/ui` owns shared field wrappers, form utilities, primitives, and theme tokens.
- Prefer shared wrappers before writing screen-local input glue.

### Shared domain layer

- `@repo/core` owns mobile-safe schemas, parsers, validation, calculations, and domain mappers.
- Keep app-facing values camelCase and domain-shaped rather than DB-shaped.

### Server boundary layer

- `@repo/api` owns typed client access, query options, and mutation contracts.
- Mobile code should not import Drizzle schema, database tables, or server-only persistence code.

## Consequences

- Screen refactors become safer because route concerns and feature concerns are separated.
- Form behavior becomes more consistent because RHF, Zod, and shared wrappers become the default path.
- Server state, UI state, and form state stay easier to reason about and test.
- Mobile code stays portable and app-facing instead of coupling to DB contracts.

## Non-Goals

- This ADR does not replace the `mobile-frontend` skill for UI composition rules.
- This ADR does not define recorder-specific architecture; use `mobile-recording` when needed.
- This ADR does not define backend router or database design.

## When To Load This

- Creating or reviewing a new mobile feature.
- Splitting a large route file into feature modules.
- Auditing state ownership, form ownership, or mobile package boundaries.
- Deciding whether logic belongs in `apps/mobile`, `@repo/ui`, `@repo/core`, or `@repo/api`.

## Related References

- `.opencode/instructions/mobile-standards-reference.md`
- `.opencode/skills/mobile-architecture/SKILL.md`
- `.opencode/skills/mobile-frontend/SKILL.md`
- `.opencode/instructions/project-reference.md`
