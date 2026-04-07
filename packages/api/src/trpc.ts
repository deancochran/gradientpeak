// packages/api/src/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import z, { ZodError } from "zod";
import type { Context } from "./context";
import { isTrainingPlanCommitErrorCause } from "./lib/errors/trainingPlanCommitErrors";

const t = initTRPC.context<Context>().create({
  sse: {
    maxDurationMs: 5_000,
    ping: { enabled: false },
  },
  transformer: superjson,
  isServer: true,
  allowOutsideOfServer: false,
  errorFormatter: ({ shape, error }) => ({
    ...shape,
    data: {
      ...shape.data,
      zodError:
        error.cause instanceof ZodError
          ? z.flattenError(error.cause as ZodError<Record<string, unknown>>)
          : null,
      cause: isTrainingPlanCommitErrorCause(error.cause) ? error.cause : null,
    },
  }),
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});
