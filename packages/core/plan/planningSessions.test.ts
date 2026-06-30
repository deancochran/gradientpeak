import { describe, expect, it } from "vitest";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import {
  applyEstimatedSessionActivityFacts,
  deriveEstimatedPlannedTrainingSessions,
  plannedTrainingSessionSchema,
} from "./planningSessions";

describe("planningSessions", () => {
  it("derives athlete-context estimates for assigned planned sessions", () => {
    const athleteContext = createAthletePlanningContextFromSnapshot({
      profile: null,
      profileMetrics: [],
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
        estimatedTss: 100,
        estimatedDurationSeconds: 3600,
      },
    });

    const [estimatedSession] = deriveEstimatedPlannedTrainingSessions({
      athleteContext,
      sessions: [session],
      activityPlansById: {
        "11111111-1111-4111-8111-111111111111": {
          activity_category: "run",
          authoritative_metrics: { estimated_duration: 3600, estimated_tss: 100 },
          structure: {
            version: 2,
            intervals: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                name: "Tempo block",
                repetitions: 1,
                steps: [
                  {
                    id: "33333333-3333-4333-8333-333333333333",
                    name: "Tempo 5K",
                    duration: { type: "distance", meters: 5000 },
                    targets: [{ type: "%FTP", intensity: 80 }],
                  },
                ],
              },
            ],
          },
        },
      },
    });

    expect(estimatedSession?.activityPlanEstimate).toMatchObject({
      durationSeconds: 1250,
      distanceMeters: 5000,
      intensityFactor: 0.8,
      confidence: "high",
    });
    expect(estimatedSession?.activityPlanEstimate?.tss).toBeCloseTo(22.2, 1);
    expect(
      applyEstimatedSessionActivityFacts(session, estimatedSession?.activityPlanEstimate ?? null)
        .activityPlan,
    ).toMatchObject({ estimatedDurationSeconds: 1250, estimatedTss: 22.2 });
  });
});
