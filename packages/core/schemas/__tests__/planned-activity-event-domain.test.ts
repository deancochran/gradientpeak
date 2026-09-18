import { describe, expect, it } from "vitest";
import { eventCreateSchema, eventTypeInputSchema, eventUpdateSchema } from "../planned_activity";

describe("generic event mutation contracts", () => {
  it("allows only non-executable event types", () => {
    expect(eventTypeInputSchema.safeParse("planned").success).toBe(false);
    expect(
      eventCreateSchema.safeParse({
        event_type: "planned",
        title: "Run",
        starts_at: "2026-03-12T16:30:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      eventCreateSchema.safeParse({
        event_type: "custom",
        title: "Meeting",
        starts_at: "2026-03-12T16:30:00.000Z",
      }).success,
    ).toBe(true);
  });
  it("rejects executable links on generic updates", () => {
    expect(
      eventUpdateSchema.safeParse({
        id: "e4e9d401-49dc-4f14-b8ab-2da517f7db1b",
        patch: { activity_plan_id: "550e8400-e29b-41d4-a716-446655440000" },
      }).success,
    ).toBe(false);
  });
});
