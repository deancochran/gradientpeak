import { describe, expect, it } from "vitest";
import { materializeAthletePerformanceTargetFacts } from "../performance-model";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import {
  applyEstimatedSessionActivityFacts,
  deriveEstimatedPlannedTrainingSessions,
  estimatePlanningActivityPlanForAthlete,
  plannedTrainingSessionSchema,
} from "./planningSessions";

function targets(
  asOf: string,
  values: { bikeThresholdWatts?: number; runThresholdMetersPerSecond?: number } = {},
) {
  return materializeAthletePerformanceTargetFacts({
    athleteId: "planning-session-athlete",
    asOf,
    thresholds: [
      ...(values.bikeThresholdWatts === undefined
        ? []
        : [
            {
              activityCategory: "bike" as const,
              metric: "power" as const,
              unit: "watts" as const,
              method: "bike_power_30m" as const,
              value: values.bikeThresholdWatts,
            },
          ]),
      ...(values.runThresholdMetersPerSecond === undefined
        ? []
        : [
            {
              activityCategory: "run" as const,
              metric: "speed" as const,
              unit: "meters_per_second" as const,
              method: "run_speed_30m" as const,
              value: values.runThresholdMetersPerSecond,
            },
          ]),
    ].map((threshold) => ({
      ...threshold,
      id: `${threshold.activityCategory}-planning-threshold`,
      status: "available" as const,
      effectiveAt: "2026-07-10T12:00:00.000Z",
      policyVersion: "threshold-policy-v1",
      state: "confirmed" as const,
      confidence: 0.9,
      sourceEvaluationIds: [`${threshold.activityCategory}-planning-evaluation`],
      sourceEffortIds: [`${threshold.activityCategory}-planning-effort`],
      sourceActivityIds: [`${threshold.activityCategory}-planning-activity`],
    })),
  });
}

describe("planningSessions", () => {
  it("derives athlete-context estimates for assigned planned sessions", () => {
    const asOf = "2026-07-12T12:00:00.000Z";
    const athleteContext = createAthletePlanningContextFromSnapshot({
      asOf,
      profile: null,
      profileMetrics: [],
      performanceTargets: targets(asOf, { runThresholdMetersPerSecond: 4 }),
      activityEfforts: [
        {
          activity_category: "run",
          effort_type: "speed",
          duration_seconds: 1200,
          value: 4,
          unit: "m/s",
          recorded_at: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    const session = plannedTrainingSessionSchema.parse({
      localId: "session-1",
      offsetDays: 0,
      activityPlan: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "5K tempo",
        published: true,
        accessible: true,
        prescriptionQuantification: null,
      },
    });

    const [estimatedSession] = deriveEstimatedPlannedTrainingSessions({
      athleteContext,
      sessions: [session],
      activityPlansById: {
        "11111111-1111-4111-8111-111111111111": {
          activity_category: "run",
          structure: {
            version: 3,
            activity_category: "run",
            segments: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Run",
                role: "activity",
                intervals: [
                  {
                    id: "33333333-3333-4333-8333-333333333333",
                    name: "Tempo block",
                    repetitions: 1,
                    steps: [
                      {
                        id: "44444444-4444-4444-8444-444444444444",
                        name: "Tempo 5K",
                        duration: { type: "distance", meters: 5000 },
                        targets: [{ type: "speed", intensity: 14.4 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(estimatedSession?.activityPlanEstimate).toMatchObject({
      durationEstimate: {
        valueSeconds: 1250,
        status: "estimated",
        basis: "distance_and_pace",
        confidence: "medium",
      },
      prescriptionQuantification: {
        summary: {
          distance: { status: "complete", value: 5000 },
          commonLoad: { status: "complete", intensity: 1 },
        },
      },
    });
    expect(estimatedSession?.activityPlanEstimate).not.toHaveProperty("intensityFactor");
    expect(estimatedSession?.activityPlanEstimate).not.toHaveProperty("load");
    const applied = applyEstimatedSessionActivityFacts(
      session,
      estimatedSession?.activityPlanEstimate ?? null,
    ).activityPlan;
    expect(applied?.prescriptionQuantification).toEqual(
      estimatedSession?.activityPlanEstimate?.prescriptionQuantification,
    );
    const commonLoad =
      estimatedSession?.activityPlanEstimate?.prescriptionQuantification.summary.commonLoad;
    if (!commonLoad || commonLoad.status === "unavailable") {
      throw new Error("Expected quantified Load");
    }
    expect(commonLoad.load).toBeCloseTo(34.7222222222, 8);
  });

  it("stores unavailable canonical evidence without inventing scalar fallback facts", () => {
    const athleteContext = createAthletePlanningContextFromSnapshot({
      asOf: "2026-07-12T12:00:00.000Z",
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
    });
    const session = plannedTrainingSessionSchema.parse({
      localId: "session-open",
      offsetDays: 0,
      activityPlan: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Open session",
        published: true,
        accessible: true,
        prescriptionQuantification: null,
      },
    });
    const openPlan = {
      structure: {
        version: 3,
        activity_category: "run",
        segments: [
          {
            id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            name: "Open run",
            role: "activity",
            intervals: [
              {
                id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
                name: "Open",
                repetitions: 1,
                steps: [
                  {
                    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
                    name: "Finish when ready",
                    duration: { type: "untilFinished" },
                    targets: [{ type: "RPE", intensity: 5 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const [estimatedSession] = deriveEstimatedPlannedTrainingSessions({
      athleteContext,
      sessions: [session],
      activityPlansById: {
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa": openPlan,
      },
    });

    expect(estimatedSession?.activityPlanEstimate?.durationEstimate).toMatchObject({
      valueSeconds: null,
      basis: null,
    });
    expect(
      applyEstimatedSessionActivityFacts(session, estimatedSession?.activityPlanEstimate ?? null)
        .activityPlan,
    ).toMatchObject({
      prescriptionQuantification: {
        summary: { duration: { elapsed: { status: "unavailable", value: null } } },
      },
    });

    const unavailable = estimatePlanningActivityPlanForAthlete({
      activityPlan: openPlan,
      athleteContext,
    });
    expect(unavailable.durationEstimate.status).toBe("unavailable");
    expect(applyEstimatedSessionActivityFacts(session, unavailable).activityPlan).toMatchObject({
      prescriptionQuantification: {
        summary: { duration: { elapsed: { status: "unavailable", value: null } } },
      },
    });
  });

  it("keeps stronger assigned evidence when a new athlete-context estimate abstains", () => {
    const asOf = "2026-07-12T12:00:00.000Z";
    const unavailable = targets(asOf);
    const plan = {
      id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      structure: {
        version: 3,
        activity_category: "bike",
        segments: [
          {
            id: "11111111-2222-4333-8444-555555555555",
            name: "Bike",
            role: "activity",
            intervals: [
              {
                id: "66666666-7777-4888-8999-aaaaaaaaaaaa",
                name: "Main",
                repetitions: 1,
                steps: [
                  {
                    id: "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff",
                    name: "Steady",
                    duration: { type: "time", seconds: 3_600 },
                    targets: [{ type: "%FTP", intensity: 80 }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    const calibratedContext = createAthletePlanningContextFromSnapshot({
      asOf,
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
      performanceTargets: targets(asOf, { bikeThresholdWatts: 250 }),
    });
    const abstainingContext = createAthletePlanningContextFromSnapshot({
      asOf,
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
      performanceTargets: unavailable,
    });
    const existingEstimate = estimatePlanningActivityPlanForAthlete({
      activityPlan: plan,
      athleteContext: calibratedContext,
      planId: plan.id,
    });
    const abstainingEstimate = estimatePlanningActivityPlanForAthlete({
      activityPlan: plan,
      athleteContext: abstainingContext,
      planId: plan.id,
    });
    const session = plannedTrainingSessionSchema.parse({
      localId: "assigned-session",
      offsetDays: 0,
      activityPlan: {
        id: plan.id,
        name: "Assigned bike",
        published: true,
        accessible: true,
        prescriptionQuantification: existingEstimate.prescriptionQuantification,
      },
    });

    expect(existingEstimate.prescriptionQuantification.summary.commonLoad.status).toBe("complete");
    expect(abstainingEstimate.prescriptionQuantification.summary.commonLoad.status).toBe(
      "unavailable",
    );
    expect(
      applyEstimatedSessionActivityFacts(session, abstainingEstimate).activityPlan
        ?.prescriptionQuantification,
    ).toEqual(existingEstimate.prescriptionQuantification);
  });

  it("replaces session plan evidence with the latest canonical prescription bundle", () => {
    const asOf = "2026-07-12T12:00:00.000Z";
    const athleteContext = createAthletePlanningContextFromSnapshot({
      asOf,
      profile: null,
      profileMetrics: [],
      activityEfforts: [],
      performanceTargets: targets(asOf, { bikeThresholdWatts: 250 }),
    });
    const session = plannedTrainingSessionSchema.parse({
      localId: "session-bike",
      offsetDays: 0,
      activityPlan: {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        name: "Bike",
        published: true,
        accessible: true,
        prescriptionQuantification: null,
      },
    });
    const [estimatedSession] = deriveEstimatedPlannedTrainingSessions({
      athleteContext,
      sessions: [session],
      activityPlansById: {
        "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee": {
          structure: {
            version: 3,
            activity_category: "bike",
            segments: [
              {
                id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                name: "Bike",
                role: "activity",
                intervals: [
                  {
                    id: "11111111-2222-4333-8444-555555555555",
                    name: "Main",
                    repetitions: 1,
                    steps: [
                      {
                        id: "66666666-7777-4888-8999-aaaaaaaaaaaa",
                        name: "Steady",
                        duration: { type: "time", seconds: 3600 },
                        targets: [{ type: "%FTP", intensity: 80 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
    });
    const estimate = estimatedSession?.activityPlanEstimate ?? null;

    const commonLoad = estimate?.prescriptionQuantification.summary.commonLoad;
    if (commonLoad?.status !== "complete") throw new Error("Expected complete Load");
    expect(commonLoad).toMatchObject({ status: "complete", intensity: 0.8 });
    expect(commonLoad.load).toBeCloseTo(64);
    const applied = applyEstimatedSessionActivityFacts(session, estimate).activityPlan;
    expect(applied?.prescriptionQuantification?.summary.duration.elapsed).toMatchObject({
      status: "complete",
      value: 3600,
    });
  });
});
