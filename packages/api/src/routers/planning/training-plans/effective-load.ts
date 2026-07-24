import {
  effectivePlanLoadDtoSchema,
  getEffectivePlanLoad,
  getEffectivePlanLoadInputSchema,
} from "../../../application/training-plan";
import { getRequiredDb } from "../../../db";
import { createEventReadRepository } from "../../../infrastructure/repositories";
import { createTRPCRouter, protectedProcedure } from "../../../trpc";

/** Transport boundary for the server-owned effective Plan Load use case. */
export const trainingPlansEffectiveLoadProcedures = {
  getEffectiveLoad: protectedProcedure
    .input(getEffectivePlanLoadInputSchema)
    .output(effectivePlanLoadDtoSchema)
    .query(({ ctx, input }) => {
      const db = getRequiredDb(ctx);
      return getEffectivePlanLoad({
        db,
        profileId: ctx.session.user.id,
        repository: createEventReadRepository(db),
        request: input,
      });
    }),
};

export const trainingPlansEffectiveLoadRouter = createTRPCRouter(
  trainingPlansEffectiveLoadProcedures,
);
