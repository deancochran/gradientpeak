export type TrainingPlanCreationValidationCode =
  | "missing_plan_name"
  | "no_sessions"
  | "missing_activity_plan"
  | "invalid_offset_days"
  | "invalid_goal_target_offset"
  | "invalid_assumption_date"
  | "invalid_plan_preferences"
  | "inaccessible_activity_plan"
  | "unpublished_activity_plan"
  | "invalid_start_time"
  | "duplicate_session";

export interface TrainingPlanCreationValidationIssue {
  code: TrainingPlanCreationValidationCode;
  message: string;
  targetType: "overview" | "session" | "goal" | "assumptions";
  targetId?: string;
}

export interface TrainingPlanCreationValidationSession {
  localId: string;
  offsetDays: number;
  plannedOffsetDays?: number | null;
  plannedDateValid?: boolean;
  activityPlan: {
    id: string;
    accessible: boolean;
    published: boolean;
  } | null;
  startTime?: string | null;
}

export interface TrainingPlanCreationValidationGoal {
  localId: string;
  targetDateValid?: boolean;
  targetOffsetDays: number | null;
}

export interface TrainingPlanCreationValidationInput {
  name: string;
  anchorDateValid: boolean;
  profileBirthDateValid: boolean;
  planPreferencesValid: boolean;
  planPreferencesMessage?: string;
  sessions: TrainingPlanCreationValidationSession[];
  goals: TrainingPlanCreationValidationGoal[];
}

export function validateTrainingPlanCreationInput(
  input: TrainingPlanCreationValidationInput,
): TrainingPlanCreationValidationIssue[] {
  const issues: TrainingPlanCreationValidationIssue[] = [];

  if (input.name.trim().length === 0) {
    issues.push({
      code: "missing_plan_name",
      message: "Add a training plan name before saving.",
      targetType: "overview",
    });
  }

  if (!input.anchorDateValid) {
    issues.push({
      code: "invalid_assumption_date",
      message: "Builder anchor date must be a valid date.",
      targetType: "overview",
    });
  }

  if (!input.profileBirthDateValid) {
    issues.push({
      code: "invalid_assumption_date",
      message: "Profile birth date assumption must be a valid date.",
      targetType: "assumptions",
    });
  }

  if (!input.planPreferencesValid) {
    issues.push({
      code: "invalid_plan_preferences",
      message:
        input.planPreferencesMessage ?? "Planning constraints must stay within supported ranges.",
      targetType: "assumptions",
    });
  }

  if (input.sessions.length === 0) {
    issues.push({
      code: "no_sessions",
      message: "Add at least one session before saving.",
      targetType: "overview",
    });
  }

  const sessionKeys = new Map<string, string>();
  for (const session of input.sessions) {
    const effectiveOffsetDays = session.plannedOffsetDays ?? session.offsetDays;

    if (session.plannedDateValid === false) {
      issues.push({
        code: "invalid_assumption_date",
        message: "Session planned dates must be valid dates.",
        targetType: "session",
        targetId: session.localId,
      });
    }

    if (!Number.isInteger(effectiveOffsetDays) || effectiveOffsetDays < 0) {
      issues.push({
        code: "invalid_offset_days",
        message: "Sessions must use a non-negative relative day offset.",
        targetType: "session",
        targetId: session.localId,
      });
    }

    if (session.startTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(session.startTime)) {
      issues.push({
        code: "invalid_start_time",
        message: "Session start times must use HH:mm format.",
        targetType: "session",
        targetId: session.localId,
      });
    }

    if (!session.activityPlan) {
      issues.push({
        code: "missing_activity_plan",
        message: "Assign an activity plan to every training plan session.",
        targetType: "session",
        targetId: session.localId,
      });
      continue;
    }

    if (!session.activityPlan.accessible) {
      issues.push({
        code: "inaccessible_activity_plan",
        message: "Use only activity plans available to the athlete creating this plan.",
        targetType: "session",
        targetId: session.localId,
      });
    }

    if (!session.activityPlan.published) {
      issues.push({
        code: "unpublished_activity_plan",
        message: "Publish the activity plan before assigning it to a training plan.",
        targetType: "session",
        targetId: session.localId,
      });
    }

    const sessionKey = [effectiveOffsetDays, session.activityPlan.id, session.startTime ?? ""].join(
      "|",
    );
    const existingSessionId = sessionKeys.get(sessionKey);
    if (existingSessionId) {
      issues.push({
        code: "duplicate_session",
        message: "Sessions cannot duplicate the same activity plan, day, and start time.",
        targetType: "session",
        targetId: session.localId,
      });
    } else {
      sessionKeys.set(sessionKey, session.localId);
    }
  }

  for (const goal of input.goals) {
    if (goal.targetDateValid === false) {
      issues.push({
        code: "invalid_assumption_date",
        message: "Goal target dates must be valid when present in builder state.",
        targetType: "goal",
        targetId: goal.localId,
      });
    }

    if (
      goal.targetOffsetDays !== null &&
      (!Number.isInteger(goal.targetOffsetDays) || goal.targetOffsetDays < 0)
    ) {
      issues.push({
        code: "invalid_goal_target_offset",
        message: "Plan goal target offsets must be non-negative relative day values.",
        targetType: "goal",
        targetId: goal.localId,
      });
    }
  }

  return issues;
}
