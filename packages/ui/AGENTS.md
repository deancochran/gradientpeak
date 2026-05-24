# UI Package Guide

Use this file when working in `packages/ui`.

## Stack

- React 19.
- React Native.
- Radix UI.
- React Native Primitives.
- NativeWind.
- React Hook Form.
- CVA.

## Scope

- Shared web and native UI primitives.
- Shared form building blocks and selectors.
- Shared component-level tests and fixtures.

## Rules

- Treat `package.json` `exports` as the canonical public API and keep subpath exports explicit and stable across web and native entrypoints.
- Prefer adding reusable primitives here instead of duplicating app-local UI.
- Preserve stable package entrypoints under `src/components/*` and `src/index.ts`.
- Keep app-owned preview entrypoints in the apps, not in this package.
- Respect generated and synced asset boundaries.
- Keep shared primitives thin over Radix UI and React Native Primitives so accessibility and composition semantics stay intact.

## Conventions

- Prefer NativeWind `className` composition, and use `cssInterop` or prop remapping only when a custom or third-party native component cannot consume expected style props directly.
- Keep shared form helpers thin around `FormProvider`, `useFormContext`, `Controller`, and `useController`.
- Supply form `defaultValues` from the root, avoid nested form providers, and do not double-register controlled inputs.
- Use CVA for stable variant APIs instead of scattering ad hoc class branching across components.
- Use React `useId` for accessibility relationships such as label, description, and error IDs.
- Do not hand-edit synced registry files or generated theme outputs when a package workflow should be used instead.
- Follow the documented `sync:shadcn-theme`, `generate:theme`, and add-component workflows when relevant.

## Avoid

- App-specific feature composition masquerading as a shared primitive.
- Breaking cross-platform component contracts without updating both surfaces and tests.

## References

- https://nodejs.org/api/packages.html#conditional-exports
- https://nodejs.org/api/packages.html#subpath-exports
- https://react.dev/reference/react/useId
- https://react.dev/reference/react/forwardRef
- https://www.radix-ui.com/primitives/docs/guides/composition
- https://rnprimitives.com/
- https://www.nativewind.dev/docs/guides/custom-components
- https://www.nativewind.dev/docs/api/css-interop
- https://react-hook-form.com/docs/formprovider
- https://react-hook-form.com/docs/usecontroller/controller
- https://cva.style/docs/getting-started/variants
