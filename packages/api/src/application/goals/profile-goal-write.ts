import {
  canonicalGoalActivityCategorySchema,
  canonicalGoalObjectiveSchema,
  dateOnlySchema,
  profileGoalCreateSchema,
} from "@repo/core";
import { z } from "zod";

/** Canonical goal write data before server-owned identity and ownership are attached. */
export const profileGoalWriteDataSchema = z
  .object({
    target_date: dateOnlySchema,
    title: z.string().trim().min(1).max(100),
    priority: z.number().int().min(0).max(10),
    activity_category: canonicalGoalActivityCategorySchema,
    target_payload: canonicalGoalObjectiveSchema,
  })
  .strict();

export function parseOwnedProfileGoalWrite(input: {
  profileId: string;
  data: z.infer<typeof profileGoalWriteDataSchema>;
}) {
  return profileGoalCreateSchema.parse({
    profile_id: input.profileId,
    ...input.data,
  });
}
