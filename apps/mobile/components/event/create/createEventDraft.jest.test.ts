jest.mock("@/components/event/EventEditorCard", () => ({
  buildCreateStartsAt: () => new Date("2026-06-02T12:00:00.000Z"),
  buildRecurrenceFromFrequency: () => null,
}));

jest.mock("@/lib/calendar/eventSchedule", () => ({
  buildScheduledInstant: () => "2026-06-02T12:00:00.000Z",
  getDeviceTimeZone: () => "UTC",
}));

import {
  buildCreateEventInput,
  buildUpdatePatch,
  createDefaultEventDraft,
  removeActivityPlanFromDraft,
} from "./createEventDraft";

describe("buildCreateEventInput", () => {
  it("builds a plan-only planned event payload", () => {
    expect(
      buildCreateEventInput({
        activityPlanId: "11111111-1111-4111-8111-111111111111",
        activityPlanName: "Tempo Builder",
        mode: "planned",
        notes: "Threshold work",
        routeId: null,
        routeName: null,
        recurrenceEndDate: null,
        recurrenceFrequency: "none",
        scheduledDate: "2026-06-02",
        timezone: "UTC",
        title: "Tempo Builder",
      }),
    ).toEqual({
      activity_plan_id: "11111111-1111-4111-8111-111111111111",
      all_day: true,
      event_type: "planned",
      lifecycle: { status: "scheduled" },
      notes: "Threshold work",
      read_only: false,
      route_id: null,
      scheduled_date: "2026-06-02",
      timezone: "UTC",
      title: "Tempo Builder",
      training_plan_id: undefined,
    });
  });

  it.each([
    ["route-only", null, "route-1", "River Loop"],
    ["both", "plan-1", "route-1", "River Loop"],
  ])("builds a %s planned event payload", (_label, activityPlanId, routeId, routeName) => {
    expect(
      buildCreateEventInput({
        activityPlanId,
        activityPlanName: activityPlanId ? "Tempo Builder" : null,
        mode: "planned",
        notes: "",
        routeId,
        routeName,
        recurrenceEndDate: null,
        recurrenceFrequency: "none",
        scheduledDate: "2026-06-02",
        timezone: "UTC",
        title: "",
      }),
    ).toEqual(
      expect.objectContaining({
        activity_plan_id: activityPlanId,
        event_type: "planned",
        route_id: routeId,
      }),
    );
  });

  it("rejects a planned event without either linked resource", () => {
    expect(() =>
      buildCreateEventInput({
        activityPlanId: null,
        activityPlanName: null,
        mode: "planned",
        notes: "",
        routeId: null,
        routeName: null,
        recurrenceEndDate: null,
        recurrenceFrequency: "none",
        scheduledDate: "2026-06-02",
        timezone: "UTC",
        title: "",
      }),
    ).toThrow("Choose an activity plan, a route, or both");
  });

  it("keeps an initialized custom route payload", () => {
    const draft = createDefaultEventDraft({ mode: "custom" });
    expect(buildCreateEventInput({ ...draft, routeId: "route-2", routeName: "Park Loop" })).toEqual(
      expect.objectContaining({ event_type: "custom", route_id: "route-2" }),
    );
  });

  it("sends route attachment and explicit route clearing in update patches", () => {
    const routeOnly = {
      activityPlanId: null,
      activityPlanName: null,
      mode: "planned" as const,
      notes: "",
      routeId: "route-3",
      routeName: "Hill Loop",
      recurrenceEndDate: null,
      recurrenceFrequency: "none" as const,
      scheduledDate: "2026-06-02",
      timezone: "UTC",
      title: "Hill Loop",
    };
    expect(buildUpdatePatch(routeOnly)).toEqual(
      expect.objectContaining({ activity_plan_id: null, route_id: "route-3" }),
    );
    expect(buildUpdatePatch({ ...routeOnly, routeId: null, routeName: null })).toEqual(
      expect.objectContaining({ activity_plan_id: null, route_id: null }),
    );
  });

  it("keeps combined events planned and route-linked when their plan is removed", () => {
    const combined = {
      activityPlanId: "plan-1",
      activityPlanName: "Tempo Builder",
      mode: "planned" as const,
      notes: "",
      routeId: "route-1",
      routeName: "River Loop",
      recurrenceEndDate: null,
      recurrenceFrequency: "none" as const,
      scheduledDate: "2026-06-02",
      timezone: "UTC",
      title: "Tempo Builder",
    };
    const routeOnly = removeActivityPlanFromDraft(combined);

    expect(routeOnly).toEqual(expect.objectContaining({ mode: "planned", routeId: "route-1" }));
    expect(buildUpdatePatch(routeOnly)).toEqual(
      expect.objectContaining({
        activity_plan_id: null,
        event_type: "planned",
        route_id: "route-1",
      }),
    );
  });

  it("converts a plan-only event to custom when its plan is removed", () => {
    const planOnly = removeActivityPlanFromDraft({
      activityPlanId: "plan-1",
      activityPlanName: "Tempo Builder",
      mode: "planned",
      notes: "",
      routeId: null,
      routeName: null,
      recurrenceEndDate: null,
      recurrenceFrequency: "none",
      scheduledDate: "2026-06-02",
      timezone: "UTC",
      title: "Tempo Builder",
    });

    expect(planOnly).toEqual(expect.objectContaining({ mode: "custom", routeId: null }));
    expect(buildUpdatePatch(planOnly)).toEqual(
      expect.objectContaining({ activity_plan_id: null, event_type: "custom", route_id: null }),
    );
  });
});
