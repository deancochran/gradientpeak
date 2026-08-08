import { describe, expect, it } from "vitest";
import { activityPlanStructureSchema } from "../activity-plan";
import {
  aggregatePrescriptions,
  prescribedActivityIntensitySchema,
} from "../activity-quantification";
import { getNormalizedIntensity } from "../load";
import {
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
} from "../performance-model";
import {
  type ActivityPlanPlanningEstimate,
  bindPrescriptionQuantificationToScheduledEvent,
  createUnavailableActivityPlanPlanningEstimate,
  estimateActivityPlanForTrainingContext,
  resolvePrescriptionSpeedMetersPerSecond,
} from "./activity-plan-planning-estimate";

const id = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const singleBike = activityPlanStructureSchema.parse({
  version: 3,
  activity_category: "bike",
  segments: [
    {
      role: "activity",
      id: id(1),
      name: "Bike",
      intervals: [
        {
          id: id(2),
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: id(3),
              name: "Steady",
              duration: { type: "time", seconds: 3600 },
              targets: [{ type: "%FTP", intensity: 80 }],
            },
          ],
        },
      ],
    },
  ],
});
const unavailableTargets = createUnavailableAthletePerformanceTargetFacts(
  "2026-06-01T00:00:00.000Z",
);
const availableTarget = (
  fact: typeof unavailableTargets.cycling.planningThresholdPower,
  value: number,
) => ({
  ...fact,
  status: "available" as const,
  value,
  calculationVersion: "activity-plan-planning-test-v1",
  sourceEvidenceIds: ["test-evidence"],
  evidenceTime: {
    observedFrom: "2026-05-30T00:00:00.000Z",
    observedThrough: "2026-05-30T00:00:00.000Z",
    computedAt: unavailableTargets.asOf,
  },
  confidence: "high" as const,
  expiresAt: "2026-08-30T00:00:00.000Z",
  reasons: [],
});
const performanceTargets = athletePerformanceTargetFactsSchema.parse({
  ...unavailableTargets,
  cycling: {
    planningThresholdPower: availableTarget(unavailableTargets.cycling.planningThresholdPower, 250),
  },
});
const runPerformanceTargets = athletePerformanceTargetFactsSchema.parse({
  ...performanceTargets,
  running: {
    planningThresholdPace: availableTarget(unavailableTargets.running.planningThresholdPace, 250),
  },
});

function onlyPrescription(estimate: ActivityPlanPlanningEstimate) {
  const member = estimate.prescriptionQuantification.members[0];
  if (!member || estimate.prescriptionQuantification.members.length !== 1) {
    throw new Error("Expected one prescription member");
  }
  return member;
}

function distanceRun(target: { type: "speed" | "RPE"; intensity: number }) {
  return activityPlanStructureSchema.parse({
    version: 3,
    activity_category: "run",
    segments: [
      {
        role: "activity",
        id: id(30),
        name: "Run",
        intervals: [
          {
            id: id(31),
            name: "Main",
            repetitions: 1,
            steps: [
              {
                id: id(32),
                name: "5K",
                duration: { type: "distance", meters: 5_000 },
                targets: [target],
              },
            ],
          },
        ],
      },
    ],
  });
}

describe("estimateActivityPlanForTrainingContext", () => {
  it("preserves the exact single-segment cycling calculation as a golden", () => {
    const estimate = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets,
      asOf: performanceTargets.asOf,
    });
    expect(estimate).toMatchObject({
      stage: "plan",
      prescriptionQuantification: {
        members: [
          {
            kind: "prescription",
            stage: "plan",
            subjectIdentity: {
              subjectType: "plan_occurrence",
              parentSubjectIdentity: { subjectType: "plan_preview" },
            },
          },
        ],
        summary: {
          summaryScope: "components",
          subjectIdentity: { subjectType: "plan_preview" },
          commonLoad: { status: "complete", intensity: 0.8 },
        },
      },
      durationEstimate: {
        valueSeconds: 3600,
        status: "exact",
        basis: "compiled_time",
        confidence: "high",
      },
      restSeconds: 0,
      categoryDoses: [
        {
          activity_category: "bike",
          commonLoad: { status: "complete", intensity: 0.8 },
          evidence: "common_load",
        },
      ],
    });
    const commonLoad = estimate.prescriptionQuantification.summary.commonLoad;
    if (commonLoad.status === "unavailable") throw new Error("Expected quantified Load");
    expect(commonLoad.load).toBeCloseTo(64);
  });

  it("keeps two scheduled events of one plan distinct without changing plan or calculation identity", () => {
    const first = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets,
      asOf: performanceTargets.asOf,
      stage: "scheduled",
      planId: "plan-1",
      scheduledEventId: "event-1",
    });
    const second = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets,
      asOf: performanceTargets.asOf,
      stage: "scheduled",
      planId: "plan-1",
      scheduledEventId: "event-2",
    });

    const firstPrescription = onlyPrescription(first);
    const secondPrescription = onlyPrescription(second);
    expect(firstPrescription.subjectIdentity).toMatchObject({
      subjectType: "plan_occurrence",
      parentSubjectIdentity: {
        subjectType: "scheduled_event",
        eventId: "event-1",
        planSubjectIdentity: { subjectType: "plan", planId: "plan-1" },
      },
    });
    expect(secondPrescription.subjectIdentity).toMatchObject({
      subjectType: "plan_occurrence",
      parentSubjectIdentity: {
        subjectType: "scheduled_event",
        eventId: "event-2",
        planSubjectIdentity: { subjectType: "plan", planId: "plan-1" },
      },
    });
    expect(firstPrescription.subjectIdentity.fingerprint).not.toBe(
      secondPrescription.subjectIdentity.fingerprint,
    );
    if (
      firstPrescription.subjectIdentity.subjectType !== "plan_occurrence" ||
      secondPrescription.subjectIdentity.subjectType !== "plan_occurrence" ||
      firstPrescription.subjectIdentity.parentSubjectIdentity.subjectType !== "scheduled_event" ||
      secondPrescription.subjectIdentity.parentSubjectIdentity.subjectType !== "scheduled_event"
    ) {
      throw new Error("Expected scheduled event subjects");
    }
    expect(firstPrescription.subjectIdentity.parentSubjectIdentity.planSubjectIdentity).toEqual(
      secondPrescription.subjectIdentity.parentSubjectIdentity.planSubjectIdentity,
    );
    expect(firstPrescription.evidenceIdentity).toEqual(secondPrescription.evidenceIdentity);
    expect(firstPrescription.calculationIdentity).toEqual(secondPrescription.calculationIdentity);
    expect(firstPrescription.commonLoad).toEqual(secondPrescription.commonLoad);
    const scheduledCollection = aggregatePrescriptions([firstPrescription, secondPrescription]);
    expect(scheduledCollection.commonLoad.totalActivityCount).toBe(2);
    expect(
      scheduledCollection.memberSubjectIdentities.flatMap((identity) =>
        identity.subjectType === "plan_occurrence" &&
        identity.parentSubjectIdentity.subjectType === "scheduled_event"
          ? [identity.parentSubjectIdentity.eventId]
          : [],
      ),
    ).toEqual(expect.arrayContaining(["event-1", "event-2"]));
  });

  it("binds a validated one-occurrence component bundle and rejects collection-shaped input", () => {
    const plan = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets,
      asOf: performanceTargets.asOf,
      planId: "plan-bind",
    });
    const bound = bindPrescriptionQuantificationToScheduledEvent({
      prescriptionQuantification: plan.prescriptionQuantification,
      eventId: "persisted-event-1",
    });

    expect(bound).toMatchObject({
      members: [
        {
          stage: "scheduled",
          subjectIdentity: {
            subjectType: "plan_occurrence",
            parentSubjectIdentity: {
              subjectType: "scheduled_event",
              eventId: "persisted-event-1",
              planSubjectIdentity: { planId: "plan-bind" },
            },
          },
        },
      ],
      summary: {
        summaryScope: "components",
        subjectIdentity: { subjectType: "scheduled_event", eventId: "persisted-event-1" },
      },
    });
    expect(bound.members[0]?.evidenceIdentity).toEqual(
      plan.prescriptionQuantification.members[0]?.evidenceIdentity,
    );
    expect(() =>
      bindPrescriptionQuantificationToScheduledEvent({
        prescriptionQuantification: {
          ...plan.prescriptionQuantification,
          summary: aggregatePrescriptions(plan.prescriptionQuantification.members),
        },
        eventId: "persisted-event-2",
      }),
    ).toThrow(/component bundle/i);
    expect(() =>
      bindPrescriptionQuantificationToScheduledEvent({
        prescriptionQuantification: plan.prescriptionQuantification,
        eventId: "   ",
      }),
    ).toThrow();
  });

  it("changes calculation identity on recomputation without changing the plan subject", () => {
    const first = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets,
      asOf: performanceTargets.asOf,
      planId: "stable-plan",
    });
    const recomputedTargets = {
      ...performanceTargets,
      asOf: "2026-06-02T00:00:00.000Z",
      cycling: {
        planningThresholdPower: {
          ...performanceTargets.cycling.planningThresholdPower,
          evidenceTime: {
            ...performanceTargets.cycling.planningThresholdPower.evidenceTime,
            computedAt: "2026-06-02T00:00:00.000Z",
          },
        },
      },
      running: {
        planningThresholdPace: {
          ...performanceTargets.running.planningThresholdPace,
          evidenceTime: {
            ...performanceTargets.running.planningThresholdPace.evidenceTime,
            computedAt: "2026-06-02T00:00:00.000Z",
          },
        },
      },
      swimming: {
        css: {
          ...performanceTargets.swimming.css,
          evidenceTime: {
            ...performanceTargets.swimming.css.evidenceTime,
            computedAt: "2026-06-02T00:00:00.000Z",
          },
        },
      },
    };
    const recomputed = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets: recomputedTargets,
      asOf: recomputedTargets.asOf,
      planId: "stable-plan",
    });
    const revisedTargets = athletePerformanceTargetFactsSchema.parse({
      ...performanceTargets,
      cycling: {
        planningThresholdPower: {
          ...performanceTargets.cycling.planningThresholdPower,
          value: 260,
          sourceEvidenceIds: ["test-evidence-2"],
        },
      },
    });
    const revised = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets: revisedTargets,
      asOf: revisedTargets.asOf,
      planId: "stable-plan",
    });
    const firstPrescription = onlyPrescription(first);
    const recomputedPrescription = onlyPrescription(recomputed);
    const revisedPrescription = onlyPrescription(revised);

    expect(recomputedPrescription.subjectIdentity).toEqual(firstPrescription.subjectIdentity);
    expect(recomputedPrescription.evidenceIdentity).toEqual(firstPrescription.evidenceIdentity);
    expect(recomputedPrescription.calculationIdentity.fingerprint).not.toBe(
      firstPrescription.calculationIdentity.fingerprint,
    );
    expect(recomputedPrescription.commonLoad.thresholdEvidence).toMatchObject({
      observedAt: "2026-05-30T00:00:00.000Z",
      validAt: "2026-06-02T00:00:00.000Z",
      sourceFingerprint: firstPrescription.commonLoad.thresholdEvidence?.sourceFingerprint,
    });
    expect(recomputedPrescription.commonLoad.evidenceFingerprint).toBe(
      firstPrescription.commonLoad.evidenceFingerprint,
    );
    expect(revisedPrescription.subjectIdentity).toEqual(firstPrescription.subjectIdentity);
    expect(revisedPrescription.evidenceIdentity).toEqual(firstPrescription.evidenceIdentity);
    expect(revisedPrescription.calculationIdentity.fingerprint).not.toBe(
      firstPrescription.calculationIdentity.fingerprint,
    );
    expect(recomputedPrescription.commonLoad.status).toBe(firstPrescription.commonLoad.status);
    expect(recomputedPrescription.intensity.prescribed).toEqual(
      firstPrescription.intensity.prescribed,
    );
  });

  it("uses authored absolute speed rather than threshold pace for distance duration", () => {
    const estimate = estimateActivityPlanForTrainingContext({
      structure: distanceRun({ type: "speed", intensity: 18 }),
      performanceTargets: runPerformanceTargets,
      asOf: runPerformanceTargets.asOf,
    });

    expect(estimate.durationEstimate).toEqual({
      valueSeconds: 1_000,
      status: "estimated",
      basis: "distance_and_pace",
      confidence: "medium",
    });
    expect(estimate.durationEstimate.valueSeconds).not.toBe(1_250);
    expect(onlyPrescription(estimate).distance).toMatchObject({
      status: "available",
      value: 5_000,
      evidenceRole: "prescribed",
    });
    expect(estimate.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "complete",
      intensity: 1.25,
    });
  });

  it("never treats threshold pace as the planned pace when no pace target is authored", () => {
    const estimate = estimateActivityPlanForTrainingContext({
      structure: distanceRun({ type: "RPE", intensity: 5 }),
      performanceTargets: runPerformanceTargets,
      asOf: runPerformanceTargets.asOf,
    });

    expect(estimate.durationEstimate).toEqual({
      valueSeconds: null,
      status: "unavailable",
      basis: null,
      confidence: null,
    });
    expect(onlyPrescription(estimate).duration.elapsed).toMatchObject({
      status: "unavailable",
      value: null,
    });
    expect(onlyPrescription(estimate).intensity.prescribed).toMatchObject({
      status: "available",
      values: [{ metric: "perceived_exertion" }],
    });
  });

  it("keeps unavailable plans canonical instead of reviving saved scalar projections", () => {
    const estimate = createUnavailableActivityPlanPlanningEstimate({
      asOf: runPerformanceTargets.asOf,
      activityCategory: "run",
    });

    expect(estimate).toMatchObject({
      durationEstimate: { basis: null, status: "unavailable", valueSeconds: null },
      durationProvenance: null,
      distanceProvenance: null,
      prescriptionQuantification: {
        summary: {
          duration: { elapsed: { status: "unavailable", value: null } },
          distance: { status: "unavailable", value: null },
        },
      },
    });
  });

  it("requires category calibration before resolving a future relative pace target", () => {
    const prescribedIntensity = prescribedActivityIntensitySchema.parse({
      status: "available",
      evidenceRole: "prescribed",
      values: [
        {
          metric: "relative_threshold",
          reference: "threshold_speed",
          unit: "percent",
          magnitude: { kind: "point", value: 80 },
        },
      ],
    });

    expect(
      resolvePrescriptionSpeedMetersPerSecond({
        activityCategory: "run",
        prescribedIntensity,
      }),
    ).toMatchObject({ status: "unavailable", reason: "category_calibration_required" });
    expect(
      resolvePrescriptionSpeedMetersPerSecond({
        activityCategory: "run",
        prescribedIntensity,
        performanceTargets: runPerformanceTargets,
      }),
    ).toEqual({
      status: "available",
      value: 3.2,
      unit: "meters_per_second",
      source: "relative_category_calibration",
    });
  });

  it("keeps authored speed visible when Common Load calibration is unavailable", () => {
    const unavailable = createUnavailableAthletePerformanceTargetFacts(performanceTargets.asOf);
    const estimate = estimateActivityPlanForTrainingContext({
      structure: distanceRun({ type: "speed", intensity: 18 }),
      performanceTargets: unavailable,
      asOf: unavailable.asOf,
    });

    expect(estimate.durationEstimate.valueSeconds).toBe(1_000);
    expect(estimate.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "unavailable",
      reason: "no_load_data",
    });
    expect(onlyPrescription(estimate).commonLoad).toMatchObject({
      status: "unavailable",
      reason: "threshold_missing",
    });
    expect(onlyPrescription(estimate).intensity.prescribed).toMatchObject({
      status: "available",
      values: [
        {
          metric: "speed",
          unit: "kilometers_per_hour",
          magnitude: { kind: "point", value: 18 },
        },
      ],
    });
    expect(getNormalizedIntensity(onlyPrescription(estimate).commonLoad)).toBeNull();
  });

  it("preserves rest duration without adding rest to Common Load", () => {
    const structure = activityPlanStructureSchema.parse({
      ...singleBike,
      segments: [
        ...singleBike.segments,
        { role: "rest", id: id(4), name: "Transition", duration: { type: "time", seconds: 120 } },
      ],
    });

    const estimate = estimateActivityPlanForTrainingContext({
      structure,
      performanceTargets,
      asOf: performanceTargets.asOf,
    });
    expect(estimate).toMatchObject({
      durationEstimate: { basis: "compiled_time", valueSeconds: 3720 },
      restSeconds: 120,
      prescriptionQuantification: { summary: { commonLoad: { status: "complete" } } },
    });
    const commonLoad = estimate.prescriptionQuantification.summary.commonLoad;
    if (commonLoad.status === "unavailable") throw new Error("Expected quantified Load");
    expect(commonLoad.load).toBeCloseTo(64);
  });

  it("fails closed on mixed-category and transition plans", () => {
    const structure = {
      version: 3,
      activity_category: "bike",
      segments: [
        ...singleBike.segments,
        { role: "transition", id: id(4), name: "T1", duration: { type: "time", seconds: 120 } },
        {
          role: "activity",
          id: id(5),
          name: "Run",
          activity_category: "run",
          intervals: [
            {
              id: id(6),
              name: "Run",
              repetitions: 1,
              steps: [
                {
                  id: id(7),
                  name: "5k",
                  duration: { type: "distance", meters: 5000 },
                  targets: [{ type: "speed", intensity: 12 }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(() =>
      estimateActivityPlanForTrainingContext({
        structure,
        performanceTargets,
        asOf: performanceTargets.asOf,
      }),
    ).toThrow();
  });

  it("does not report complete high-confidence load from partial cycling-power evidence", () => {
    const structure = activityPlanStructureSchema.parse({
      version: 3,
      activity_category: "bike",
      segments: [
        {
          role: "activity",
          id: id(20),
          name: "Bike",
          intervals: [
            {
              id: id(21),
              name: "Main",
              repetitions: 1,
              steps: [
                {
                  id: id(22),
                  name: "Power",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "%FTP", intensity: 80 }],
                },
                {
                  id: id(23),
                  name: "RPE",
                  duration: { type: "time", seconds: 1800 },
                  targets: [{ type: "RPE", intensity: 5 }],
                },
              ],
            },
          ],
        },
      ],
    });

    const estimate = estimateActivityPlanForTrainingContext({
      structure,
      performanceTargets,
      asOf: performanceTargets.asOf,
    });
    expect(estimate).toMatchObject({
      prescriptionQuantification: {
        summary: {
          kind: "aggregate",
          commonLoad: { status: "partial" },
        },
      },
      categoryDoses: [
        {
          activity_category: "bike",
          evidence: "partial_common_load",
          evidenceCoverage: 0.5,
          commonLoad: { status: "partial" },
        },
      ],
    });
    expect(estimate).not.toHaveProperty("load");
    expect(estimate).not.toHaveProperty("intensityFactor");
    const commonLoad = estimate.prescriptionQuantification.summary.commonLoad;
    if (commonLoad.status !== "partial") throw new Error("Expected partial Load");
    expect(commonLoad.load).toBeCloseTo(32, 12);
    expect(commonLoad.load).toBeGreaterThan(0);
  });
});
