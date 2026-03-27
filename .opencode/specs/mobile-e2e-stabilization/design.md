# Mobile E2E Stabilization

## Objective

Stabilize the local mobile end-to-end workflow so `pnpm run dev` plus `pnpm run test:e2e` becomes a reliable daily loop, with Maestro focused on a very small deterministic smoke path.

## Scope

- Root E2E orchestration in `scripts/dev-e2e.sh`, `scripts/test-e2e.sh`, and related package scripts.
- Mobile Maestro reusable flows and smoke flows under `apps/mobile/.maestro/flows/`.
- Mobile app code only where runtime behavior is blocking the smoke flows.
- Local Supabase and Expo wiring only where it affects seeded auth or deterministic boot.

## Constraints

- Keep the coordinator thread focused on delegation and fan-in.
- Prefer fixing app or script behavior before adding more Maestro complexity.
- Keep required smoke coverage limited to auth navigation plus one authenticated tabs smoke path.
- Avoid unnecessary long Android rebuild/install work; use the existing install-skip path whenever possible.

## Success Criteria

- `pnpm run test:e2e` passes locally against the slim smoke workflow.
- Any failing step has a concrete, documented root cause and a bounded follow-up.
- Active repo memory reflects the latest passing or blocked state without relying on chat history.
