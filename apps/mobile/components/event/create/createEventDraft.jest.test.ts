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
  it("rejects executable planned sessions at the legacy events boundary", () => {
    expect(() =>
      buildCreateEventInput({
        activityPlanId: "11111111-1111-4111-8111-111111111111",
        activityPlanName: "Tempo Builder",
        mode: "planned",
        notes: "Threshold work",
        routeId: null,
        routeName: null,
        scheduledDate: "2026-06-02",
        title: "Tempo Builder",
      }),
    ).toThrow("Executable sessions must be created through plannedSessions.create.");
  });

  it.each([
    ["route-only", null, "route-1", "River Loop"],
    ["both", "plan-1", "route-1", "River Loop"],
  ])("rejects a %s planned event payload", (_label, activityPlanId, routeId, routeName) => {
    expect(() =>
      buildCreateEventInput({
        activityPlanId,
        activityPlanName: activityPlanId ? "Tempo Builder" : null,
        mode: "planned",
        notes: "",
        routeId,
        routeName,
        scheduledDate: "2026-06-02",
        title: "",
      }),
    ).toThrow("Executable sessions must be created through plannedSessions.create.");
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
        scheduledDate: "2026-06-02",
        title: "",
      }),
    ).toThrow("Executable sessions must be created through plannedSessions.create.");
  });

  it("keeps an initialized custom route payload", () => {
    const draft = createDefaultEventDraft({ mode: "custom" });
    if (draft.mode !== "custom") throw new Error("Expected a custom event draft");
    expect(
      buildCreateEventInput({
        ...draft,
        timezone: "UTC",
        routeId: "route-2",
        routeName: "Park Loop",
      }),
    ).toEqual(expect.objectContaining({ event_type: "custom", route_id: "route-2" }));
  });

  it("keeps immutable event type out of custom update patches", () => {
    const draft = createDefaultEventDraft({ mode: "custom" });
    if (draft.mode !== "custom") throw new Error("Expected a custom event draft");
    const patch = buildUpdatePatch({
      ...draft,
      timezone: "UTC",
      routeId: "route-2",
      routeName: "Park Loop",
    });

    expect(patch).toEqual(expect.objectContaining({ route_id: "route-2" }));
    expect(patch).not.toHaveProperty("event_type");
  });

  it("rejects planned-session updates at the legacy events boundary", () => {
    const routeOnly = {
      activityPlanId: null,
      activityPlanName: null,
      mode: "planned" as const,
      notes: "",
      routeId: "route-3",
      routeName: "Hill Loop",
      scheduledDate: "2026-06-02",
      title: "Hill Loop",
    };
    expect(() => buildUpdatePatch(routeOnly)).toThrow(
      "Executable sessions must be changed through plannedSessions mutations.",
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
      scheduledDate: "2026-06-02",
      title: "Tempo Builder",
    };
    const routeOnly = removeActivityPlanFromDraft(combined);

    expect(routeOnly).toEqual(expect.objectContaining({ mode: "planned", routeId: "route-1" }));
    expect(() => buildUpdatePatch(routeOnly)).toThrow(
      "Executable sessions must be changed through plannedSessions mutations.",
    );
  });

  it("preserves a plan-only event when removing its only executable link", () => {
    const planOnly = removeActivityPlanFromDraft({
      activityPlanId: "plan-1",
      activityPlanName: "Tempo Builder",
      mode: "planned",
      notes: "",
      routeId: null,
      routeName: null,
      scheduledDate: "2026-06-02",
      title: "Tempo Builder",
    });

    expect(planOnly).toEqual(expect.objectContaining({ mode: "planned", routeId: null }));
    expect(() => buildUpdatePatch(planOnly)).toThrow(
      "Executable sessions must be changed through plannedSessions mutations.",
    );
  });
});
