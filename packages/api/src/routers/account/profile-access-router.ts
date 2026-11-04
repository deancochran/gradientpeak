import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../../trpc";
import { revokeProfileAccess } from "./profile-access";

const relationshipSchema = z
  .object({ coach_id: z.string().uuid(), athlete_id: z.string().uuid() })
  .strict();

export const profileAccessRouter = createTRPCRouter({
  revoke: protectedProcedure.input(relationshipSchema).mutation(async ({ ctx, input }) => ({
    revoked: await revokeProfileAccess({
      ctx,
      coachId: input.coach_id,
      athleteId: input.athlete_id,
    }),
  })),
});
