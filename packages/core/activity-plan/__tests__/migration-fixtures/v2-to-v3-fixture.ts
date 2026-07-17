import { activityPlanStructureSchemaV2 } from "../../../schemas/activity_plan_v2";
import type { CanonicalSport } from "../../../schemas/sport";
import { activityPlanStructureSchemaV3 } from "../../v3-schema";

/** Test-only proof for the later migration lane. This is intentionally outside public exports. */
export function convertV2FixtureToV3(input: {
  category: CanonicalSport;
  segmentId: string;
  structure: unknown;
}) {
  const structure = activityPlanStructureSchemaV2.parse(input.structure);
  return activityPlanStructureSchemaV3.parse({
    version: 3,
    segments: [
      {
        id: input.segmentId,
        role: "activity",
        category: input.category,
        name: "Migrated activity",
        intervals: structure.intervals,
      },
    ],
  });
}
