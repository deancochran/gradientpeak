import { z } from "zod";

/** A small discriminator for standards at the ingestion boundary, not a vendor schema. */
export const activityArtifactSourceFormatSchema = z.discriminatedUnion("standard", [
  z.object({ standard: z.literal("fit"), format: z.literal("fit") }).strict(),
  z.object({ standard: z.literal("tcx"), format: z.literal("tcx") }).strict(),
  z.object({ standard: z.literal("gpx"), format: z.literal("gpx") }).strict(),
  z
    .object({
      standard: z.literal("provider"),
      format: z
        .string()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9][a-z0-9._-]*$/),
    })
    .strict(),
]);

export type ActivityArtifactSourceFormat = z.infer<typeof activityArtifactSourceFormatSchema>;
