import {
  creationConstraintsSchema,
  type CreationConfigLocks,
  type CreationConstraints,
} from "../schemas/training_plan_structure";

export type ConstraintFieldPath =
  | "constraints.weekly_load_floor_tss"
  | "constraints.weekly_load_cap_tss"
  | "constraints.hard_rest_days"
  | "constraints.min_sessions_per_week"
  | "constraints.max_sessions_per_week"
  | "baseline_load.weekly_tss"
  | "availability_config.days";

export interface ConstraintConflict {
  code:
    | "weekly_load_floor_exceeds_cap"
    | "min_sessions_exceeds_max"
    | "min_sessions_exceeds_available_days"
    | "max_sessions_exceeds_available_days"
    | "baseline_below_floor"
    | "baseline_above_cap";
  severity: "blocking" | "warning";
  message: string;
  field_paths: ConstraintFieldPath[];
  suggestions: string[];
}

export interface ResolveConstraintConflictsInput {
  availability_training_days: number;
  baseline_weekly_tss: number;
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
    weekly_load_floor_tss: 120,
    weekly_load_cap_tss: 260,
    hard_rest_days: ["wednesday", "friday", "sunday"],
    min_sessions_per_week: 3,
    max_sessions_per_week: 4,
    max_single_session_duration_minutes: 90,
    goal_difficulty_preference: "conservative",
    ...input.defaults,
  });

  const locks = {
    weekly_load_floor_tss: input.locks?.weekly_load_floor_tss?.locked ?? false,
    weekly_load_cap_tss: input.locks?.weekly_load_cap_tss?.locked ?? false,
    hard_rest_days: input.locks?.hard_rest_days?.locked ?? false,
    min_sessions_per_week: input.locks?.min_sessions_per_week?.locked ?? false,
    max_sessions_per_week: input.locks?.max_sessions_per_week?.locked ?? false,
    max_single_session_duration_minutes:
      input.locks?.max_single_session_duration_minutes?.locked ?? false,
    goal_difficulty_preference:
      input.locks?.goal_difficulty_preference?.locked ?? false,
  };

  const weeklyLoadFloor = resolveValue(
    input.user_constraints?.weekly_load_floor_tss,
    input.confirmed_suggestions?.weekly_load_floor_tss,
    defaultConstraints.weekly_load_floor_tss,
    locks.weekly_load_floor_tss,
  );
  const weeklyLoadCap = resolveValue(
    input.user_constraints?.weekly_load_cap_tss,
    input.confirmed_suggestions?.weekly_load_cap_tss,
    defaultConstraints.weekly_load_cap_tss,
    locks.weekly_load_cap_tss,
  );
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
    weekly_load_floor_tss: weeklyLoadFloor.value,
    weekly_load_cap_tss: weeklyLoadCap.value,
    hard_rest_days: hardRestDays.value,
    min_sessions_per_week: minSessions.value,
    max_sessions_per_week: maxSessions.value,
    max_single_session_duration_minutes: maxSessionDuration.value,
    goal_difficulty_preference: goalDifficulty.value,
  });

  const conflicts: ConstraintConflict[] = [];

  if (
    resolvedConstraints.weekly_load_floor_tss !== undefined &&
    resolvedConstraints.weekly_load_cap_tss !== undefined &&
    resolvedConstraints.weekly_load_floor_tss >
      resolvedConstraints.weekly_load_cap_tss
  ) {
    conflicts.push({
      code: "weekly_load_floor_exceeds_cap",
      severity: "blocking",
      message: "Weekly load floor exceeds weekly load cap",
      field_paths: [
        "constraints.weekly_load_floor_tss",
        "constraints.weekly_load_cap_tss",
      ],
      suggestions: [
        "Lower weekly load floor",
        "Raise weekly load cap",
        "Unlock one of the load bound fields",
      ],
    });
  }

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

  if (
    resolvedConstraints.weekly_load_floor_tss !== undefined &&
    input.baseline_weekly_tss < resolvedConstraints.weekly_load_floor_tss
  ) {
    conflicts.push({
      code: "baseline_below_floor",
      severity: "blocking",
      message: "Baseline weekly load is below configured floor",
      field_paths: [
        "baseline_load.weekly_tss",
        "constraints.weekly_load_floor_tss",
      ],
      suggestions: ["Increase baseline weekly load", "Lower weekly load floor"],
    });
  }

  if (
    resolvedConstraints.weekly_load_cap_tss !== undefined &&
    input.baseline_weekly_tss > resolvedConstraints.weekly_load_cap_tss
  ) {
    conflicts.push({
      code: "baseline_above_cap",
      severity: "blocking",
      message: "Baseline weekly load exceeds configured cap",
      field_paths: [
        "baseline_load.weekly_tss",
        "constraints.weekly_load_cap_tss",
      ],
      suggestions: ["Reduce baseline weekly load", "Raise weekly load cap"],
    });
  }

  return {
    resolved_constraints: resolvedConstraints,
    conflicts,
    is_blocking: conflicts.some((conflict) => conflict.severity === "blocking"),
    precedence: {
      weekly_load_floor_tss: weeklyLoadFloor.source,
      weekly_load_cap_tss: weeklyLoadCap.source,
      hard_rest_days: hardRestDays.source,
      min_sessions_per_week: minSessions.source,
      max_sessions_per_week: maxSessions.source,
      max_single_session_duration_minutes: maxSessionDuration.source,
      goal_difficulty_preference: goalDifficulty.source,
    },
  };
}
