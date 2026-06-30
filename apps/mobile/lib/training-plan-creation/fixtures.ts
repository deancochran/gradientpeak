import { createDefaultTrainingPlanBuilderState } from "./defaults";
import type {
  TrainingPlanActivityPlanFacts,
  TrainingPlanBuilderGoalBlueprint,
  TrainingPlanBuilderSession,
  TrainingPlanBuilderState,
} from "./types";

const activityPlanId = "11111111-1111-4111-8111-111111111111";

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
      estimatedTss: 48,
      estimatedDurationSeconds: 3600,
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
