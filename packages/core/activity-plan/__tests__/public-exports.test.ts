import { decodedActivityArtifactSchema } from "@repo/core/activity-artifacts";
import * as activityPlanExports from "@repo/core/activity-plan";
import {
  type ActivityPlanAuthoritativeMetrics,
  activityPlanAuthoritativeMetricsSchema,
  activityPlanStructureSchemaV3,
  compileActivityPlanV3,
  type compileValidatedActivityPlanV3,
  getAuthoritativeActivityPlanMetrics,
} from "@repo/core/activity-plan";
import { completedActivitySegmentSetSchemaV1 } from "@repo/core/activity-segments";
import { activityTargetSchema } from "@repo/core/targets";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("modern activity contract exports", () => {
  it("exposes the modern schemas and compiler from supported subpaths", () => {
    expect(activityPlanStructureSchemaV3).toBeDefined();
    expect(activityPlanAuthoritativeMetricsSchema).toBeDefined();
    expect(compileActivityPlanV3).toBeTypeOf("function");
    expect(getAuthoritativeActivityPlanMetrics).toBeTypeOf("function");
    expect(decodedActivityArtifactSchema).toBeDefined();
    expect(completedActivitySegmentSetSchemaV1).toBeDefined();
    expect(activityTargetSchema).toBeDefined();
    expect(Object.keys(activityPlanExports).some((name) => name.includes("V2"))).toBe(false);
    expect(activityPlanExports).not.toHaveProperty("convertV2FixtureToV3");
  });

  it("brands the input accepted by the validated compiler entry", () => {
    type ValidatedCompilerInput = Parameters<typeof compileValidatedActivityPlanV3>[0];
    expectTypeOf<{ version: 3; segments: [] }>().not.toMatchTypeOf<ValidatedCompilerInput>();
  });

  it("exports the authoritative metric contract from the supported subpath", () => {
    expectTypeOf<{
      estimated_duration: null;
      estimated_tss: null;
      intensity_factor: null;
      estimated_distance: null;
      provenance: {
        estimated_duration: null;
        estimated_tss: null;
        intensity_factor: null;
        estimated_distance: null;
      };
    }>().toMatchTypeOf<ActivityPlanAuthoritativeMetrics>();
  });
});
