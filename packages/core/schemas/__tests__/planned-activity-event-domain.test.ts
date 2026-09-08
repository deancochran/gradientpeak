import { describe, expect, it } from "vitest";
import {
  customEventCreateSchema,
  eventCreateSchema,
  eventMutationScopeSchema,
  eventRecurrenceSchema,
  eventTypeInputSchema,
  eventUpdateSchema,
  genericEventPatchSchema,
  plannedActivityEventCreateSchema,
  plannedEventPatchSchema,
} from "../planned_activity";

const id = "e4e9d401-49dc-4f14-b8ab-2da517f7db1b";
const activityPlanId = "550e8400-e29b-41d4-a716-446655440000";
const routeId = "550e8400-e29b-41d4-a716-446655440001";

describe("personal and generic event mutation contracts", () => {
  it("rejects removed legacy event types and accepts current mutation scopes", () => {
    for (const value of ["planned_activity", "race", "rest_day", "imported"]) {
      expect(eventTypeInputSchema.safeParse(value).success).toBe(false);
    }
    expect(eventMutationScopeSchema.safeParse("single").success).toBe(true);
    expect(eventMutationScopeSchema.safeParse("future").success).toBe(true);
    expect(eventMutationScopeSchema.safeParse("series").success).toBe(true);
  });

  it("retains recurrence only for generic event creation", () => {
    const recurrence = {
      rule: "FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR",
      timezone: "America/New_York",
    };
    expect(eventRecurrenceSchema.safeParse(recurrence).success).toBe(true);
    expect(
      customEventCreateSchema.safeParse({
        event_type: "custom",
        title: "Team meeting",
        starts_at: "2026-03-12T16:30:00.000Z",
        timezone: "America/New_York",
        recurrence,
      }).success,
    ).toBe(true);
    expect(
      plannedActivityEventCreateSchema.safeParse({
        event_type: "planned",
        activity_plan_id: activityPlanId,
        title: "Threshold session",
        scheduled_date: "2026-03-12",
        recurrence,
      }).success,
    ).toBe(false);
  });

  it("accepts only a date key and content links for planned creation", () => {
    const current = {
      event_type: "planned" as const,
      activity_plan_id: activityPlanId,
      route_id: routeId,
      title: "Threshold session",
      scheduled_date: "2026-03-12",
    };
    expect(plannedActivityEventCreateSchema.safeParse(current).success).toBe(true);
    for (const legacyPatch of [
      { all_day: true },
      { starts_at: "2026-03-12T06:00:00.000Z" },
      { ends_at: "2026-03-12T07:00:00.000Z" },
      { timezone: "UTC" },
      { training_plan_id: id },
    ]) {
      expect(
        plannedActivityEventCreateSchema.safeParse({ ...current, ...legacyPatch }).success,
      ).toBe(false);
    }
    expect(eventCreateSchema.safeParse({ ...current, activity_plan_id: undefined }).success).toBe(
      true,
    );
  });

  it("keeps planned patches date-key-only", () => {
    expect(
      eventUpdateSchema.safeParse({
        id,
        patch: { scheduled_date: "2026-03-13", notes: "Moved" },
      }).success,
    ).toBe(true);
    expect(
      eventUpdateSchema.safeParse({ id, patch: { scheduled_date: "2026-03-13" } }).success,
    ).toBe(true);
    for (const legacyPatch of [
      { all_day: true },
      { starts_at: "2026-03-13T06:00:00.000Z" },
      { ends_at: null },
      { timezone: "UTC" },
      { recurrence: null },
      { training_plan_id: id },
    ]) {
      expect(plannedEventPatchSchema.safeParse(legacyPatch).success).toBe(false);
    }
  });

  it("preserves generic timed event semantics without admitting planned datetime fields", () => {
    expect(
      genericEventPatchSchema.safeParse({
        starts_at: "2026-03-13T06:00:00.000Z",
        timezone: "America/New_York",
        title: "Briefing",
      }).success,
    ).toBe(true);
    expect(genericEventPatchSchema.safeParse({ activity_plan_id: activityPlanId }).success).toBe(
      false,
    );
  });
});
