# Mobile Standards Reference

Lazy-load this reference when implementing, reviewing, or refactoring `apps/mobile` work. It captures repo-specific standards and policies without making them always-on context.

## When To Use

- New screens and feature modules.
- Mobile refactors.
- Architecture audits.
- PR review of state, form, routing, or boundary decisions.

## File And Module Layout

- Keep `apps/mobile/app/**` route-focused.
- Move durable screen logic into feature modules outside the route tree.
- Prefer feature-local folders for `screens`, `hooks`, `components`, `forms`, `selectors`, and small helpers.
- Keep `apps/mobile/lib/**` for infrastructure such as providers, auth adapters, API setup, device services, and small UI stores.

## Routing Rules

1. Use Expo Router only for navigation, layout grouping, auth grouping, and route-param entry.
2. Parse params at the route boundary, then pass typed values into a feature screen or controller hook.
3. Do not let route files become the long-term home for queries, mutations, alert choreography, or large form logic.
4. When a route grows beyond simple composition, split it before adding more behavior.

## Data Boundaries

1. Use `@repo/api` for server-backed operations.
2. Use `@repo/core` for shared schemas, validation, mapping, and domain rules.
3. Do not import Drizzle, database tables, or server-only persistence helpers into `apps/mobile`.
4. Avoid leaking DB-shaped records into screen props or local component state.

## State Ownership Rules

1. Use React Query for server state, background refresh, cache, and mutation lifecycle.
2. Use React Hook Form for editable form state.
3. Use Zustand only for small client or UI state such as view preferences, temporary handoff state, or narrow local wizard state.
4. Do not mirror server state into Zustand unless there is a clear UI-only need.
5. Avoid giant `useState` draft objects for non-trivial forms and editors.

## Form Rules

1. Default to React Hook Form plus Zod for multi-field or persisted flows.
2. Prefer `useZodForm` and `useZodFormSubmit` from `@repo/ui/hooks`.
3. Prefer shared wrappers from `@repo/ui/components/form` before writing raw `Controller` blocks.
4. Keep shared app-facing schemas in `@repo/core` when the same contract matters across screens or layers.
5. Standardize error mapping through shared helpers instead of ad hoc per-screen logic.
6. Keep navigation side effects at the screen orchestration layer, not inside field widgets.

## UI And Composition Rules

1. Reuse shared `@repo/ui` primitives before creating app-local component variants.
2. Style every `Text` explicitly.
3. Prefer semantic tokens such as `text-foreground` and `bg-background`.
4. Reuse shared providers and service instances rather than creating parallel stateful clients.
5. Prefer small screen components fed by feature hooks over monolithic route components.

## Testing Expectations

- Add targeted regression coverage when standardizing a large route or form.
- Test behavior at the feature seam: param parsing, form submit behavior, mutation success/error handling, and navigation outcomes.
- Prefer focused package or screen-level checks before broader repo validation.

## Smells That Trigger Refactor

- A route file owns most of a feature's UI, query logic, mutation logic, and local state.
- A screen mixes server state, form state, and UI state with no clear ownership boundary.
- A mobile screen duplicates schema or validation rules that belong in `@repo/core`.
- A feature bypasses shared form wrappers or shared submit/error helpers without a clear reason.
- Mobile code imports database or server-only implementation details.

## Review Checklist

- [ ] Route file is thin and mostly entry/composition.
- [ ] Query and mutation orchestration live in feature hooks or controllers.
- [ ] Form state uses RHF + Zod when the flow is non-trivial.
- [ ] Shared schemas and UI wrappers are reused.
- [ ] React Query, RHF, and Zustand each own the right state slice.
- [ ] No DB or Drizzle implementation leaks into mobile.

## Related References

- `.opencode/instructions/mobile-architecture-adr.md`
- `.opencode/skills/mobile-architecture/SKILL.md`
- `.opencode/skills/mobile-frontend/SKILL.md`
