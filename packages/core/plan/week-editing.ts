import type { CanonicalTrainingPlanStructureSession } from "../schemas/training-plan-structure";

export const MAX_TRAINING_PLAN_SESSIONS = 366;

export type TrainingPlanWeekCopyResult =
  | { status: "copied"; sessions: CanonicalTrainingPlanStructureSession[] }
  | {
      status: "rejected";
      reason:
        | "destination_not_empty"
        | "destination_outside_plan_span"
        | "session_limit"
        | "source_empty";
    };

/** Copies one authored week with fresh identities; it never creates a repeating schedule. */
export function copyTrainingPlanWeek(input: {
  sessions: readonly CanonicalTrainingPlanStructureSession[];
  sourceWeekIndex: number;
  destinationWeekIndex: number;
  createId: () => string;
  durationWeeks?: number;
}): TrainingPlanWeekCopyResult {
  if (!Number.isInteger(input.sourceWeekIndex) || !Number.isInteger(input.destinationWeekIndex)) {
    throw new RangeError("Week indexes must be integers");
  }
  if (input.sourceWeekIndex < 0 || input.destinationWeekIndex < 0) {
    throw new RangeError("Week indexes must be non-negative");
  }
  if (input.durationWeeks !== undefined && input.destinationWeekIndex >= input.durationWeeks) {
    return { status: "rejected", reason: "destination_outside_plan_span" };
  }
  const sourceSessions = input.sessions.filter(
    (session) => Math.floor(session.offset_days / 7) === input.sourceWeekIndex,
  );
  if (sourceSessions.length === 0) return { status: "rejected", reason: "source_empty" };
  if (
    input.sessions.some(
      (session) => Math.floor(session.offset_days / 7) === input.destinationWeekIndex,
    )
  ) {
    return { status: "rejected", reason: "destination_not_empty" };
  }
  const copied = sourceSessions
    .sort((left, right) => left.offset_days - right.offset_days || left.id.localeCompare(right.id))
    .map((session) => ({
      ...session,
      id: input.createId(),
      offset_days: input.destinationWeekIndex * 7 + (session.offset_days % 7),
    }));
  if (input.sessions.length + copied.length > MAX_TRAINING_PLAN_SESSIONS) {
    return { status: "rejected", reason: "session_limit" };
  }
  return { status: "copied", sessions: [...input.sessions, ...copied] };
}

export function summarizeTrainingPlanWeek(input: {
  sessions: readonly CanonicalTrainingPlanStructureSession[];
  weekIndex: number;
}) {
  const byActivityCategory = Object.fromEntries(
    ["bike", "run", "swim", "strength", "other"].map((activityCategory) => [
      activityCategory,
      { knownDurationMinutes: 0, sessionCount: 0, unknownDurationSessionCount: 0 },
    ]),
  ) as Record<
    CanonicalTrainingPlanStructureSession["demand"]["activity_category"],
    { knownDurationMinutes: number; sessionCount: number; unknownDurationSessionCount: number }
  >;
  for (const session of input.sessions) {
    if (Math.floor(session.offset_days / 7) !== input.weekIndex) continue;
    const summary = byActivityCategory[session.demand.activity_category];
    summary.sessionCount += 1;
    if (session.demand.target_duration_minutes === null) summary.unknownDurationSessionCount += 1;
    else summary.knownDurationMinutes += session.demand.target_duration_minutes;
  }
  return byActivityCategory;
}
