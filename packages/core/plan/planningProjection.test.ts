import { describe, expect, it } from "vitest";
import { canonicalCapabilityCompositionInput } from "../athlete-capabilities/__tests__/fixtures/capability-profile-v1";
import { composeAthleteCapabilityProfile } from "../athlete-capabilities/composition";
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
          maxSingleSessionDurationMinutes: null,
          progressionPace: null,
          recoveryPriority: null,
          weekPatternPreference: null,
          strengthIntegrationPriority: null,
          doubleDayTolerance: null,
          longSessionFatigueTolerance: null,
          taperStylePreference: null,
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
              prescriptionQuantification: null,
            },
            eventOverrides: { title: "Friday tempo" },
          },
        ],
      },
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

    expect(projection.sessions[0]?.activityPlan).toMatchObject({
      prescriptionQuantification: {
        summary: { duration: { elapsed: { status: "complete", value: 1250 } } },
      },
    });
    expect(projection.creationPreview.totalEstimatedLoad).toBeNull();
    expect(projection.schedulingPreview.sessions[0]).toMatchObject({
      id: "session-1",
      label: "Friday tempo",
      estimatedCommonLoad: null,
    });
    expect(projection.creationConstraints).toMatchObject({
      hard_rest_days: ["sunday", "tuesday", "thursday", "saturday"],
      min_sessions_per_week: 3,
      max_sessions_per_week: 4,
    });
  });

  it("consumes an explicit capability contract diagnostically without changing plan derivation", () => {
    const context = {
      anchorDate: "2026-07-01",
      athleteContext: createAthletePlanningContextFromSnapshot({
        profile: null,
        profileMetrics: [],
        activityEfforts: [],
      }),
      goals: [],
      preferences: {
        durationWeeks: 6,
        weeklySessionCount: 4,
        targetWeeklyHours: null,
        restDaysPerWeek: null,
        maxSingleSessionDurationMinutes: null,
        progressionPace: null,
        recoveryPriority: null,
        weekPatternPreference: null,
        strengthIntegrationPriority: null,
        doubleDayTolerance: null,
        longSessionFatigueTolerance: null,
        taperStylePreference: null,
      },
      scheduling: {
        startDate: "2026-07-01",
        preferredWeekdays: [1, 3, 5],
        sessionDateOverrides: {},
      },
      sessions: [],
    };
    const profile = composeAthleteCapabilityProfile(canonicalCapabilityCompositionInput());
    const baseline = derivePlanningProjection({ context });
    const projected = derivePlanningProjection({
      context,
      capabilityPlanning: {
        profile,
        selectionContext: {
          contractVersion: "capability-planning-selection-v1",
          athleteId: profile.athleteId,
          planningAsOf: profile.assessmentAsOf,
          categoryPriority: ["strength"],
          demands: [
            {
              requirementId: "unsupported-strength-threshold",
              source: {
                kind: "planning",
                sourceId: "planning-projection-test",
                calculationVersion: "literal-planning-demand-v1",
              },
              capability: "thresholdCapacity",
              eligibleActivityCategories: ["strength"],
              unit: "watts",
              measurementBasis: "cycling_planning_threshold_power_anchor",
              requiredValue: 100,
            },
          ],
        },
      },
    });

    expect(baseline).not.toHaveProperty("capabilityProjection");
    expect(projected.sessions).toEqual(baseline.sessions);
    expect(projected.creationPreview).toEqual(baseline.creationPreview);
    expect(projected.schedulingPreview).toEqual(baseline.schedulingPreview);
    expect(projected.creationConstraints).toEqual(baseline.creationConstraints);
    const capabilityProjection = projected.capabilityProjection;
    if (capabilityProjection === undefined) {
      throw new Error("Explicit capability planning input must produce a projection");
    }
    expect(capabilityProjection.requirements[0]).toMatchObject({
      status: "unavailable",
      comparison: null,
      selectedCapability: { status: "unavailable", value: null },
    });
    expect(capabilityProjection.limiterAssessment.rankGroups).toEqual([]);
  });
});
