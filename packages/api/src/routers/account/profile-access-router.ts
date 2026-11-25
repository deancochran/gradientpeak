import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "../../trpc";

const relationshipSchema = z
  .object({ coach_id: z.string().uuid(), athlete_id: z.string().uuid() })
  .strict();

export const profileAccessRouter = createTRPCRouter({
  // Preserve the authenticated route for old callers, but never reinterpret a
  // pair of profile IDs as authority over staff roles or athlete consent.
  // Standard auth, epoch and rate-limit middleware still applies, including
  // production rate-limit bookkeeping; retirement performs no domain writes.
  revoke: protectedProcedure.input(relationshipSchema).mutation((): { revoked: boolean } => {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "This legacy operation is retired. Use organizations.lifecycle.withdrawConsent to stop sharing, or organizations.lifecycle.endEngagement to end an authorized coaching relationship.",
    });
  }),
});
