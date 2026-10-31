import { createDefaultTrainingPlanBuilderState } from "./defaults";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderGoalBlueprint,
  TrainingPlanBuilderSession,
  TrainingPlanBuilderState,
} from "./types";

const activityPlanId = "11111111-1111-4111-8111-111111111111";
const fixtureAsOf = "2026-01-01T12:00:00.000Z";
const performanceTargets = materializeAthletePerformanceTargetFacts({
  athleteId: "training-plan-builder-fixture",
  asOf: fixtureAsOf,
  thresholds: [
    {
      id: "builder-fixture-threshold-power",
      status: "available",
      activityCategory: "bike",
      metric: "power",
      unit: "watts",
      method: "bike_power_30m",
      value: 250,
      effectiveAt: "2025-12-31T12:00:00.000Z",
      policyVersion: "threshold-policy-v1",
      state: "confirmed",
      confidence: 0.9,
      sourceEvaluationIds: ["builder-fixture-evaluation"],
      sourceEffortIds: ["builder-fixture-effort"],
      sourceActivityIds: ["builder-fixture-activity"],
    },
  ],
});
const prescriptionQuantification = estimateActivityPlanForTrainingContext({
  asOf: fixtureAsOf,
  performanceTargets,
  planId: activityPlanId,
  structure: {
    version: 3,
    activity_category: "bike",
    segments: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        role: "activity",
        name: "Endurance Ride",
        intervals: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            name: "Main",
            repetitions: 1,
            steps: [
              {
                type: "step",
                id: "44444444-4444-4444-8444-444444444444",
                name: "Ride",
                duration: { type: "time", seconds: 3600 },
                targets: [{ type: "%FTP", intensity: Math.sqrt(0.48) * 100 }],
              },
            ],
          },
        ],
      },
    ],
  },
}).prescriptionQuantification;
export function createTrainingPlanBuilderFixtures() {
  const emptyState: TrainingPlanBuilderState = {
    ...createDefaultTrainingPlanBuilderState(),
    anchorDate: "2026-01-01",
  };
  function activityPlan(
    overrides: Partial<TrainingPlanActivityPlanFacts> = {},
  ): TrainingPlanActivityPlanFacts {
    return {
      id: activityPlanId,
      name: "Endurance Ride",
      published: true,
      accessible: true,
      prescriptionQuantification,
      ...overrides,
    };
  }
  function localGoal(
    overrides: Partial<TrainingPlanBuilderGoalBlueprint> & {
      priority?: number | undefined;
    } = {},
  ): TrainingPlanBuilderGoalBlueprint {
    const { priority = 10, ...rest } = overrides;
    return {
      localId: "goal-1",
      title: "Build aerobic capacity",
      targetOffsetDays: null,
      priority,
      activityCategory: null,
      objective: null,
      ...rest,
    };
  }
  function unresolvedSession(
    overrides: Partial<TrainingPlanBuilderSession> = {},
  ): TrainingPlanBuilderSession {
    return {
      id: "00000000-0000-4000-8000-000000000010",
      localId: "00000000-0000-4000-8000-000000000010",
      offsetDays: 0,
      demand: {
        activity_category: "other",
        training_intent: "general_maintenance",
        target_duration_minutes: null,
        target_common_load: null,
        importance: "normal",
      },
      activityPlan: null,
      ...overrides,
    };
  }
  function assignedSession(
    overrides: Partial<TrainingPlanBuilderSession> = {},
  ): TrainingPlanBuilderSession {
    return {
      id: "00000000-0000-4000-8000-000000000010",
      localId: "00000000-0000-4000-8000-000000000010",
      offsetDays: 0,
      demand: {
        activity_category: "other",
        training_intent: "general_maintenance",
        target_duration_minutes: null,
        target_common_load: null,
        importance: "normal",
      },
      activityPlan: activityPlan(),
      ...overrides,
    };
  }
  const readyState: TrainingPlanBuilderState = {
    ...emptyState,
    details: {
      ...emptyState.details,
      name: "Four week base builder",
      description: "Reusable plan template",
    },
    structure: {
      sessions: [
        assignedSession({
          localId: "session-1",
          offsetDays: 0,
          eventOverrides: { title: "Aerobic opener", start_time: "07:30" },
        }),
      ],
    },
  };
  return {
    activityPlanId,
    anchorDate: emptyState.anchorDate,
    emptyState,
    readyState,
    activityPlan,
    localGoal,
    unresolvedSession,
    assignedSession,
  };
}

import {
  estimateActivityPlanForTrainingContext,
  materializeAthletePerformanceTargetFacts,
} from "@repo/core";
