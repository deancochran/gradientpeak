import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../activity-plan";
import {
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
} from "../activity-quantification";
import { createUnavailableAthletePerformanceTargetFacts } from "../performance-model";
import { CORE_STABILITY } from "../samples";
import { estimateActivityPlanForTrainingContext } from "./activity-plan-planning-estimate";
import { getPlannedEstimate } from "./planned-estimate";

const asOf = "2026-08-18T12:00:00.000Z";
const id = (value: number) => `60000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const recoveryFixture = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: id(101),
      name: "Warm-up",
      duration: { type: "time", seconds: 300 },
      targets: [{ type: "%FTP", intensity: 45 }],
    },
    {
      type: "step",
      id: id(102),
      name: "Recovery",
      duration: { type: "time", seconds: 2100 },
      targets: [{ type: "%FTP", intensity: 45 }],
    },
    {
      type: "step",
      id: id(103),
      name: "Cool-down",
      duration: { type: "time", seconds: 300 },
      targets: [{ type: "%FTP", intensity: 45 }],
    },
  ],
});
const distanceFixture = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "swim",
  items: [
    {
      type: "step",
      id: id(104),
      name: "Distance",
      duration: { type: "distance", meters: 2000 },
      targets: [{ type: "RPE", intensity: 4 }],
    },
  ],
});
function estimate(steps: Array<Record<string, unknown>>) {
  const structure = activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "bike",
    items: steps,
  });
  return estimateActivityPlanForTrainingContext({
    structure,
    performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "viewer-1"),
    asOf,
  });
}
describe("getPlannedEstimate", () => {
  it("preserves prescription targets while omitting the retired plan projection field", () => {
    const result = getPlannedEstimate(
      estimate([
        {
          type: "step",
          id: id(3),
          name: "Timed",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "RPE", intensity: 5 }],
        },
        {
          type: "step",
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
    expect(result.prescribedIntensity).toEqual({
      status: "known",
      value: [
        {
          metric: "perceived_exertion",
          unit: "rpe_0_10",
          magnitude: { kind: "point", value: 5 },
        },
        {
          metric: "perceived_exertion",
          unit: "rpe_0_10",
          magnitude: { kind: "point", value: 6 },
        },
      ],
    });
    expect(
      estimate([
        {
          type: "step",
          id: id(3),
          name: "Timed",
          duration: { type: "time", seconds: 600 },
          targets: [{ type: "RPE", intensity: 5 }],
        },
        {
          type: "step",
          id: id(4),
          name: "Open",
          duration: { type: "untilFinished" },
          targets: [{ type: "RPE", intensity: 6 }],
        },
      ]).planProjection,
    ).not.toHaveProperty("prescribedIntensity");
  });
  it("retains unanchored relative plan intent separately from physical personalization", () => {
    const result = getPlannedEstimate(
      estimate([
        {
          type: "step",
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
  it("uses the local recovery fixture's complete low-intensity prescription", () => {
    const planning = estimateActivityPlanForTrainingContext({
      structure: recoveryFixture,
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "viewer-1"),
      asOf,
    });
    const commonLoad = planning.prescriptionQuantification.summary.commonLoad;
    const result = getPlannedEstimate(planning.prescriptionQuantification);
    expect(result.durationSeconds).toEqual({ status: "known", value: 2700 });
    expect(commonLoad).toMatchObject({
      status: "complete",
      contributingDurationSeconds: 2700,
      knownDurationSeconds: 2700,
      knownDurationCoverage: 1,
      load: expect.any(Number),
      intensity: expect.any(Number),
    });
    expect(result.load).toMatchObject({ status: "estimated", basis: "plan_intent" });
    expect(result.normalizedIntensity).toEqual({
      status: "estimated",
      value: 0.45,
      basis: "plan_intent",
    });
  });
  it.each([
    {
      name: CORE_STABILITY.name,
      structure: CORE_STABILITY.structure,
      expected: {
        distanceMeters: { status: "unavailable", value: null },
        durationSeconds: { status: "known", value: 37 * 60 },
        distanceProjection: { status: "unavailable", scope: { kind: "full_plan" } },
      },
    },
    {
      name: "distance fixture",
      structure: distanceFixture,
      expected: {
        distanceMeters: { status: "known", value: 2000 },
        durationSeconds: { status: "unavailable", value: null },
        distanceProjection: {
          status: "complete",
          scope: { kind: "full_plan", completionPolicy: "distance" },
        },
      },
    },
  ])("keeps canonical estimates and distance projection for $name", ({ structure, expected }) => {
    const planning = estimateActivityPlanForTrainingContext({
      structure,
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "viewer-1"),
      asOf,
    });
    const result = getPlannedEstimate(planning.prescriptionQuantification);
    expect(result.distanceMeters).toMatchObject(expected.distanceMeters);
    expect(result.durationSeconds).toMatchObject(expected.durationSeconds);
    expect(planning.planProjection?.distance).toMatchObject(expected.distanceProjection);
    expect(planning.planProjection).not.toHaveProperty("prescribedIntensity");
    expect(result.load).toMatchObject({ status: "unavailable", value: null });
    expect(result.normalizedIntensity).toMatchObject({ status: "unavailable", value: null });
  });
  it("duration-weights compatible timed and repetition-based strength RPE", () => {
    const structure = activityPlanStructureSchema.parse({
      version: 5,
      activity_category: "strength",
      items: [
        {
          type: "step",
          id: id(12),
          name: "Timed hold",
          duration: { type: "time", seconds: 60 },
          targets: [{ type: "RPE", intensity: 2 }],
        },
        {
          type: "step",
          id: id(13),
          name: "Repetitions",
          duration: { type: "repetitions", count: 6 },
          targets: [{ type: "RPE", intensity: 8 }],
        },
      ],
    });
    const planning = estimateActivityPlanForTrainingContext({
      structure,
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "viewer-1"),
      asOf,
    });
    expect(getPlannedEstimate(planning.prescriptionQuantification)).toMatchObject({
      durationSeconds: { status: "estimated", value: 120 },
    });
    expect(planning.planProjection).not.toHaveProperty("prescribedIntensity");
  });
  it("preserves a real calculated zero as a value", () => {
    const original = estimate([
      {
        type: "step",
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
