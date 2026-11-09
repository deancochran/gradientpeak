import { describe, expect, it } from "vitest";
import { calculatePlanAlignment, type PlanAlignmentSession } from "./plan-alignment";

const session = (overrides: Partial<PlanAlignmentSession> = {}): PlanAlignmentSession => ({
  status: "completed",
  linkedActivityId: "activity-1",
  linkedActivityExists: true,
  linkedActivityProfileOwned: true,
  plannedCommonLoad: 100,
  completedCommonLoad: 100,
  ...overrides,
});

describe("calculatePlanAlignment", () => {
  it("assesses a uniquely linked completion and scores over-target load symmetrically", () => {
    expect(calculatePlanAlignment([session({ completedCommonLoad: 130 })])).toMatchObject({
      status: "available",
      score: 75,
      completedSessions: 1,
      assessableSessions: 1,
      totalSessions: 1,
      completedActivityIds: ["activity-1"],
      assessableActivityIds: ["activity-1"],
      assessedPlannedCommonLoad: 100,
      assessedCompletedCommonLoad: 130,
    });
  });

  it("fails closed for unlinked, completed-without-link, duplicate, and missing evidence sessions", () => {
    expect(
      calculatePlanAlignment([session({ status: "scheduled", linkedActivityId: null })]).score,
    ).toBeNull();
    expect(calculatePlanAlignment([session({ linkedActivityId: null })]).completedSessions).toBe(0);
    expect(calculatePlanAlignment([session(), session({})])).toMatchObject({
      completedSessions: 0,
      assessableSessions: 0,
      unverifiedSessions: 2,
      completedActivityIds: [],
      assessableActivityIds: [],
      assessedPlannedCommonLoad: 0,
      assessedCompletedCommonLoad: 0,
    });
    expect(calculatePlanAlignment([session({ plannedCommonLoad: null })]).status).toBe(
      "unavailable",
    );
    expect(calculatePlanAlignment([session({ completedCommonLoad: null })]).score).toBeNull();
  });

  it("keeps an assessed subset partial and fails closed when global link occurrence is duplicated", () => {
    expect(
      calculatePlanAlignment([session(), session({ status: "scheduled", linkedActivityId: null })]),
    ).toMatchObject({
      status: "partial",
      score: 100,
      assessableSessions: 1,
      totalSessions: 2,
      unverifiedSessions: 1,
    });
    expect(calculatePlanAlignment([session({ linkedActivityOccurrenceCount: 2 })])).toMatchObject({
      status: "unavailable",
      completedActivityIds: [],
      assessableActivityIds: [],
      assessedPlannedCommonLoad: 0,
      assessedCompletedCommonLoad: 0,
    });
  });

  it("counts cancelled, skipped, and future link references when proving uniqueness", () => {
    expect(
      calculatePlanAlignment([
        session(),
        session({ status: "cancelled" }),
        session({ status: "skipped" }),
        session({ isFuture: true }),
      ]),
    ).toMatchObject({
      status: "unavailable",
      completedSessions: 0,
      assessableSessions: 0,
      totalSessions: 1,
      unverifiedSessions: 1,
      completedActivityIds: [],
      assessableActivityIds: [],
    });
  });

  it("excludes cancelled, skipped, and future sessions from the denominator", () => {
    expect(
      calculatePlanAlignment([
        session({ status: "cancelled" }),
        session({ status: "skipped" }),
        session({ isFuture: true }),
      ]),
    ).toMatchObject({
      status: "unavailable",
      score: null,
      completedSessions: 0,
      assessableSessions: 0,
      totalSessions: 0,
      unverifiedSessions: 0,
      completedActivityIds: [],
      assessableActivityIds: [],
    });
  });
});
