import { describe, expect, it } from "vitest";
import { calendarProjectionItemSchema } from "../contracts/read-projections";

import { deriveCalendarDayVisualState, describeCalendarDayVisualState } from "./daily-visual-state";

const metric = (
  key: "common_load" | "normalized_intensity",
  value: number | null,
  status: "available" | "partial" | "unavailable" = "available",
) =>
  status === "unavailable"
    ? { key, label: key, status, value: null, unit: "score", reason: "not_recorded" }
    : {
        key,
        label: key,
        status,
        value: value ?? 0,
        unit: "score",
        reason: status === "partial" ? "partial_recording" : null,
      };

function item(input: {
  id: string;
  kind: "planned_activity" | "completed_activity" | "event";
  status: "scheduled" | "completed" | "cancelled" | "expired";
  metrics?: ReturnType<typeof metric>[];
  partial?: boolean;
  eventType?: "planned" | "race_target" | "custom";
  plannedLoad?: number;
}) {
  return calendarProjectionItemSchema.parse({
    id: input.id,
    calendarDate: "2026-08-19",
    timing: { startsAt: null, endsAt: null, allDay: true, timezone: "America/Denver" },
    kind: input.kind,
    title: input.id,
    subtitle: null,
    status: input.status,
    navigation: {
      target: input.kind === "completed_activity" ? "activity" : "event",
      href: `/calendar/${input.id}`,
    },
    metrics: input.metrics ?? [],
    estimated: input.kind === "planned_activity" && input.status !== "completed",
    partial: input.partial ?? false,
    plan:
      input.plannedLoad === undefined
        ? null
        : {
            contractVersion: "scheduled-activity-plan-summary-v1",
            id: `plan-${input.id}`,
            href: `/activity-plans/plan-${input.id}`,
            name: "Planned session",
            description: null,
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            owner: null,
            activityCategory: "run",
            activityPlanRevision: 1,
            structure: {
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
                          name: "Work",
                          duration: { type: "time", seconds: 1_800 },
                          targets: [{ type: "RPE", intensity: 6 }],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            metrics: [metric("common_load", input.plannedLoad, "partial")],
            visibility: "private",
            isSystemTemplate: false,
            engagement: { likes: 0, viewerHasLiked: false },
            capabilities: {
              canLike: true,
              canEdit: false,
              canDelete: false,
              canDuplicate: false,
              canSchedule: true,
              canRecord: false,
            },
            schedule: {
              eventId: input.id,
              calendarDate: "2026-08-19",
              startsAt: null,
              endsAt: null,
              allDay: true,
              status: input.status,
              trainingPlanId: null,
            },
          },
    activity:
      input.kind === "completed_activity"
        ? {
            contractVersion: "activity-display-v1",
            id: input.id,
            href: `/activities/${input.id}`,
            owner: { id: "profile-1", username: null, avatarUrl: null },
            time: { startedAt: "2026-08-19T12:00:00.000Z", finishedAt: null },
            activityComposition: { kind: "single", categories: ["run"] },
            title: input.id,
            notes: null,
            metrics: input.metrics ?? [],
            visibility: "private",
            engagement: { likes: 0, comments: 0, viewerHasLiked: false },
            capabilities: {
              canLike: true,
              canComment: true,
              canShare: false,
              canEdit: true,
              canDelete: true,
              hasRoute: false,
            },
          }
        : null,
    event:
      input.kind === "planned_activity" || input.kind === "event"
        ? {
            type:
              input.kind === "planned_activity" ? "planned" : (input.eventType ?? "race_target"),
            trainingPlanId: null,
          }
        : null,
    groupEvent: null,
    goal: null,
  });
}

describe("deriveCalendarDayVisualState", () => {
  it("keeps completed-only training distinct from planned adherence", () => {
    const state = deriveCalendarDayVisualState([
      item({
        id: "unlinked-run",
        kind: "completed_activity",
        status: "completed",
        metrics: [metric("common_load", 42), metric("normalized_intensity", 0.72)],
      }),
    ]);

    expect(state).toMatchObject({
      treatment: "unplanned_completed",
      adherence: "unplanned",
      counts: { completedAsPlanned: 0, completedWithoutPlan: 1 },
      completedLoad: { depth: "half", coverage: "available", value: 42 },
      intensity: { family: "endurance", source: "completed" },
      signal: { kind: "completed", loadDepth: "half" },
    });
  });

  it.each([
    ["scheduled", "planned", "planned"],
    ["expired", "missed", "missed"],
    ["cancelled", "cancelled", "cancelled"],
  ] as const)("maps a %s plan to structural and adherence states", (status, treatment, adherence) => {
    const state = deriveCalendarDayVisualState([
      item({
        id: status,
        kind: "planned_activity",
        status,
        metrics: [
          metric("common_load", 60, "partial"),
          metric("normalized_intensity", 0.9, "partial"),
        ],
      }),
    ]);

    expect(state).toMatchObject({
      treatment,
      adherence,
      signal: { kind: status === "cancelled" ? "rest" : "planned" },
    });
    if (status !== "cancelled") {
      expect(state.intensity).toMatchObject({ family: "tempo", source: "planned_estimate" });
    }
  });

  it("does not turn unavailable completed metrics into zero", () => {
    const state = deriveCalendarDayVisualState([
      item({
        id: "unknown",
        kind: "completed_activity",
        status: "completed",
        metrics: [metric("common_load", null, "unavailable")],
      }),
    ]);

    expect(state.completedLoad).toEqual({ depth: "unknown", coverage: "unavailable", value: null });
    expect(describeCalendarDayVisualState(state)).toContain("Completed load unavailable");
  });

  it("marks a linked completion partial when observed load is well below its plan estimate", () => {
    const state = deriveCalendarDayVisualState([
      item({
        id: "short-session",
        kind: "planned_activity",
        status: "completed",
        plannedLoad: 100,
        metrics: [metric("common_load", 40), metric("normalized_intensity", 0.9)],
      }),
    ]);

    expect(state).toMatchObject({
      treatment: "partial",
      adherence: "partial",
      counts: { completedAsPlanned: 1, partiallyCompleted: 1 },
      completedLoad: { value: 40 },
      signal: { kind: "completed", loadDepth: "half" },
    });
  });

  it("combines multiple sessions without hiding partial, missed, or mixed intensity evidence", () => {
    const state = deriveCalendarDayVisualState([
      item({
        id: "easy",
        kind: "completed_activity",
        status: "completed",
        metrics: [metric("common_load", 20), metric("normalized_intensity", 0.55)],
      }),
      item({
        id: "hard",
        kind: "completed_activity",
        status: "completed",
        metrics: [metric("common_load", 100, "partial"), metric("normalized_intensity", 1.05)],
      }),
      item({ id: "missed", kind: "planned_activity", status: "expired" }),
    ]);

    expect(state).toMatchObject({
      sessionCount: 3,
      treatment: "partial",
      adherence: "missed",
      completedLoad: { depth: "three_quarters", coverage: "partial", value: 120 },
      intensity: { family: "mixed", coverage: "available", source: "completed" },
      signal: {
        kind: "completed_with_unaccounted_plan",
        loadDepth: "three_quarters",
      },
    });
  });

  it("ignores non-training calendar objects while retaining them for accessibility", () => {
    const state = deriveCalendarDayVisualState([
      item({
        id: "appointment",
        kind: "event",
        status: "scheduled",
        eventType: "custom",
      }),
    ]);

    expect(state).toMatchObject({ sessionCount: 0, otherItemCount: 1 });
    expect(state.signal).toEqual({ kind: "rest", loadDepth: "none" });
    expect(describeCalendarDayVisualState(state)).toContain("1 other calendar item");
  });

  it("lets a goal date supersede planned and completed calendar signals", () => {
    const base = item({
      id: "goal",
      kind: "event",
      status: "scheduled",
      eventType: "custom",
    });
    const goal = calendarProjectionItemSchema.parse({
      ...base,
      kind: "goal",
      status: "active",
      navigation: { target: "goal", href: "/goals/goal" },
      event: null,
      goal: { typeLabel: "Race", objectiveSummary: "Finish" },
    });

    const state = deriveCalendarDayVisualState([
      goal,
      item({
        id: "completed",
        kind: "completed_activity",
        status: "completed",
        metrics: [metric("common_load", 80)],
      }),
      item({ id: "planned", kind: "planned_activity", status: "scheduled" }),
    ]);

    expect(state.signal).toEqual({ kind: "goal", loadDepth: "none" });
    expect(describeCalendarDayVisualState(state)).toContain("Goal date");
  });
});
