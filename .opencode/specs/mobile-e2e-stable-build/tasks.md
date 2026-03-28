# Tasks

## Open

- [ ] Research the smallest reliable Android E2E build profile without Expo Dev Client.
- [ ] Decide the local install/build command that best balances reliability and DX.
- [ ] Ensure local Maestro runs cleanly against the existing development client runtime.
- [ ] Add minimal package scripts for build/install/test.
- [ ] Simplify Maestro bootstrap to direct app launch only.
- [ ] Remove now-obsolete Dev Client prep logic once the build path is proven.
- [ ] Validate `pnpm run dev` + install + `pnpm --filter mobile test:e2e`.

## Coordination notes

- Prioritize Android first.
- Treat developer simplicity as a first-class requirement.
- Keep the documented happy path to three commands or fewer.
- 2026-03-28 CI research: current local install fingerprint skip in `apps/mobile/scripts/android-emulator.sh` does not help GitHub-hosted runners because each job is fresh. Biggest likely wins are build-once artifact reuse across Maestro lanes, AVD snapshot caching with `reactivecircus/android-emulator-runner`, and Gradle cache priming via `gradle/actions/setup-gradle` while keeping matrix jobs read-only.
