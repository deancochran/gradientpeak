import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../activity-plan";
import {
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
} from "../activity-quantification";
import { createUnavailableAthletePerformanceTargetFacts } from "../performance-model";
import { estimateActivityPlanForTrainingContext } from "./activity-plan-planning-estimate";
import { getPlannedEstimate } from "./planned-estimate";

const asOf = "2026-08-18T12:00:00.000Z";
const id = (value: number) => `60000000-0000-4000-8000-${String(value).padStart(12, "0")}`;

function estimate(steps: Array<Record<string, unknown>>) {
  const structure = activityPlanStructureSchema.parse({
    version: 3,
    activity_category: "bike",
    segments: [
      {
        role: "activity",
        id: id(1),
        name: "Ride",
        intervals: [{ id: id(2), name: "Work", repetitions: 1, steps }],
      },
    ],
  });
  return estimateActivityPlanForTrainingContext({
    structure,
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "viewer-1"),
    asOf,
  });
}

describe("getPlannedEstimate", () => {
  it("keeps independent known, partial, and unavailable statuses without zero substitution", () => {
    const result = getPlannedEstimate(
      estimate([
        {
          id: id(3),
          name: "Timed",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "RPE", intensity: 5 }],
        },
        {
          id: id(4),
          name: "Open",
          duration: { type: "untilFinished" },
          targets: [{ type: "RPE", intensity: 6 }],
        },
      ]).prescriptionQuantification,
    );

    expect(result.durationSeconds).toEqual({
      status: "partial",
      value: 600,
      reason: "incomplete_members",
    });
    expect(result.distanceMeters).toMatchObject({ status: "unavailable", value: null });
    expect(result.normalizedIntensity).toMatchObject({ status: "unavailable", value: null });
    expect(result.load).toMatchObject({ status: "unavailable", value: null });
    expect(result.prescribedIntensity).toMatchObject({ status: "known" });
  });

  it("retains unanchored relative plan intent separately from physical personalization", () => {
    const result = getPlannedEstimate(
      estimate([
        {
          id: id(3),
          name: "Tempo",
          duration: { type: "time", seconds: 3600 },
          targets: [{ type: "%FTP", intensity: 80 }],
        },
      ]).prescriptionQuantification,
    );

    expect(result.durationSeconds).toEqual({ status: "known", value: 3600 });
    expect(result.normalizedIntensity).toEqual({
      status: "estimated",
      value: 0.8,
      basis: "plan_intent",
    });
    expect(result.load).toMatchObject({
      status: "estimated",
      value: expect.closeTo(64),
      basis: "plan_intent",
    });
  });

  it("preserves a real calculated zero as a value", () => {
    const original = estimate([
      {
        id: id(3),
        name: "Tempo",
        duration: { type: "time", seconds: 3600 },
        targets: [{ type: "%FTP", intensity: 80 }],
      },
    ]).prescriptionQuantification;
    const member = original.members[0];
    if (!member || member.commonLoad.status !== "available") {
      throw new Error("Expected an available plan-intent member");
    }
    const commonLoad = { ...member.commonLoad, intensity: 0, load: 0 };
    const zeroMember = activityPrescriptionQuantificationSchema.parse({
      ...member,
      commonLoad,
      calculationIdentity: createActivityQuantificationCalculationIdentity({
        model: commonLoad.model,
        version: commonLoad.version,
        computedAt: commonLoad.computedAsOf,
        calibrationEvidenceFingerprint: commonLoad.evidenceFingerprint,
      }),
    });
    const result = getPlannedEstimate(
      createActivityPlanPrescriptionQuantificationBundle({ members: [zeroMember] }),
    );

    expect(result.normalizedIntensity).toEqual({
      status: "estimated",
      value: 0,
      basis: "plan_intent",
    });
    expect(result.load).toEqual({ status: "estimated", value: 0, basis: "plan_intent" });
  });
});
