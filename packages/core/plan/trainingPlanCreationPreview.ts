import type { TrainingPlanSessionIntentType } from "./trainingPlanStructureProposal";

export type TrainingPlanCreationCheckSeverity = "info" | "warning";
export type TrainingPlanCreationAggregateStatus = "complete" | "partial" | "unavailable";

export type TrainingPlanCreationCheckCode =
  | "unassigned_sessions"
  | "dense_week"
  | "high_weekly_time"
  | "high_weekly_load"
  | "large_weekly_load_ramp"
  | "intent_mismatch"
  | "hard_session_spacing";

export type TrainingPlanCreationPreviewSessionIntentType = TrainingPlanSessionIntentType;

export interface TrainingPlanCreationPreviewSessionIntent {
  type: TrainingPlanCreationPreviewSessionIntentType;
  targetDurationSeconds?: number;
  targetLoad?: number;
}

export interface TrainingPlanCreationPreviewSession {
  offsetDays: number;
  assigned: boolean;
  intent?: TrainingPlanCreationPreviewSessionIntent;
  estimatedCommonLoad: number | null;
  estimatedDurationSeconds: number | null;
}

interface TrainingPlanCreationWeeklyPreviewBase {
  weekIndex: number;
  startOffsetDays: number;
  endOffsetDays: number;
  sessionCount: number;
  assignedSessionCount: number;
}

/** Weeks with known Load and duration subtotals remain directly chartable. */
export interface TrainingPlanCreationWeeklyPreview extends TrainingPlanCreationWeeklyPreviewBase {
  estimatedCommonLoad: number;
  commonLoadStatus: "complete" | "partial";
  estimatedDurationSeconds: number;
  durationStatus: "complete" | "partial";
}

/** Unavailable weeks are explicit and never projected into chartable Load as zero. */
export type TrainingPlanCreationUnavailableWeeklyPreview =
  | (TrainingPlanCreationWeeklyPreviewBase & {
      estimatedCommonLoad: null;
      commonLoadStatus: "unavailable";
      estimatedDurationSeconds: number | null;
      durationStatus: TrainingPlanCreationAggregateStatus;
    })
  | (TrainingPlanCreationWeeklyPreviewBase & {
      estimatedCommonLoad: number;
      commonLoadStatus: "complete" | "partial";
      estimatedDurationSeconds: null;
      durationStatus: "unavailable";
    });

type AnyTrainingPlanCreationWeeklyPreview =
  | TrainingPlanCreationWeeklyPreview
  | TrainingPlanCreationUnavailableWeeklyPreview;

export interface TrainingPlanCreationCheck {
  code: TrainingPlanCreationCheckCode;
  severity: TrainingPlanCreationCheckSeverity;
  message: string;
  weekIndex?: number;
}

export interface TrainingPlanCreationPreview {
  weeks: TrainingPlanCreationWeeklyPreview[];
  unavailableWeeks: TrainingPlanCreationUnavailableWeeklyPreview[];
  checks: TrainingPlanCreationCheck[];
  totalEstimatedLoad: number | null;
  totalLoadStatus: TrainingPlanCreationAggregateStatus;
  totalEstimatedDurationSeconds: number | null;
  totalDurationStatus: TrainingPlanCreationAggregateStatus;
}

export interface DeriveTrainingPlanCreationPreviewInput {
  sessions: TrainingPlanCreationPreviewSession[];
}

const HIGH_WEEKLY_COMMON_LOAD = 700;
const HIGH_WEEKLY_DURATION_SECONDS = 12 * 3600;
const DENSE_WEEK_SESSION_COUNT = 6;
const LARGE_COMMON_LOAD_RAMP_RATIO = 0.5;
const MIN_RAMP_BASE_COMMON_LOAD = 100;
const HARD_SESSION_COMMON_LOAD = 80;

function toWeekIndex(offsetDays: number) {
  return Math.max(0, Math.floor(offsetDays / 7));
}

function aggregateKnownValues(
  values: ReadonlyArray<number | null>,
): { value: number; status: "complete" | "partial" } | { value: null; status: "unavailable" } {
  if (values.length === 0) return { value: 0, status: "complete" };

  let value = 0;
  let knownValueCount = 0;
  for (const candidate of values) {
    if (candidate === null) continue;
    value += candidate;
    knownValueCount += 1;
  }

  if (knownValueCount === 0) return { value: null, status: "unavailable" };
  return {
    value,
    status: knownValueCount === values.length ? "complete" : "partial",
  };
}

export function deriveTrainingPlanCreationPreview(
  input: DeriveTrainingPlanCreationPreviewInput,
): TrainingPlanCreationPreview {
  const sessionsByWeekIndex = new Map<number, TrainingPlanCreationPreviewSession[]>();

  for (const session of input.sessions) {
    const weekIndex = toWeekIndex(session.offsetDays);
    const current = sessionsByWeekIndex.get(weekIndex) ?? [];
    current.push(session);
    sessionsByWeekIndex.set(weekIndex, current);
  }

  const allWeeks: AnyTrainingPlanCreationWeeklyPreview[] = [...sessionsByWeekIndex.entries()]
    .map(([weekIndex, sessions]) => {
      const commonLoad = aggregateKnownValues(
        sessions.map((session) => session.estimatedCommonLoad),
      );
      const duration = aggregateKnownValues(
        sessions.map((session) => session.estimatedDurationSeconds),
      );
      const common = {
        weekIndex,
        startOffsetDays: weekIndex * 7,
        endOffsetDays: weekIndex * 7 + 6,
        sessionCount: sessions.length,
        assignedSessionCount: sessions.filter((session) => session.assigned).length,
      };
      if (commonLoad.status === "unavailable") {
        return {
          ...common,
          estimatedCommonLoad: null,
          commonLoadStatus: "unavailable" as const,
          estimatedDurationSeconds: duration.value,
          durationStatus: duration.status,
        };
      }
      if (duration.status === "unavailable") {
        return {
          ...common,
          estimatedCommonLoad: commonLoad.value,
          commonLoadStatus: commonLoad.status,
          estimatedDurationSeconds: null,
          durationStatus: "unavailable" as const,
        };
      }
      return {
        ...common,
        estimatedCommonLoad: commonLoad.value,
        commonLoadStatus: commonLoad.status,
        estimatedDurationSeconds: duration.value,
        durationStatus: duration.status,
      };
    })
    .sort((left, right) => left.weekIndex - right.weekIndex);
  const weeks = allWeeks.filter(
    (week): week is TrainingPlanCreationWeeklyPreview =>
      week.commonLoadStatus !== "unavailable" && week.durationStatus !== "unavailable",
  );
  const unavailableWeeks = allWeeks.filter(
    (week): week is TrainingPlanCreationUnavailableWeeklyPreview =>
      week.commonLoadStatus === "unavailable" || week.durationStatus === "unavailable",
  );
  const checks: TrainingPlanCreationCheck[] = [];
  const unassignedCount = input.sessions.filter((session) => !session.assigned).length;

  if (unassignedCount > 0) {
    checks.push({
      code: "unassigned_sessions",
      severity: "info",
      message: `${unassignedCount} session${unassignedCount === 1 ? " needs" : "s need"} an activity plan assignment.`,
    });
  }

  for (const week of allWeeks) {
    if (week.sessionCount > DENSE_WEEK_SESSION_COUNT) {
      checks.push({
        code: "dense_week",
        severity: "warning",
        weekIndex: week.weekIndex,
        message: `Week ${week.weekIndex + 1} has ${week.sessionCount} sessions. Check recovery spacing.`,
      });
    }

    if (
      week.estimatedDurationSeconds !== null &&
      week.estimatedDurationSeconds > HIGH_WEEKLY_DURATION_SECONDS
    ) {
      checks.push({
        code: "high_weekly_time",
        severity: "warning",
        weekIndex: week.weekIndex,
        message: `Week ${week.weekIndex + 1} is over 12 estimated hours.`,
      });
    }

    if (week.estimatedCommonLoad !== null && week.estimatedCommonLoad > HIGH_WEEKLY_COMMON_LOAD) {
      checks.push({
        code: "high_weekly_load",
        severity: "warning",
        weekIndex: week.weekIndex,
        message: `Week ${week.weekIndex + 1} is over ${HIGH_WEEKLY_COMMON_LOAD} estimated Common Load.`,
      });
    }
  }

  const assignedSessions = [...input.sessions]
    .filter((session) => session.assigned)
    .sort((left, right) => left.offsetDays - right.offsetDays);

  for (const session of assignedSessions) {
    if (session.intent?.type === "endurance") {
      const duration = session.estimatedDurationSeconds;
      const load = session.estimatedCommonLoad;
      if (duration !== null && load !== null && duration > 0 && duration < 3600 && load < 60) {
        checks.push({
          code: "intent_mismatch",
          severity: "warning",
          weekIndex: toWeekIndex(session.offsetDays),
          message: `Day ${session.offsetDays + 1} is marked endurance but the assigned plan looks short or light.`,
        });
      }
    }

    if (
      session.intent?.type === "recovery" &&
      session.estimatedCommonLoad !== null &&
      session.estimatedCommonLoad > 50
    ) {
      checks.push({
        code: "intent_mismatch",
        severity: "warning",
        weekIndex: toWeekIndex(session.offsetDays),
        message: `Day ${session.offsetDays + 1} is marked recovery but the assigned plan looks demanding.`,
      });
    }
  }

  for (let index = 1; index < assignedSessions.length; index += 1) {
    const previous = assignedSessions[index - 1];
    const current = assignedSessions[index];
    if (!previous || !current || current.offsetDays - previous.offsetDays > 1) {
      continue;
    }

    const previousHard =
      (previous.estimatedCommonLoad !== null &&
        previous.estimatedCommonLoad >= HARD_SESSION_COMMON_LOAD) ||
      previous.intent?.type === "endurance" ||
      previous.intent?.type === "threshold";
    const currentHard =
      (current.estimatedCommonLoad !== null &&
        current.estimatedCommonLoad >= HARD_SESSION_COMMON_LOAD) ||
      current.intent?.type === "endurance" ||
      current.intent?.type === "threshold";
    if (previousHard && currentHard) {
      checks.push({
        code: "hard_session_spacing",
        severity: "warning",
        weekIndex: toWeekIndex(current.offsetDays),
        message: `Days ${previous.offsetDays + 1} and ${current.offsetDays + 1} are both demanding. Check recovery spacing.`,
      });
    }
  }

  for (let index = 1; index < allWeeks.length; index += 1) {
    const previousWeek = allWeeks[index - 1];
    const currentWeek = allWeeks[index];
    if (
      !previousWeek ||
      !currentWeek ||
      previousWeek.commonLoadStatus !== "complete" ||
      currentWeek.commonLoadStatus !== "complete" ||
      previousWeek.estimatedCommonLoad === null ||
      currentWeek.estimatedCommonLoad === null ||
      previousWeek.estimatedCommonLoad < MIN_RAMP_BASE_COMMON_LOAD
    ) {
      continue;
    }

    const rampRatio =
      (currentWeek.estimatedCommonLoad - previousWeek.estimatedCommonLoad) /
      previousWeek.estimatedCommonLoad;
    if (rampRatio > LARGE_COMMON_LOAD_RAMP_RATIO) {
      checks.push({
        code: "large_weekly_load_ramp",
        severity: "warning",
        weekIndex: currentWeek.weekIndex,
        message: `Week ${currentWeek.weekIndex + 1} increases estimated Common Load by more than 50%.`,
      });
    }
  }

  const totalLoad = aggregateKnownValues(
    input.sessions.map((session) => session.estimatedCommonLoad),
  );
  const totalDuration = aggregateKnownValues(
    input.sessions.map((session) => session.estimatedDurationSeconds),
  );

  return {
    weeks,
    unavailableWeeks,
    checks,
    totalEstimatedLoad: totalLoad.value,
    totalLoadStatus: totalLoad.status,
    totalEstimatedDurationSeconds: totalDuration.value,
    totalDurationStatus: totalDuration.status,
  };
}
