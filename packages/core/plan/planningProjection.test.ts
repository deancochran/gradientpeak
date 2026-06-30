import { describe, expect, it } from "vitest";
import { createAthletePlanningContextFromSnapshot } from "./athletePlanningContext";
import { derivePlanningProjection } from "./planningProjection";

describe("planningProjection", () => {
  it("derives estimated sessions, previews, scheduling, and constraints from planning context", () => {
    const projection = derivePlanningProjection({
      context: {
        anchorDate: "2026-01-01",
        athleteContext: createAthletePlanningContextFromSnapshot({
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
        }),
        goals: [],
        preferences: {
          durationWeeks: 6,
          weeklySessionCount: 4,
          targetWeeklyHours: null,
          restDaysPerWeek: null,
        },
        scheduling: {
          startDate: "2026-01-01",
          preferredWeekdays: [1, 3, 5],
          sessionDateOverrides: {},
        },
        sessions: [
          {
            localId: "session-1",
            offsetDays: 4,
            activityPlan: {
              id: "11111111-1111-4111-8111-111111111111",
              name: "5K tempo",
              published: true,
              accessible: true,
              estimatedTss: 100,
              estimatedDurationSeconds: 3600,
            },
            eventOverrides: { title: "Friday tempo" },
          },
        ],
      },
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

    expect(projection.sessions[0]?.activityPlan).toMatchObject({
      estimatedDurationSeconds: 1250,
      estimatedTss: 22.2,
    });
    expect(projection.creationPreview.totalEstimatedTss).toBe(22.2);
    expect(projection.schedulingPreview.sessions[0]).toMatchObject({
      id: "session-1",
      label: "Friday tempo",
      estimatedTss: 22.2,
    });
    expect(projection.creationConstraints).toMatchObject({
      hard_rest_days: ["sunday", "tuesday", "thursday", "saturday"],
      min_sessions_per_week: 3,
      max_sessions_per_week: 4,
    });
  });
});
