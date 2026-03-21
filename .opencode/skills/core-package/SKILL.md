---
name: core-package
description: Pure logic, schemas, and database-independent patterns for @repo/core
---

# Core Package Skill

## When to Use

- Adding calculations, helpers, or schemas in `packages/core`
- Moving duplicated business logic out of apps or routers
- Defining shared validation contracts with Zod

## Scope

`@repo/core` is the shared domain layer.

- Pure logic belongs here.
- Database access, UI code, and framework wiring do not.

## Rules

1. Keep functions deterministic and side-effect free.
2. Do not import database, Supabase, React, or app-layer code.
3. Prefer synchronous utilities unless there is a strong existing reason not to.
4. Define schemas first, then infer types from them.
5. Use parameter objects for non-trivial function signatures.
6. Add focused tests for every public behavior change.

## Default Patterns

```ts
export const trainingTargetSchema = z.object({
  type: z.enum(["pace", "power", "heart_rate"]),
  value: z.number().positive(),
});

export type TrainingTarget = z.infer<typeof trainingTargetSchema>;

export function resolveTrainingTarget(input: {
  target: TrainingTarget;
  ftp?: number;
}): string {
  if (input.target.type === "power" && !input.ftp) return "unavailable";
  return `${input.target.value}`;
}
```

## Repo-Specific Guidance

- Shared calculations and schemas should be imported by both app and tRPC layers.
- If logic depends on database records, transform the data before it reaches `@repo/core`.
- Public APIs benefit from concise JSDoc when behavior is not obvious.

## Avoid

- `@supabase/*`, `drizzle-orm`, `react`, or `react-native` imports
- Hidden mutation, caching, or I/O side effects
- Re-encoding app-specific presentation decisions as core rules

## Quick Checklist

- [ ] pure and deterministic
- [ ] schema-first typing where relevant
- [ ] no app/database imports
- [ ] focused tests added
