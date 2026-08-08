import { createDefaultTrainingPlanBuilderState } from "./defaults";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderGoalBlueprint,
  TrainingPlanBuilderSession,
  TrainingPlanBuilderState,
} from "./types";

const activityPlanId = "11111111-1111-4111-8111-111111111111";
const fixtureAsOf = "2026-01-01T12:00:00.000Z";
const unavailableTargets = createUnavailableAthletePerformanceTargetFacts(fixtureAsOf);
const prescriptionQuantification = estimateActivityPlanForTrainingContext({
  asOf: fixtureAsOf,
  performanceTargets: {
    ...unavailableTargets,
    cycling: {
      planningThresholdPower: {
        ...unavailableTargets.cycling.planningThresholdPower,
        status: "available",
        value: 250,
        calculationVersion: "builder-fixture-v1",
        sourceEvidenceIds: ["builder-fixture-threshold-power"],
        evidenceTime: {
          observedFrom: "2025-12-31T12:00:00.000Z",
          observedThrough: "2025-12-31T12:00:00.000Z",
          computedAt: fixtureAsOf,
        },
        confidence: "high",
        reasons: [],
      },
    },
  },
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
                id: "44444444-4444-4444-8444-444444444444",
                name: "Ride",
                duration: { type: "time", seconds: 3_600 },
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
    overrides: Partial<TrainingPlanBuilderGoalBlueprint> & { priority?: number | undefined } = {},
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
      localId: "session-1",
      offsetDays: 0,
      activityPlan: null,
      ...overrides,
    };
  }

  function assignedSession(
    overrides: Partial<TrainingPlanBuilderSession> = {},
  ): TrainingPlanBuilderSession {
    return {
      localId: "session-1",
      offsetDays: 0,
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
  createUnavailableAthletePerformanceTargetFacts,
  estimateActivityPlanForTrainingContext,
} from "@repo/core";
