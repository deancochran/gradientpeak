import type { TrainingPlanSessionIntentType } from "./trainingPlanStructureProposal";

export type TrainingPlanCreationCheckSeverity = "info" | "warning";

export type TrainingPlanCreationCheckCode =
  | "unassigned_sessions"
  | "dense_week"
  | "high_weekly_time"
  | "high_weekly_tss"
  | "large_weekly_tss_ramp"
  | "intent_mismatch"
  | "hard_session_spacing";

export type TrainingPlanCreationPreviewSessionIntentType = TrainingPlanSessionIntentType;

export interface TrainingPlanCreationPreviewSessionIntent {
  type: TrainingPlanCreationPreviewSessionIntentType;
  targetDurationSeconds?: number;
  targetTss?: number;
}

export interface TrainingPlanCreationPreviewSession {
  offsetDays: number;
  assigned: boolean;
  intent?: TrainingPlanCreationPreviewSessionIntent;
  estimatedTss: number | null;
  estimatedDurationSeconds: number | null;
}

export interface TrainingPlanCreationWeeklyPreview {
  weekIndex: number;
  startOffsetDays: number;
  endOffsetDays: number;
  sessionCount: number;
  assignedSessionCount: number;
  estimatedTss: number;
  estimatedDurationSeconds: number;
}

export interface TrainingPlanCreationCheck {
  code: TrainingPlanCreationCheckCode;
  severity: TrainingPlanCreationCheckSeverity;
  message: string;
  weekIndex?: number;
}

export interface TrainingPlanCreationPreview {
  weeks: TrainingPlanCreationWeeklyPreview[];
  checks: TrainingPlanCreationCheck[];
  totalEstimatedTss: number;
  totalEstimatedDurationSeconds: number;
}

export interface DeriveTrainingPlanCreationPreviewInput {
  sessions: TrainingPlanCreationPreviewSession[];
}

const HIGH_WEEKLY_TSS = 700;
const HIGH_WEEKLY_DURATION_SECONDS = 12 * 3600;
const DENSE_WEEK_SESSION_COUNT = 6;
const LARGE_TSS_RAMP_RATIO = 0.5;
const MIN_RAMP_BASE_TSS = 100;
const HARD_SESSION_TSS = 80;

function toWeekIndex(offsetDays: number) {
  return Math.max(0, Math.floor(offsetDays / 7));
}

export function deriveTrainingPlanCreationPreview(
  input: DeriveTrainingPlanCreationPreviewInput,
): TrainingPlanCreationPreview {
  const weeksByIndex = new Map<number, TrainingPlanCreationWeeklyPreview>();

  for (const session of input.sessions) {
    const weekIndex = toWeekIndex(session.offsetDays);
    const current = weeksByIndex.get(weekIndex) ?? {
      weekIndex,
      startOffsetDays: weekIndex * 7,
      endOffsetDays: weekIndex * 7 + 6,
      sessionCount: 0,
      assignedSessionCount: 0,
      estimatedTss: 0,
      estimatedDurationSeconds: 0,
    };

    current.sessionCount += 1;
    current.assignedSessionCount += session.assigned ? 1 : 0;
    current.estimatedTss += session.estimatedTss ?? 0;
    current.estimatedDurationSeconds += session.estimatedDurationSeconds ?? 0;
    weeksByIndex.set(weekIndex, current);
  }

  const weeks = [...weeksByIndex.values()].sort((left, right) => left.weekIndex - right.weekIndex);
  const checks: TrainingPlanCreationCheck[] = [];
  const unassignedCount = input.sessions.filter((session) => !session.assigned).length;

  if (unassignedCount > 0) {
    checks.push({
      code: "unassigned_sessions",
      severity: "info",
      message: `${unassignedCount} session${unassignedCount === 1 ? " needs" : "s need"} an activity plan assignment.`,
    });
  }

  for (const week of weeks) {
    if (week.sessionCount > DENSE_WEEK_SESSION_COUNT) {
      checks.push({
        code: "dense_week",
        severity: "warning",
        weekIndex: week.weekIndex,
        message: `Week ${week.weekIndex + 1} has ${week.sessionCount} sessions. Check recovery spacing.`,
      });
    }

    if (week.estimatedDurationSeconds > HIGH_WEEKLY_DURATION_SECONDS) {
      checks.push({
        code: "high_weekly_time",
        severity: "warning",
        weekIndex: week.weekIndex,
        message: `Week ${week.weekIndex + 1} is over 12 estimated hours.`,
      });
    }

    if (week.estimatedTss > HIGH_WEEKLY_TSS) {
      checks.push({
        code: "high_weekly_tss",
        severity: "warning",
        weekIndex: week.weekIndex,
        message: `Week ${week.weekIndex + 1} is over ${HIGH_WEEKLY_TSS} estimated TSS.`,
      });
    }
  }

  const assignedSessions = [...input.sessions]
    .filter((session) => session.assigned)
    .sort((left, right) => left.offsetDays - right.offsetDays);

  for (const session of assignedSessions) {
    if (session.intent?.type === "endurance") {
      const duration = session.estimatedDurationSeconds ?? 0;
      const tss = session.estimatedTss ?? 0;
      if (duration > 0 && duration < 3600 && tss < 60) {
        checks.push({
          code: "intent_mismatch",
          severity: "warning",
          weekIndex: toWeekIndex(session.offsetDays),
          message: `Day ${session.offsetDays + 1} is marked endurance but the assigned plan looks short or light.`,
        });
      }
    }

    if (session.intent?.type === "recovery" && (session.estimatedTss ?? 0) > 50) {
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
      (previous.estimatedTss ?? 0) >= HARD_SESSION_TSS ||
      previous.intent?.type === "endurance" ||
      previous.intent?.type === "threshold";
    const currentHard =
      (current.estimatedTss ?? 0) >= HARD_SESSION_TSS ||
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

  for (let index = 1; index < weeks.length; index += 1) {
    const previousWeek = weeks[index - 1];
    const currentWeek = weeks[index];
    if (!previousWeek || !currentWeek || previousWeek.estimatedTss < MIN_RAMP_BASE_TSS) {
      continue;
    }

    const rampRatio =
      (currentWeek.estimatedTss - previousWeek.estimatedTss) / previousWeek.estimatedTss;
    if (rampRatio > LARGE_TSS_RAMP_RATIO) {
      checks.push({
        code: "large_weekly_tss_ramp",
        severity: "warning",
        weekIndex: currentWeek.weekIndex,
        message: `Week ${currentWeek.weekIndex + 1} increases estimated TSS by more than 50%.`,
      });
    }
  }

  return {
    weeks,
    checks,
    totalEstimatedTss: weeks.reduce((total, week) => total + week.estimatedTss, 0),
    totalEstimatedDurationSeconds: weeks.reduce(
      (total, week) => total + week.estimatedDurationSeconds,
      0,
    ),
  };
}
