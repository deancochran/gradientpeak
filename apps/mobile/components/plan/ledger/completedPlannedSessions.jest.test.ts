import type { CalendarProjectionItem } from "@repo/core";
import { completedPlannedSessionsForLedger } from "./completedPlannedSessions";

const completedSession = (
  overrides: Partial<CalendarProjectionItem> = {},
): CalendarProjectionItem => ({
  activity: null,
  calendarDate: "2026-04-15",
  estimated: false,
  event: null,
  goal: null,
  groupEvent: null,
  id: "calendar-item-1",
  kind: "planned_activity",
  metrics: [],
  navigation: { href: "/activities/activity-1", target: "activity" },
  partial: false,
  plan: null,
  plannedActual: null,
  plannedSession: {
    id: "session-1",
    lifecycle: {
      completion: {
        activityId: "activity-1",
        linkedAt: "2026-04-15T12:00:00.000Z",
        outcome: "full",
        state: "linked",
      },
      status: "completed",
    },
    planningDate: "2026-04-15",
    profileId: "profile-1",
    sessionRevision: 2,
    source: { kind: "direct", operationId: "operation-1" },
  },
  status: "completed",
  subtitle: null,
  timing: { allDay: true, endsAt: null, startsAt: null, timezone: "America/New_York" },
  title: "Completed session",
  ...overrides,
});

describe("completedPlannedSessionsForLedger", () => {
  it("keeps only completed sessions in the current ledger range with their durable session identity", () => {
    expect(
      completedPlannedSessionsForLedger([completedSession()], {
        periodEnd: "2026-04-15",
        periodStart: "2026-04-15",
      }),
    ).toEqual([
      {
        calendarDate: "2026-04-15",
        id: "session-1",
        metrics: [],
        plan: null,
        status: "completed",
        subtitle: null,
        title: "Completed session",
      },
    ]);
  });

  it("rejects scheduled, cancelled, and stale calendar items", () => {
    expect(
      completedPlannedSessionsForLedger(
        [
          completedSession({ status: "scheduled" }),
          completedSession({ status: "cancelled" }),
          completedSession({ calendarDate: "2026-04-16" }),
        ],
        { periodEnd: "2026-04-15", periodStart: "2026-04-15" },
      ),
    ).toEqual([]);
  });
});
