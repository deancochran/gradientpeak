import { describe, expect, it } from "vitest";
import { type ActivityPlanTarget, activityPlanStructureSchema } from "../activity-plan";
import {
  activityPrescriptionQuantificationSchema,
  aggregatePrescriptions,
  createActivityPlanPrescriptionQuantificationBundle,
  prescribedActivityIntensitySchema,
} from "../activity-quantification";
import { getNormalizedIntensity } from "../load";
import {
  athletePerformanceTargetFactsSchema,
  createUnavailableAthletePerformanceTargetFacts,
  materializeAthletePerformanceTargetFacts,
} from "../performance-model";
import { ENDURANCE_SWIM } from "../samples";
import { buildPerformanceTargetFactsFixture } from "../testing/performance-model";
import {
  type ActivityPlanPlanningEstimate,
  bindPrescriptionQuantificationToScheduledEvent,
  createUnavailableActivityPlanPlanningEstimate,
  estimateActivityPlanForTrainingContext,
  resolvePrescriptionSpeedMetersPerSecond,
} from "./activity-plan-planning-estimate";
import { getPlannedEstimate } from "./planned-estimate";

const id = (value: number) => `20000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const singleBike = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "bike",
  items: [
    {
      type: "step",
      id: id(3),
      name: "Steady",
      duration: { type: "time", seconds: 3600 },
      targets: [{ type: "%FTP", intensity: 80 }],
    },
  ],
});
const unavailableTargets = createUnavailableAthletePerformanceTargetFacts(
  "2026-06-01T00:00:00.000Z",
);
const bikeThresholdSource = {
  id: "bike-threshold-test",
  status: "available" as const,
  activityCategory: "bike" as const,
  metric: "power" as const,
  unit: "watts" as const,
  method: "bike_power_30m" as const,
  value: 250,
  effectiveAt: "2026-05-30T00:00:00.000Z",
  policyVersion: "threshold-policy-v1",
  state: "confirmed" as const,
  confidence: 0.9,
  sourceEvaluationIds: ["test-evidence"],
  sourceEffortIds: ["test-effort"],
  sourceActivityIds: ["test-activity"],
};
const performanceTargets = materializeAthletePerformanceTargetFacts({
  athleteId: unavailableTargets.athleteId,
  asOf: unavailableTargets.asOf,
  thresholds: [bikeThresholdSource],
});
const runPerformanceTargets = materializeAthletePerformanceTargetFacts({
  athleteId: unavailableTargets.athleteId,
  asOf: unavailableTargets.asOf,
  thresholds: [
    bikeThresholdSource,
    {
      id: "run-threshold-test",
      status: "available",
      activityCategory: "run",
      metric: "speed",
      unit: "meters_per_second",
      method: "run_speed_30m",
      value: 4,
      effectiveAt: "2026-05-30T00:00:00.000Z",
      policyVersion: "threshold-policy-v1",
      state: "confirmed",
      confidence: 0.9,
      sourceEvaluationIds: ["run-test-evidence"],
      sourceEffortIds: ["run-test-effort"],
      sourceActivityIds: ["run-test-activity"],
    },
  ],
});
function singleBikeWithTargets(
  targets: readonly {
    type: "%FTP" | "watts" | "cadence" | "RPE";
    intensity: number;
  }[],
) {
  const step = singleBike.items[0];
  if (!step || step.type !== "step") throw new Error("Expected one standalone step");
  return activityPlanStructureSchema.parse({
    ...singleBike,
    items: [{ ...step, targets: [...targets] }],
  });
}
function onlyPrescription(estimate: ActivityPlanPlanningEstimate) {
  const member = estimate.prescriptionQuantification.members[0];
  if (!member || estimate.prescriptionQuantification.members.length !== 1) {
    throw new Error("Expected one prescription member");
  }
  return member;
}
function distanceRun(target: { type: "speed" | "RPE"; intensity: number }) {
  return activityPlanStructureSchema.parse({
    version: 5,
    activity_category: "run",
    items: [
      {
        type: "step",
        id: id(32),
        name: "5K",
        duration: { type: "distance", meters: 5000 },
        targets: [target],
      },
    ],
  });
}
function timedPlan(activity_category: "bike" | "run" | "swim", targets: ActivityPlanTarget[]) {
  return activityPlanStructureSchema.parse({
    version: 5,
    activity_category,
    items: [
      {
        type: "step",
        id: id(42),
        name: "Steady",
        duration: { type: "time", seconds: 3600 },
        targets,
      },
    ],
  });
}
describe("estimateActivityPlanForTrainingContext", () => {
  it("projects the exact indoor Endurance Set objective intensity independently", () => {
    const estimate = estimateActivityPlanForTrainingContext({
      structure: ENDURANCE_SWIM.structure,
      performanceTargets: unavailableTargets,
      asOf: unavailableTargets.asOf,
    });
    expect(estimate.planProjection?.objectiveIntensity).toMatchObject({
      status: "available",
      value: 0.69,
      unit: "ratio",
      completionPolicy: "distance",
      weightingBasis: "distance_meters",
      contributorCoverage: { contributing: 6, total: 6 },
      provenance: "plan_intent",
    });
    expect(estimate.durationEstimate).toMatchObject({ status: "unavailable", valueSeconds: null });
    expect(estimate.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "unavailable",
    });
  });
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
    expect(getPlannedEstimate(estimate.prescriptionQuantification)).toMatchObject({
      durationSeconds: { status: "known", value: 3600 },
      normalizedIntensity: { status: "estimated", value: 0.8, basis: "plan_intent" },
      load: { status: "estimated", value: expect.closeTo(64), basis: "plan_intent" },
    });
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
    };
    const recomputed = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets: recomputedTargets,
      asOf: recomputedTargets.asOf,
      planId: "stable-plan",
    });
    const revisedTargets = athletePerformanceTargetFactsSchema.parse({
      ...performanceTargets,
      thresholds: {
        ...performanceTargets.thresholds,
        bike: {
          ...performanceTargets.thresholds.bike,
          value: 260,
          thresholdId: "bike-threshold-test-2",
          evaluationId: "test-evidence-2",
          sourceEvaluationIds: ["test-evidence-2"],
          sourceEffortIds: ["test-effort-2"],
          sourceActivityIds: ["test-activity-2"],
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
    expect(recomputedPrescription.commonLoad.thresholdEvidence).toBeNull();
    expect(recomputedPrescription.commonLoad.evidenceFingerprint).toBe(
      firstPrescription.commonLoad.evidenceFingerprint,
    );
    expect(revisedPrescription.subjectIdentity).toEqual(firstPrescription.subjectIdentity);
    expect(revisedPrescription.evidenceIdentity).toEqual(firstPrescription.evidenceIdentity);
    expect(revisedPrescription.calculationIdentity.fingerprint).toBe(
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
      valueSeconds: 1000,
      status: "estimated",
      basis: "distance_and_pace",
      confidence: "medium",
    });
    expect(estimate.durationEstimate.valueSeconds).not.toBe(1250);
    expect(onlyPrescription(estimate).distance).toMatchObject({
      status: "available",
      value: 5000,
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
    expect(getPlannedEstimate(estimate.prescriptionQuantification)).toMatchObject({
      durationSeconds: { status: "unavailable", value: null },
      normalizedIntensity: { status: "unavailable", value: null },
      load: { status: "unavailable", value: null },
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
  it("normalizes %MaxHR through recorded MaxHR and LTHR instead of treating it as %ThresholdHR", () => {
    const facts = buildPerformanceTargetFactsFixture({
      lthrBpm: { run: 160 },
      maxHrBpm: { run: 200 },
    });
    const estimate = estimateActivityPlanForTrainingContext({
      structure: timedPlan("run", [{ type: "%MaxHR", intensity: 80 }]),
      performanceTargets: facts,
      asOf: facts.asOf,
    });
    expect(estimate.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "complete",
      intensity: 1,
      load: 100,
    });
    expect(onlyPrescription(estimate).commonLoad).toMatchObject({
      status: "available",
      thresholdEvidence: { type: "lthr_bpm", value: 160, unit: "beats_per_minute" },
    });
  });
  it.each([
    "run",
    "swim",
  ] as const)("duration-weights a personalized timed %s prescription even when distance is derived", (activityCategory) => {
    const facts =
      activityCategory === "run"
        ? buildPerformanceTargetFactsFixture({
            lthrBpm: { run: 160 },
            maxHrBpm: { run: 200 },
          })
        : buildPerformanceTargetFactsFixture({
            lthrBpm: { swim: 150 },
            maxHrBpm: { swim: 190 },
          });
    const estimate = estimateActivityPlanForTrainingContext({
      structure: timedPlan(activityCategory, [{ type: "%MaxHR", intensity: 80 }]),
      performanceTargets: facts,
      asOf: facts.asOf,
    });
    const member = onlyPrescription(estimate);
    expect(member.commonLoad.thresholdEvidence).not.toBeNull();
    const memberWithDerivedDistance = activityPrescriptionQuantificationSchema.parse({
      ...member,
      distance: {
        status: "available",
        evidenceRole: "derived",
        value: activityCategory === "run" ? 10000 : 3000,
        unit: "meters",
      },
    });
    const planned = getPlannedEstimate(
      createActivityPlanPrescriptionQuantificationBundle({
        members: [memberWithDerivedDistance],
      }),
    );
    expect(planned.prescribedIntensity).toEqual({
      status: "known",
      value: member.intensity.prescribed.values,
    });
    expect(estimate.planProjection).not.toHaveProperty("prescribedIntensity");
  });
  it("keeps %MaxHR load unavailable unless both MaxHR and LTHR are usable", () => {
    const missingMax = buildPerformanceTargetFactsFixture({ lthrBpm: { run: 160 } });
    const missingLthr = buildPerformanceTargetFactsFixture({ maxHrBpm: { run: 200 } });
    for (const facts of [missingMax, missingLthr]) {
      const estimate = estimateActivityPlanForTrainingContext({
        structure: timedPlan("run", [{ type: "%MaxHR", intensity: 80 }]),
        performanceTargets: facts,
        asOf: facts.asOf,
      });
      expect(onlyPrescription(estimate).commonLoad).toMatchObject({
        status: "unavailable",
        reason: "threshold_missing",
      });
      expect(estimate.prescriptionQuantification.summary.commonLoad).toMatchObject({
        status: "unavailable",
        reason: "no_load_data",
      });
    }
  });
  it("keeps %ThresholdHR as explicit plan intent without relabeling %MaxHR", () => {
    const estimate = estimateActivityPlanForTrainingContext({
      structure: timedPlan("run", [{ type: "%ThresholdHR", intensity: 80 }]),
      performanceTargets: unavailableTargets,
      asOf: unavailableTargets.asOf,
    });
    expect(estimate.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "complete",
      intensity: 0.8,
    });
  });
  it("resolves equivalent speed targets deterministically and rejects conflicting permutations", () => {
    const speed = {
      metric: "speed" as const,
      unit: "kilometers_per_hour" as const,
      magnitude: { kind: "point" as const, value: 18 },
    };
    const equivalentPace = {
      metric: "pace" as const,
      unit: "seconds_per_kilometer" as const,
      magnitude: { kind: "point" as const, value: 200 },
    };
    const conflictingPace = {
      ...equivalentPace,
      magnitude: { kind: "point" as const, value: 240 },
    };
    const resolve = (values: Array<typeof speed | typeof equivalentPace>) =>
      resolvePrescriptionSpeedMetersPerSecond({
        activityCategory: "run",
        prescribedIntensity: prescribedActivityIntensitySchema.parse({
          status: "available",
          evidenceRole: "prescribed",
          values,
        }),
      });
    expect(resolve([speed, equivalentPace])).toEqual(resolve([equivalentPace, speed]));
    expect(resolve([speed, equivalentPace])).toMatchObject({ status: "available", value: 5 });
    expect(resolve([speed, conflictingPace])).toEqual(resolve([conflictingPace, speed]));
    expect(resolve([speed, conflictingPace])).toMatchObject({
      status: "unavailable",
      reason: "ambiguous_target",
    });
  });
  it("rejects conflicting speed targets before estimating a plan", () => {
    expect(() =>
      timedPlan("run", [
        { type: "speed", intensity: 14.4 },
        { type: "speed", intensity: 18 },
      ]),
    ).toThrow("ACTIVITY_PLAN_MULTIPLE_OBJECTIVE_TARGETS");
  });
  it("keeps authored speed visible when Common Load calibration is unavailable", () => {
    const unavailable = createUnavailableAthletePerformanceTargetFacts(performanceTargets.asOf);
    const estimate = estimateActivityPlanForTrainingContext({
      structure: distanceRun({ type: "speed", intensity: 18 }),
      performanceTargets: unavailable,
      asOf: unavailable.asOf,
    });
    expect(estimate.durationEstimate.valueSeconds).toBe(1000);
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
  it("treats a fixed untargeted recovery step as an authored activity occurrence", () => {
    const structure = activityPlanStructureSchema.parse({
      ...singleBike,
      items: [
        ...singleBike.items,
        {
          type: "step",
          id: id(5),
          name: "Recovery",
          duration: { type: "time", seconds: 120 },
          targets: [],
        },
      ],
    });
    const estimate = estimateActivityPlanForTrainingContext({
      structure,
      performanceTargets,
      asOf: performanceTargets.asOf,
    });
    expect(estimate).toMatchObject({
      durationEstimate: { basis: "compiled_time", valueSeconds: 3720 },
      restSeconds: 0,
      prescriptionQuantification: { summary: { commonLoad: { status: "partial" } } },
    });
    const commonLoad = estimate.prescriptionQuantification.summary.commonLoad;
    if (commonLoad.status !== "partial") throw new Error("Expected partial Load");
    expect(commonLoad.load).toBeCloseTo(64);
  });
  it("fails closed on mixed-category and transition plans", () => {
    const structure = {
      version: 3,
      activity_category: "bike",
      segments: [
        ...singleBike.items,
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
                  type: "step",
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
      version: 5,
      activity_category: "bike",
      items: [
        {
          type: "step",
          id: id(22),
          name: "Power",
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "%FTP", intensity: 80 }],
        },
        {
          type: "step",
          id: id(23),
          name: "RPE",
          duration: { type: "time", seconds: 1800 },
          targets: [{ type: "RPE", intensity: 5 }],
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
    expect(getPlannedEstimate(estimate.prescriptionQuantification)).toMatchObject({
      durationSeconds: { status: "known", value: 3600 },
      normalizedIntensity: {
        status: "partial",
        value: expect.any(Number),
        reason: "incomplete_members",
      },
      load: { status: "partial", value: expect.any(Number), reason: "incomplete_members" },
    });
  });
  it("uses unanchored relative intent without inventing personalized physical output", () => {
    const estimate = estimateActivityPlanForTrainingContext({
      structure: singleBike,
      performanceTargets: unavailableTargets,
      asOf: unavailableTargets.asOf,
    });
    expect(estimate.prescriptionQuantification.summary.commonLoad).toMatchObject({
      status: "complete",
      intensity: 0.8,
      load: expect.closeTo(64),
    });
    expect(onlyPrescription(estimate).commonLoad.thresholdEvidence).toBeNull();
    expect(getPlannedEstimate(estimate.prescriptionQuantification).load).toMatchObject({
      status: "estimated",
      basis: "plan_intent",
    });
  });
  it("uses the sole objective target regardless of supporting target order", () => {
    const targets = [
      { type: "%FTP" as const, intensity: 80 },
      { type: "cadence" as const, intensity: 90 },
      { type: "RPE" as const, intensity: 6 },
    ] as const;
    const results = [targets, [...targets].reverse(), [targets[1], targets[2], targets[0]]].map(
      (orderedTargets) =>
        estimateActivityPlanForTrainingContext({
          structure: singleBikeWithTargets(orderedTargets),
          performanceTargets: unavailableTargets,
          asOf: unavailableTargets.asOf,
        }).prescriptionQuantification.summary.commonLoad,
    );
    expect(results).toHaveLength(3);
    for (const result of results) {
      expect(result).toMatchObject({
        status: "complete",
        intensity: 0.8,
        load: expect.closeTo(64),
      });
    }
  });
  it("rejects duplicate objective targets before estimating a plan", () => {
    expect(() =>
      singleBikeWithTargets([
        { type: "%FTP", intensity: 80 },
        { type: "%FTP", intensity: 90 },
        { type: "RPE", intensity: 6 },
      ]),
    ).toThrow("ACTIVITY_PLAN_DUPLICATE_TARGET");
  });
});
