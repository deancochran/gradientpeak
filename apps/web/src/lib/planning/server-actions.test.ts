import type { CanonicalGoalObjective } from "@repo/core";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock("../server-action-api", () => ({
  createServerActionCaller: async () => ({ goals: mocks }),
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    validator: (schema: { parse: (value: unknown) => unknown }) => ({
      handler: (handler: (context: { data: unknown }) => unknown) => (input: { data: unknown }) =>
        handler({ data: schema.parse(input.data) }),
    }),
    handler: (handler: unknown) => handler,
  }),
}));

import {
  createPlanGoalAction,
  goalActionSchema,
  updateEventActionSchema,
  updatePlanGoalAction,
} from "./server-actions";

afterEach(() => {
  mocks.create.mockReset();
  mocks.update.mockReset();
});

const eventId = "00000000-0000-4000-8000-000000000001";

describe("goal server action", () => {
  const header = {
    activity_category: "run" as const,
    priority: 5,
    profile_id: "11111111-1111-4111-8111-111111111111",
    target_date: "2026-11-01",
    title: "Goal",
  };
  it.each([
    {
      type: "event_performance",
      activity_category: "run",
      distance_m: 42195.123,
      target_time_s: 14400,
    },
    { type: "completion", distance_m: 25.123 },
    { type: "threshold", metric: "pace", value: 3.123456 },
    { type: "threshold", metric: "power", value: 250.125 },
    { type: "threshold", metric: "hr", value: 170.125 },
    { type: "consistency", target_weeks: 6 },
  ] satisfies CanonicalGoalObjective[])("delegates canonical variant %# to both API mutations", async (target_payload) => {
    const payload = { ...header, target_payload };
    expect((await createPlanGoalAction({ data: payload })).status).toBe("success");
    expect(mocks.create).toHaveBeenCalledWith(payload);
    expect((await updatePlanGoalAction({ data: { ...payload, goal_id: eventId } })).status).toBe(
      "success",
    );
    const { profile_id: _profile, ...update } = payload;
    expect(mocks.update).toHaveBeenCalledWith({ id: eventId, data: update });
  });

  it("rejects snapshot transport, malformed targets, and mismatched categories", () => {
    const payload = { ...header, target_payload: { type: "completion", distance_m: 25 } };
    expect(
      goalActionSchema.safeParse({ ...payload, originalGoal: { profile_id: header.profile_id } })
        .success,
    ).toBe(false);
    expect(
      goalActionSchema.safeParse({
        ...payload,
        target_payload: { type: "completion", duration_s: "bad" },
      }).success,
    ).toBe(false);
    expect(
      goalActionSchema.safeParse({
        ...payload,
        target_payload: {
          type: "threshold",
          metric: "power",
          activity_category: "bike",
          value: 250,
        },
      }).success,
    ).toBe(false);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns an API authorization failure instead of trusting editing context", async () => {
    mocks.update.mockRejectedValue(new Error("Goal not found"));
    const result = await updatePlanGoalAction({
      data: { ...header, goal_id: eventId, target_payload: { type: "completion", distance_m: 25 } },
    });
    expect(result).toEqual({ status: "error", message: "Goal not found" });
  });
  it("rejects impossible Gregorian target dates before calling the API", () => {
    expect(
      goalActionSchema.safeParse({
        activity_category: "run",
        priority: 5,
        profile_id: "11111111-1111-4111-8111-111111111111",
        target_date: "2026-02-30",
        target_payload: { type: "consistency", target_sessions_per_week: 4, target_weeks: 8 },
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
