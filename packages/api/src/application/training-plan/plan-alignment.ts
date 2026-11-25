export type PlanAlignmentSession = {
  status: "scheduled" | "completed" | "cancelled" | "skipped" | "rescheduled" | "expired" | null;
  linkedActivityId: string | null | undefined;
  linkedActivityOccurrenceCount?: number;
  linkedActivityExists: boolean;
  linkedActivityProfileOwned: boolean;
  plannedCommonLoad: number | null;
  completedCommonLoad: number | null;
  isFuture?: boolean;
};

export type PlanAlignment = {
  status: "available" | "partial" | "unavailable";
  score: number | null;
  completedSessions: number;
  assessableSessions: number;
  totalSessions: number;
  unverifiedSessions: number;
};

export type PlanAlignmentCalculation = PlanAlignment & {
  completedActivityIds: string[];
  assessableActivityIds: string[];
  assessedPlannedCommonLoad: number;
  assessedCompletedCommonLoad: number;
};

function ratioScore(actual: number, target: number): number {
  const ratio = actual / target;
  if (ratio <= 1) return Math.max(0, Math.min(100, Math.round(ratio * 100)));
  if (ratio <= 1.2) return Math.max(0, Math.min(100, Math.round(100 - (ratio - 1) * 100)));
  return Math.max(0, Math.min(100, Math.round(80 - (ratio - 1.2) * 50)));
}

function isUsableCompletedCommonLoad(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isUsablePlannedCommonLoad(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasLinkedActivityId(
  session: PlanAlignmentSession,
): session is PlanAlignmentSession & { linkedActivityId: string } {
  return typeof session.linkedActivityId === "string" && session.linkedActivityId.length > 0;
}

/** Calculates plan alignment only from authoritative, unique event-to-activity completions. */
export function calculatePlanAlignment(sessions: PlanAlignmentSession[]): PlanAlignmentCalculation {
  const linkCounts = new Map<string, number>();
  for (const session of sessions) {
    if (session.linkedActivityId) {
      linkCounts.set(session.linkedActivityId, (linkCounts.get(session.linkedActivityId) ?? 0) + 1);
    }
  }
  const activeSessions = sessions.filter(
    (session) =>
      !session.isFuture && session.status !== "cancelled" && session.status !== "skipped",
  );

  const completed = activeSessions.filter(
    (session) =>
      session.status === "completed" &&
      hasLinkedActivityId(session) &&
      linkCounts.get(session.linkedActivityId) === 1 &&
      (session.linkedActivityOccurrenceCount === undefined ||
        session.linkedActivityOccurrenceCount === 1) &&
      session.linkedActivityExists &&
      session.linkedActivityProfileOwned,
  );
  const assessable = completed.filter(
    (session) =>
      isUsablePlannedCommonLoad(session.plannedCommonLoad) &&
      isUsableCompletedCommonLoad(session.completedCommonLoad),
  );
  const plannedCommonLoad = assessable.reduce(
    (sum, session) => sum + (session.plannedCommonLoad ?? 0),
    0,
  );
  const completedCommonLoad = assessable.reduce(
    (sum, session) => sum + (session.completedCommonLoad ?? 0),
    0,
  );
  const totalSessions = activeSessions.length;
  const assessableSessions = assessable.length;

  return {
    status:
      totalSessions === 0 || assessableSessions === 0
        ? "unavailable"
        : assessableSessions < totalSessions
          ? "partial"
          : "available",
    score:
      assessableSessions > 0 && plannedCommonLoad > 0
        ? ratioScore(completedCommonLoad, plannedCommonLoad)
        : null,
    completedSessions: completed.length,
    assessableSessions,
    totalSessions,
    unverifiedSessions: totalSessions - assessableSessions,
    completedActivityIds: completed.flatMap((session) =>
      hasLinkedActivityId(session) ? [session.linkedActivityId] : [],
    ),
    assessableActivityIds: assessable.flatMap((session) =>
      hasLinkedActivityId(session) ? [session.linkedActivityId] : [],
    ),
    assessedPlannedCommonLoad: plannedCommonLoad,
    assessedCompletedCommonLoad: completedCommonLoad,
  };
}
