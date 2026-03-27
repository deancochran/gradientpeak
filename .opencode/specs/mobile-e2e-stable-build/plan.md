# Plan

## Phase 1: Build-path research and decision

- Confirm whether local-only Android E2E builds can be produced with current Expo/EAS setup or if EAS profile changes are required.
- Define the exact E2E build profile shape without `developmentClient: true`.
- Decide whether local installs use `expo run:android`, `eas build --local`, or another stable path.

## Phase 2: Environment isolation

- Ensure local Maestro runs cleanly against the normal development client runtime.
- Avoid introducing a second local dev-server mode unless future CI work truly requires it.
- Keep localhost web/API runtime on `3000` and Supabase on `54321`.

## Phase 3: Script simplification

- Add minimal Android E2E build/install command(s).
- Keep developer surface small and memorable.
- Remove or retire Dev Client specific prep logic once the new build path is working.

## Phase 4: Maestro flow simplification

- Reduce shared bootstrap to direct app launch plus minimal wait.
- Remove Expo launcher and dev menu recovery logic from common paths.
- Standardize one reusable authenticated-start pattern for downstream flows.

## Phase 5: Validation and handoff

- Verify install -> launch -> smoke flow on emulator.
- Update README and package scripts to reflect the preferred workflow.
- Document fallback/debug commands without making them primary.
