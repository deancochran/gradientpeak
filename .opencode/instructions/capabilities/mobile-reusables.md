# Mobile Reusables Capability

Load when touching shared React Native primitives, NativeWind-heavy UI, dialogs, sheets, or styling contracts.

Focus:
- Preserve shared component contracts before app-local customization.
- Style `Text` intentionally; React Native text does not inherit web-like defaults.
- Prefer semantic tokens over hard-coded colors when the design system already covers the case.

Important paths:
- `packages/ui/`
- `apps/mobile/components/`
- `.opencode/instructions/mobile-standards-reference.md`

Verify with:
- `pnpm --dir apps/mobile check-types`
- `pnpm --filter @repo/ui test`

References:
- `https://www.nativewind.dev/`
- `https://reactnative.dev/docs/text`
- `https://rnr-docs.vercel.app/`
