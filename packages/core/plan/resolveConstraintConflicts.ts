import {
  creationConstraintsSchema,
  type CreationConfigLocks,
  type CreationConstraints,
} from "../schemas/training_plan_structure";

export type ConstraintFieldPath =
  | "constraints.hard_rest_days"
  | "constraints.min_sessions_per_week"
  | "constraints.max_sessions_per_week"
  | "availability_config.days";

export interface ConstraintConflict {
  code:
    | "min_sessions_exceeds_max"
    | "min_sessions_exceeds_available_days"
    | "max_sessions_exceeds_available_days";
  severity: "blocking" | "warning";
  message: string;
  field_paths: ConstraintFieldPath[];
  suggestions: string[];
}

export interface ResolveConstraintConflictsInput {
  availability_training_days: number;
  user_constraints?: Partial<CreationConstraints>;
  confirmed_suggestions?: Partial<CreationConstraints>;
  defaults?: Partial<CreationConstraints>;
  locks?: Partial<CreationConfigLocks>;
}

export interface ConstraintResolutionResult {
  resolved_constraints: CreationConstraints;
  conflicts: ConstraintConflict[];
  is_blocking: boolean;
  precedence: Record<
    keyof CreationConstraints,
    "user" | "suggested" | "default"
  >;
}

function resolveValue<T>(
  userValue: T | undefined,
  suggestedValue: T | undefined,
  defaultValue: T,
  isLocked: boolean,
): { value: T; source: "user" | "suggested" | "default" } {
  if (isLocked && userValue !== undefined) {
    return { value: userValue, source: "user" };
  }

  if (userValue !== undefined) {
    return { value: userValue, source: "user" };
  }

  if (suggestedValue !== undefined) {
    return { value: suggestedValue, source: "suggested" };
  }

  return { value: defaultValue, source: "default" };
}

/**
 * Resolves creation constraints using deterministic precedence and reports conflicts.
 *
 * Precedence order:
 * 1) locked user values
 * 2) unlocked user values
 * 3) confirmed suggestions
 * 4) defaults
 */
export function resolveConstraintConflicts(
  input: ResolveConstraintConflictsInput,
): ConstraintResolutionResult {
  const defaultConstraints = creationConstraintsSchema.parse({
    hard_rest_days: ["wednesday", "friday", "sunday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "conservative",
    ...input.defaults,
  });

  const locks = {
    hard_rest_days: input.locks?.hard_rest_days?.locked ?? false,
    min_sessions_per_week: input.locks?.min_sessions_per_week?.locked ?? false,
    max_sessions_per_week: input.locks?.max_sessions_per_week?.locked ?? false,
    max_single_session_duration_minutes:
      input.locks?.max_single_session_duration_minutes?.locked ?? false,
    goal_difficulty_preference:
      input.locks?.goal_difficulty_preference?.locked ?? false,
  };

  const hardRestDays = resolveValue(
    input.user_constraints?.hard_rest_days,
    input.confirmed_suggestions?.hard_rest_days,
    defaultConstraints.hard_rest_days,
    locks.hard_rest_days,
  );
  const minSessions = resolveValue(
    input.user_constraints?.min_sessions_per_week,
    input.confirmed_suggestions?.min_sessions_per_week,
    defaultConstraints.min_sessions_per_week,
    locks.min_sessions_per_week,
  );
  const maxSessions = resolveValue(
    input.user_constraints?.max_sessions_per_week,
    input.confirmed_suggestions?.max_sessions_per_week,
    defaultConstraints.max_sessions_per_week,
    locks.max_sessions_per_week,
  );
  const maxSessionDuration = resolveValue(
    input.user_constraints?.max_single_session_duration_minutes,
    input.confirmed_suggestions?.max_single_session_duration_minutes,
    defaultConstraints.max_single_session_duration_minutes,
    locks.max_single_session_duration_minutes,
  );
  const goalDifficulty = resolveValue(
    input.user_constraints?.goal_difficulty_preference,
    input.confirmed_suggestions?.goal_difficulty_preference,
    defaultConstraints.goal_difficulty_preference,
    locks.goal_difficulty_preference,
  );

  const resolvedConstraints = creationConstraintsSchema.parse({
    hard_rest_days: hardRestDays.value,
    min_sessions_per_week: minSessions.value,
    max_sessions_per_week: maxSessions.value,
    max_single_session_duration_minutes: maxSessionDuration.value,
    goal_difficulty_preference: goalDifficulty.value,
  });

  const conflicts: ConstraintConflict[] = [];

  if (
    resolvedConstraints.min_sessions_per_week !== undefined &&
    resolvedConstraints.max_sessions_per_week !== undefined &&
    resolvedConstraints.min_sessions_per_week >
      resolvedConstraints.max_sessions_per_week
  ) {
    conflicts.push({
      code: "min_sessions_exceeds_max",
      severity: "blocking",
      message: "Minimum sessions exceed maximum sessions",
      field_paths: [
        "constraints.min_sessions_per_week",
        "constraints.max_sessions_per_week",
      ],
      suggestions: ["Lower minimum sessions", "Raise maximum sessions"],
    });
  }

  if (
    resolvedConstraints.min_sessions_per_week !== undefined &&
    resolvedConstraints.min_sessions_per_week > input.availability_training_days
  ) {
    conflicts.push({
      code: "min_sessions_exceeds_available_days",
      severity: "blocking",
      message:
        "Minimum sessions exceed available training days from availability/rest constraints",
      field_paths: [
        "constraints.min_sessions_per_week",
        "availability_config.days",
        "constraints.hard_rest_days",
      ],
      suggestions: [
        "Reduce minimum sessions",
        "Increase available training days",
        "Relax hard rest day constraints",
      ],
    });
  }

  if (
    resolvedConstraints.max_sessions_per_week !== undefined &&
    resolvedConstraints.max_sessions_per_week > input.availability_training_days
  ) {
    conflicts.push({
      code: "max_sessions_exceeds_available_days",
      severity: "blocking",
      message:
        "Maximum sessions exceed available training days from availability/rest constraints",
      field_paths: [
        "constraints.max_sessions_per_week",
        "availability_config.days",
        "constraints.hard_rest_days",
      ],
      suggestions: [
        "Reduce maximum sessions",
        "Increase available training days",
        "Relax hard rest day constraints",
      ],
    });
  }

  return {
    resolved_constraints: resolvedConstraints,
    conflicts,
    is_blocking: conflicts.some((conflict) => conflict.severity === "blocking"),
    precedence: {
      hard_rest_days: hardRestDays.source,
      min_sessions_per_week: minSessions.source,
      max_sessions_per_week: maxSessions.source,
      max_single_session_duration_minutes: maxSessionDuration.source,
      goal_difficulty_preference: goalDifficulty.source,
    },
  };
}
