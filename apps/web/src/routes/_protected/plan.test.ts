import { activityPlanStructureSchema, type CalendarProjectionItem } from "@repo/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../components/protected/plan-goal-form", () => ({
  PlanGoalForm: () => null,
}));

import { getScheduledWorkTypeLabel, getUpcomingScheduledWorkItems } from "./plan";

function calendarItem(
  overrides: Partial<CalendarProjectionItem> &
    Pick<CalendarProjectionItem, "id" | "kind" | "title">,
): CalendarProjectionItem {
  const kind = overrides.kind;
  const base: CalendarProjectionItem = {
    id: overrides.id,
    calendarDate: "2026-08-10",
    timing: { startsAt: null, endsAt: null, allDay: true, timezone: "UTC" },
    kind,
    title: overrides.title,
    subtitle: null,
    status: kind === "completed_activity" ? "completed" : "scheduled",
    navigation: {
      target:
        kind === "completed_activity"
          ? "activity"
          : kind === "group_event"
            ? "group_event"
            : kind === "goal"
              ? "goal"
              : "event",
      href: `/calendar/${overrides.id}`,
    },
    metrics: [],
    estimated: false,
    partial: false,
    plan: null,
    activity: null,
    event:
      kind === "planned_activity" || kind === "event"
        ? { type: kind === "event" ? "custom" : "planned", trainingPlanId: null }
        : null,
    groupEvent:
      kind === "group_event"
        ? { group: { id: "group-1", name: "Club" }, viewerRsvpStatus: null }
        : null,
    goal: kind === "goal" ? { typeLabel: "Race", objectiveSummary: "Finish" } : null,
  };
  return { ...base, ...overrides };
}

describe("Plan upcoming scheduled work projection", () => {
  it("renders only scheduled planned work with canonical dates and type labels", () => {
    const plannedActivity = calendarItem({
      id: "planned",
      kind: "planned_activity",
      title: "Tempo intervals",
      calendarDate: "2026-08-12",
      plan: {
        contractVersion: "scheduled-activity-plan-summary-v1",
        id: "plan-1",
        href: "/activity-plans/plan-1",
        name: "Tempo plan",
        description: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
        owner: null,
        activityCategory: "run",
        activityPlanRevision: 1,
        structure: activityPlanStructureSchema.parse({
          version: 3,
          activity_category: "run",
          segments: [
            {
              id: "00000000-0000-4000-8000-000000000001",
              role: "activity",
              name: "Run",
              intervals: [
                {
                  id: "00000000-0000-4000-8000-000000000002",
                  name: "Work",
                  repetitions: 1,
                  steps: [
                    {
                      id: "00000000-0000-4000-8000-000000000003",
                      name: "Tempo",
                      duration: { type: "time", seconds: 600 },
                      targets: [{ type: "RPE", intensity: 7 }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
        prescriptionQuantification: null,
        metrics: [],
        visibility: "private",
        isSystemTemplate: false,
        engagement: { likes: 0, viewerHasLiked: false },
        capabilities: {
          canLike: false,
          canEdit: true,
          canDelete: true,
          canDuplicate: true,
          canSchedule: true,
          canRecord: true,
        },
        schedule: {
          eventId: "event-1",
          calendarDate: "2026-08-12",
          startsAt: null,
          endsAt: null,
          allDay: true,
          status: "scheduled",
          trainingPlanId: null,
        },
      },
    });
    const customEvent = calendarItem({
      id: "custom",
      kind: "event",
      title: "Mobility",
      calendarDate: "2026-08-13",
    });
    const completed = calendarItem({ id: "completed", kind: "completed_activity", title: "Done" });
    const goal = calendarItem({ id: "goal", kind: "goal", title: "Race goal" });
    const groupEvent = calendarItem({ id: "group", kind: "group_event", title: "Club ride" });

    const result = getUpcomingScheduledWorkItems([
      completed,
      goal,
      plannedActivity,
      groupEvent,
      customEvent,
    ]);

    expect(result.map(({ id, calendarDate }) => ({ id, calendarDate }))).toEqual([
      { id: "planned", calendarDate: "2026-08-12" },
      { id: "custom", calendarDate: "2026-08-13" },
    ]);
    expect(result.map(getScheduledWorkTypeLabel)).toEqual(["run", "custom"]);
  });
});
