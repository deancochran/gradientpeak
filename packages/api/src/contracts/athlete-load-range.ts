import { z } from "zod";
import { athleteStateCacheTagsSchema } from "./cache-receipts";

const uuidSchema = z.string().uuid();

export const athleteRecalculationRepairRequestSchema = z.object({ profileId: uuidSchema }).strict();

export const athleteRecalculationRepairReceiptSchema = z
  .object({
    status: z.literal("accepted"),
    profileId: uuidSchema,
    cache_tags: athleteStateCacheTagsSchema,
  })
  .strict();
