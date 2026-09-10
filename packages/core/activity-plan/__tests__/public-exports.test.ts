import { decodedActivityArtifactSchema } from "@repo/core/activity-artifacts";
import * as activityPlanExports from "@repo/core/activity-plan";
import {
  activityPlanDocumentSchema,
  activityPlanStructureSchema,
  compileActivityPlan,
  type compileValidatedActivityPlan,
  getCanonicalActivityPlanDocumentHashInput,
  initializeActivityPlanDocument,
  resolveActivityPlanVariant,
} from "@repo/core/activity-plan";
import { activityPrescriptionQuantificationBundleSchema } from "@repo/core/activity-quantification";
import { completedActivitySegmentSetSchema } from "@repo/core/activity-segments";
import {
  activityPlanDurationEstimateSchema,
  estimateActivityPlanDuration,
} from "@repo/core/duration";
import { activityTargetSchema } from "@repo/core/targets";
import { describe, expect, expectTypeOf, it } from "vitest";

describe("modern activity contract exports", () => {
  it("exposes the modern schemas and compiler from supported subpaths", () => {
    expect(activityPlanStructureSchema).toBeDefined();
    expect(activityPlanDocumentSchema).toBeDefined();
    expect(compileActivityPlan).toBeTypeOf("function");
    expect(initializeActivityPlanDocument).toBeTypeOf("function");
    expect(resolveActivityPlanVariant).toBeTypeOf("function");
    expect(getCanonicalActivityPlanDocumentHashInput).toBeTypeOf("function");
    expect(activityPrescriptionQuantificationBundleSchema).toBeDefined();
    expect(activityPlanDurationEstimateSchema).toBeDefined();
    expect(estimateActivityPlanDuration).toBeTypeOf("function");
    expect(decodedActivityArtifactSchema).toBeDefined();
    expect(completedActivitySegmentSetSchema).toBeDefined();
    expect(activityTargetSchema).toBeDefined();
    expect(Object.keys(activityPlanExports).some((name) => name.includes("V2"))).toBe(false);
    expect(activityPlanExports).not.toHaveProperty("convertLegacyFixture");
    expect(activityPlanExports).not.toHaveProperty("activityPlanAuthoritativeMetricsSchema");
    expect(activityPlanExports).not.toHaveProperty("getAuthoritativeActivityPlanMetrics");
  });

  it("brands the input accepted by the validated compiler entry", () => {
    type ValidatedCompilerInput = Parameters<typeof compileValidatedActivityPlan>[0];
    expectTypeOf<{ version: 3; segments: [] }>().not.toMatchTypeOf<ValidatedCompilerInput>();
  });
});
