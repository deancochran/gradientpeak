import { describe, expect, it, vi } from "vitest";

vi.mock("../server-action-api", () => ({ createServerActionCaller: vi.fn() }));

import { goalActionSchema, updateEventActionSchema } from "./server-actions";

const eventId = "00000000-0000-4000-8000-000000000001";

describe("goal server action", () => {
  it("rejects impossible Gregorian target dates before calling the API", () => {
    expect(
      goalActionSchema.safeParse({
        activity_category: "run",
        priority: 5,
        profile_id: "11111111-1111-4111-8111-111111111111",
        target_date: "2026-02-30",
        target_sessions_per_week: 4,
        target_weeks: 8,
        title: "Impossible date",
      }).success,
    ).toBe(false);
  });
});

describe("calendar event update server action", () => {
  it("rejects a malformed single update without a scheduled date", () => {
    expect(
      updateEventActionSchema.safeParse({
        event_id: eventId,
        notes: "Keep this draft",
        title: "Updated event",
      }).success,
    ).toBe(false);
  });

  it.each(["future", "series"])("rejects removed %s-scope editing", (scope) => {
    expect(
      updateEventActionSchema.safeParse({
        event_id: eventId,
        notes: "Update the series notes",
        scope,
        title: "Updated event",
      }).success,
    ).toBe(false);
  });
});
