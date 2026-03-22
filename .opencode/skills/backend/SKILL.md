---
name: backend
description: tRPC router patterns, Supabase integration, API design, and backend error handling
---

# Backend Skill

## When to Use

- Adding or changing tRPC routers in `packages/trpc`
- Working with authenticated Supabase reads or mutations
- Defining backend input/output contracts
- Reviewing server-side ownership, auth, and error handling

## Scope

This skill is for server-side orchestration.

- Use `@repo/core` for shared business logic and calculations.
- Use this skill for procedures, database access, auth checks, and API contracts.

## Rules

1. Validate every procedure input with Zod.
2. Use protected procedures for user-scoped data.
3. Verify ownership before mutations.
4. Convert backend failures into explicit `TRPCError`s.
5. Keep database access in the backend layer, not in `@repo/core`.
6. Keep pagination, filtering, and sort behavior explicit.

## Default Procedure Shape

```ts
export const activitiesRouter = createTRPCRouter({
  update: protectedProcedure
    .input(updateActivitySchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.supabase
        .from("activities")
        .select("id, profile_id")
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .single();

      if (!existing.data) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activity not found" });
      }

      const result = await ctx.supabase
        .from("activities")
        .update({ name: input.name })
        .eq("id", input.id)
        .eq("profile_id", ctx.session.user.id)
        .select()
        .single();

      if (result.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: result.error.message,
        });
      }

      return result.data;
    }),
});
```

## Repo-Specific Guidance

- Routers live in `packages/trpc/src/routers/`.
- Shared schemas and calculations belong in `@repo/core`.
- Avoid duplicating business rules in routers, web, or mobile.
- When schema evolution is required, prefer the established Supabase migration workflow and regenerate types after changes.

## Avoid

- Silent fallback on database errors
- Unscoped queries against user-owned data
- Duplicating calculation logic already present in `@repo/core`
- Mixing form-layer concerns into router design

## Quick Checklist

- [ ] input validated
- [ ] auth/ownership enforced
- [ ] errors mapped explicitly
- [ ] core logic reused
- [ ] pagination/filtering explicit where relevant
