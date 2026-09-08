import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../activity-plan";
import {
  activityPrescriptionQuantificationSchema,
  createActivityPlanPrescriptionQuantificationBundle,
  createActivityQuantificationCalculationIdentity,
} from "../activity-quantification";
import { createUnavailableAthletePerformanceTargetFacts } from "../performance-model";
import {
  CORE_STABILITY,
  EASY_SWIM,
  OPTION_1_FAVORITE_SWIM,
  SAMPLE_RECOVERY_WORKOUT,
} from "../samples";
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
  it("preserves prescription targets while omitting the retired plan projection field", () => {
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
      ]).planProjection,
    ).not.toHaveProperty("prescribedIntensity");
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

  it("withholds Active Recovery Ride load and normalized intensity when only 10 of 45 minutes are evidenced", () => {
    const planning = estimateActivityPlanForTrainingContext({
      structure: SAMPLE_RECOVERY_WORKOUT.structure,
      performanceTargets: createUnavailableAthletePerformanceTargetFacts(asOf, "viewer-1"),
      asOf,
    });
    const commonLoad = planning.prescriptionQuantification.summary.commonLoad;
    const result = getPlannedEstimate(planning.prescriptionQuantification);

    expect(result.durationSeconds).toEqual({ status: "known", value: 2_700 });
    expect(commonLoad).toMatchObject({
      status: "partial",
      contributingDurationSeconds: 600,
      knownDurationSeconds: 2_700,
      knownDurationCoverage: 600 / 2_700,
      load: expect.any(Number),
      intensity: expect.any(Number),
    });
    expect(result.load).toEqual({
      status: "partial",
      value: commonLoad.status === "partial" ? commonLoad.load : 0,
      reason: "incomplete_members",
      basis: "plan_intent",
    });
    expect(result.normalizedIntensity).toEqual({
      status: "partial",
      value: commonLoad.status === "partial" ? commonLoad.intensity : 0,
      reason: "incomplete_members",
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
      name: EASY_SWIM.name,
      structure: EASY_SWIM.structure,
      expected: {
        distanceMeters: { status: "known", value: 2_000 },
        durationSeconds: { status: "unavailable", value: null },
        distanceProjection: {
          status: "complete",
          scope: { kind: "full_plan", completionPolicy: "distance" },
        },
      },
    },
    {
      name: OPTION_1_FAVORITE_SWIM.name,
      structure: OPTION_1_FAVORITE_SWIM.structure,
      expected: {
        distanceMeters: { status: "partial", value: 4_400 },
        durationSeconds: { status: "partial", value: 180 },
        distanceProjection: {
          status: "partial",
          scope: { kind: "completion_lane", completionPolicy: "distance" },
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
    if (structure === OPTION_1_FAVORITE_SWIM.structure) {
      expect(result.load).toMatchObject({ status: "partial", value: expect.any(Number) });
      expect(result.normalizedIntensity).toMatchObject({
        status: "partial",
        value: expect.any(Number),
      });
    } else {
      expect(result.load).toMatchObject({ status: "unavailable", value: null });
      expect(result.normalizedIntensity).toMatchObject({ status: "unavailable", value: null });
    }
  });

  it("duration-weights compatible timed and repetition-based strength RPE", () => {
    const structure = activityPlanStructureSchema.parse({
      version: 3,
      activity_category: "strength",
      segments: [
        {
          role: "activity",
          id: id(10),
          name: "Strength",
          intervals: [
            {
              id: id(11),
              name: "Mixed completion",
              repetitions: 1,
              steps: [
                {
                  id: id(12),
                  name: "Timed hold",
                  duration: { type: "time", seconds: 60 },
                  targets: [{ type: "RPE", intensity: 2 }],
                },
                {
                  id: id(13),
                  name: "Repetitions",
                  duration: { type: "repetitions", count: 6 },
                  targets: [{ type: "RPE", intensity: 8 }],
                },
              ],
            },
          ],
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
