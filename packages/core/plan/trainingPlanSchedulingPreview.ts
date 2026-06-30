import type { TrainingPlanSessionIntentType } from "./trainingPlanStructureProposal";

export type TrainingPlanSchedulingConflictCode =
  | "non_preferred_day"
  | "multiple_sessions_same_day"
  | "hard_session_spacing";

export type TrainingPlanSchedulingPreviewInputSession = {
  id: string;
  label: string;
  offsetDays: number;
  estimatedTss: number | null;
  intentType?: TrainingPlanSessionIntentType;
};

export type TrainingPlanSchedulingPreviewSession = TrainingPlanSchedulingPreviewInputSession & {
  date: string;
  weekIndex: number;
  weekday: number;
  conflictCodes: TrainingPlanSchedulingConflictCode[];
};

export type TrainingPlanSchedulingPreviewWeek = {
  weekIndex: number;
  startDate: string;
  endDate: string;
  sessions: TrainingPlanSchedulingPreviewSession[];
};

export type TrainingPlanSchedulingPreviewCheck = {
  code: TrainingPlanSchedulingConflictCode;
  message: string;
  sessionId?: string;
  weekIndex?: number;
};

export type TrainingPlanSchedulingPreview = {
  sessions: TrainingPlanSchedulingPreviewSession[];
  weeks: TrainingPlanSchedulingPreviewWeek[];
  checks: TrainingPlanSchedulingPreviewCheck[];
};

export type DeriveTrainingPlanSchedulingPreviewInput = {
  startDate: string;
  preferredWeekdays: number[];
  sessionDateOverrides: Record<string, string>;
  sessions: TrainingPlanSchedulingPreviewInputSession[];
};

const HARD_SESSION_TSS = 80;

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = parseDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateKey(date);
}

function getUtcWeekday(dateKey: string): number {
  return parseDateKey(dateKey).getUTCDay();
}

function getWeekIndex(startDate: string, date: string): number {
  return Math.max(
    0,
    Math.floor((parseDateKey(date).getTime() - parseDateKey(startDate).getTime()) / 86_400_000 / 7),
  );
}

function isHardSession(session: TrainingPlanSchedulingPreviewInputSession): boolean {
  return (
    (session.estimatedTss ?? 0) >= HARD_SESSION_TSS ||
    session.intentType === "endurance" ||
    session.intentType === "threshold"
  );
}

export function deriveTrainingPlanSchedulingPreview(
  input: DeriveTrainingPlanSchedulingPreviewInput,
): TrainingPlanSchedulingPreview {
  const preferredWeekdays = new Set(input.preferredWeekdays);
  const sessions = [...input.sessions]
    .map((session) => {
      const date =
        input.sessionDateOverrides[session.id] ??
        addDaysToDateKey(input.startDate, session.offsetDays);
      return {
        ...session,
        date,
        weekIndex: getWeekIndex(input.startDate, date),
        weekday: getUtcWeekday(date),
        conflictCodes: [] as TrainingPlanSchedulingConflictCode[],
      };
    })
    .sort((left, right) => {
      if (left.date === right.date) {
        return left.id.localeCompare(right.id);
      }
      return left.date.localeCompare(right.date);
    });

  const checks: TrainingPlanSchedulingPreviewCheck[] = [];
  const sessionsByDate = new Map<string, TrainingPlanSchedulingPreviewSession[]>();

  for (const previewSession of sessions) {
    const current = sessionsByDate.get(previewSession.date) ?? [];
    current.push(previewSession);
    sessionsByDate.set(previewSession.date, current);

    if (preferredWeekdays.size > 0 && !preferredWeekdays.has(previewSession.weekday)) {
      previewSession.conflictCodes.push("non_preferred_day");
      checks.push({
        code: "non_preferred_day",
        sessionId: previewSession.id,
        weekIndex: previewSession.weekIndex,
        message: `${previewSession.label} lands outside preferred training days.`,
      });
    }
  }

  for (const [date, dateSessions] of sessionsByDate) {
    if (dateSessions.length <= 1) {
      continue;
    }

    for (const previewSession of dateSessions) {
      previewSession.conflictCodes.push("multiple_sessions_same_day");
    }
    checks.push({
      code: "multiple_sessions_same_day",
      sessionId: dateSessions[0]?.id,
      weekIndex: dateSessions[0]?.weekIndex,
      message: `${dateSessions.length} sessions are scheduled on ${date}.`,
    });
  }

  for (let index = 1; index < sessions.length; index += 1) {
    const previous = sessions[index - 1];
    const current = sessions[index];
    if (!previous || !current || !isHardSession(previous) || !isHardSession(current)) {
      continue;
    }

    const dayGap =
      (parseDateKey(current.date).getTime() - parseDateKey(previous.date).getTime()) / 86_400_000;
    if (dayGap <= 1) {
      current.conflictCodes.push("hard_session_spacing");
      checks.push({
        code: "hard_session_spacing",
        sessionId: current.id,
        weekIndex: current.weekIndex,
        message: `${previous.label} and ${current.label} are demanding sessions on adjacent days.`,
      });
    }
  }

  const weeksByIndex = new Map<number, TrainingPlanSchedulingPreviewWeek>();
  for (const previewSession of sessions) {
    const week = weeksByIndex.get(previewSession.weekIndex) ?? {
      weekIndex: previewSession.weekIndex,
      startDate: addDaysToDateKey(input.startDate, previewSession.weekIndex * 7),
      endDate: addDaysToDateKey(input.startDate, previewSession.weekIndex * 7 + 6),
      sessions: [],
    };
    week.sessions.push(previewSession);
    weeksByIndex.set(previewSession.weekIndex, week);
  }

  return {
    sessions,
    weeks: [...weeksByIndex.values()].sort((left, right) => left.weekIndex - right.weekIndex),
    checks,
  };
}
