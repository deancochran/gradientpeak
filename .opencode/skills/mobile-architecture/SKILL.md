---
name: mobile-architecture
description: Mobile app architecture, route and feature boundaries, state ownership, and repo-specific implementation standards
---

# Mobile Architecture Skill

## When to Use

- Restructuring or reviewing `apps/mobile` architecture.
- Splitting large route files into feature modules.
- Deciding where logic belongs between routes, feature hooks, `@repo/ui`, `@repo/core`, and `@repo/api`.
- Auditing state ownership, forms, or server-boundary decisions in mobile code.

## Scope

This skill covers repo-specific mobile architecture and cross-cutting implementation standards.

- Use `mobile-frontend` for UI composition, NativeWind, and interaction patterns.
- Use `mobile-recording` for recorder, BLE, FTMS, GPS, and FIT flows.
- Use `core-package` when logic should move into `@repo/core`.
- Use `backend` for server contracts, data access, and backend mutation patterns.

## Rules

1. Keep Expo Router files thin.
2. Keep server state, client state, and form state in separate owners.
3. Reuse `@repo/core` schemas and `@repo/ui` form primitives before inventing local patterns.
4. Treat `@repo/api` as the mobile boundary for server-backed operations.
5. Do not import database or server-only implementation details into mobile code.

## Required Lazy References

Read only the docs needed for the task:

- `.opencode/instructions/mobile-architecture-adr.md`
- `.opencode/instructions/mobile-standards-reference.md`
- `.opencode/instructions/project-reference.md` only when broader repo layout or commands matter

## Quick Checklist

- [ ] route file is thin
- [ ] feature ownership is explicit
- [ ] state ownership is explicit
- [ ] shared schemas and form wrappers are reused
- [ ] mobile code respects API and DB boundaries
