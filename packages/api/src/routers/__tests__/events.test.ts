import { eventCreateSchema, eventUpdateSchema } from "@repo/core";
import { describe, expect, it } from "vitest";

describe("generic event router contract", () => {
  it("accepts custom and race events only", () => {
    expect(
      eventCreateSchema.safeParse({
        event_type: "custom",
        title: "Reminder",
        starts_at: "2026-08-01T09:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      eventCreateSchema.safeParse({
        event_type: "planned",
        title: "Activity",
        starts_at: "2026-08-01T09:00:00.000Z",
      }).success,
    ).toBe(false);
  });
  it("rejects executable link patches", () => {
    expect(
      eventUpdateSchema.safeParse({
        id: "11111111-1111-4111-8111-111111111111",
        patch: { activity_plan_id: "22222222-2222-4222-8222-222222222222" },
      }).success,
    ).toBe(false);
  });
});
