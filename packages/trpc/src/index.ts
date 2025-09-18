// packages/trpc/src/index.ts
import { initTRPC, TRPCError } from "@trpc/server";
import { type Context, createTRPCContext } from "./context";
import { appRouter } from "./routers";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof Error && error.cause.name === "ZodError"
            ? error.cause
            : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const {
    data: { user },
    error,
  } = await ctx.supabase.auth.getUser();

  if (error || !user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to access this resource",
    });
  }

  return next({
    ctx: {
      ...ctx,
      user,
    },
  });
});

export type { AppRouter } from "./routers";
export { appRouter, createTRPCContext };
