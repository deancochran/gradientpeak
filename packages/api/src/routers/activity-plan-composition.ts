import type { CanonicalSport } from "@repo/core";
import {
  activityPlanStructureSchemaV3,
  compileValidatedActivityPlanV3,
} from "@repo/core/activity-plan";
import { and, or, type SQL, type SQLWrapper, sql } from "drizzle-orm";
import { z } from "zod";

export const activityPlanCompositionModeSchema = z.enum([
  "single_only",
  "include_multisport",
  "multisport_only",
]);

export type ActivityPlanCompositionMode = z.infer<typeof activityPlanCompositionModeSchema>;

export function describeActivityPlanComposition(structure: unknown) {
  const parsed = activityPlanStructureSchemaV3.parse(structure);
  const compiled = compileValidatedActivityPlanV3(parsed);
  const categoryComposition = parsed.segments.flatMap((segment) =>
    segment.role === "activity" ? [segment.category] : [],
  );
  const activitySegmentCount = categoryComposition.length;

  return {
    activity_kind: activitySegmentCount === 1 ? ("single" as const) : ("multisport" as const),
    activity_segment_count: activitySegmentCount,
    categories: compiled.categories,
    category_composition: categoryComposition,
    primary_category: compiled.primaryCategory,
  };
}

export function buildActivityPlanCompositionCondition(input: {
  categories: readonly CanonicalSport[];
  mode: ActivityPlanCompositionMode;
  structure: SQLWrapper;
}): SQL | undefined {
  const categoryCondition =
    input.categories.length > 0
      ? or(
          ...input.categories.map(
            (category) =>
              sql`${input.structure} @> ${JSON.stringify({
                segments: [{ role: "activity", category }],
              })}::jsonb`,
          ),
        )
      : undefined;
  const modeCondition =
    input.mode === "single_only"
      ? sql`jsonb_array_length(jsonb_path_query_array(${input.structure}, '$.segments[*] ? (@.role == "activity")')) = 1`
      : input.mode === "multisport_only"
        ? sql`jsonb_array_length(jsonb_path_query_array(${input.structure}, '$.segments[*] ? (@.role == "activity")')) > 1`
        : undefined;

  return and(modeCondition, categoryCondition);
}
