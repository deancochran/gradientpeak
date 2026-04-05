# Mobile Recorder Capability

Load when touching recording flows, live metrics, sensor state, or recorder lifecycle behavior.

Focus:
- Prefer existing recorder hooks and service seams before adding abstractions.
- Keep recording lifecycle scoped to recording surfaces, not app-global state.
- Be careful with high-frequency UI updates and derived state churn.

Important paths:
- `apps/mobile/lib/services/ActivityRecorder/`
- `apps/mobile/lib/hooks/`
- `apps/mobile/app/(internal)/record/`
- `apps/mobile/components/`

Verify with:
- `pnpm --dir apps/mobile check-types`
- `pnpm --dir apps/mobile test`

References:
- `.opencode/instructions/mobile-architecture-adr.md`
- `https://docs.expo.dev/`
- `https://reactnative.dev/docs/performance`
