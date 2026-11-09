import {
  activityPlanPrescriptionQuantificationBundleSchema,
  activityQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationEvidenceIdentity,
} from "@repo/core/activity-quantification";
import { describe, expect, it } from "vitest";

describe("activity quantification package export", () => {
  it("resolves the official external subpath and exposes its public contract", () => {
    expect(activityQuantificationSchema).toBeDefined();
    expect(activityPlanPrescriptionQuantificationBundleSchema).toBeDefined();
    expect(createActivityPlanPrescriptionQuantificationBundle).toBeTypeOf("function");
    expect(createActivityQuantificationEvidenceIdentity).toBeTypeOf("function");
  });
});
