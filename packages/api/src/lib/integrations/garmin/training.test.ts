import { activityPlanStructureSchema } from "@repo/core";
import { describe, expect, it, vi } from "vitest";
import { GarminTrainingClient, GarminTrainingClientError } from "./training-client";
import {
  GarminTrainingProjectionError,
  projectGarminTrainingActivityPlan,
} from "./training-mapper";
import {
  assertGarminTrainingDate,
  assertGarminTrainingId,
  garminWorkoutScheduleSchema,
} from "./training-types";

const structure = activityPlanStructureSchema.parse({
  version: 5,
  activity_category: "run",
  items: [
    {
      type: "repeat",
      id: "11111111-1111-4111-8111-111111111111",
      count: 2,
      steps: [
        {
          type: "step",
          id: "22222222-2222-4222-8222-222222222222",
          name: "Fast",
          duration: { type: "distance", meters: 400 },
          targets: [{ type: "speed", intensity: 18 }],
        },
      ],
    },
  ],
});
const activityPlan = projectGarminTrainingActivityPlan({
  name: "Track",
  description: "Intervals",
  structure,
});
const response = (body: unknown, status = 200) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
const returnedActivityPlan = (() => {
  const segment = activityPlan.segments[0];
  const repeat = segment?.steps[0];
  if (!segment || !repeat || repeat.type !== "WorkoutRepeatStep" || !repeat.steps[0])
    throw new Error("invalid fixture");
  return {
    ...activityPlan,
    workoutId: 7,
    ownerId: 9,
    segments: [{ ...segment, steps: [{ ...repeat, steps: [{ ...repeat.steps[0], stepId: 70 }] }] }],
  };
})();

describe("Garmin Training projection", () => {
  it("projects frozen Core repeats, meters, and km/h pace to m/s without mutating source", () => {
    expect(activityPlan.segments[0]?.steps).toMatchObject([
      {
        type: "WorkoutRepeatStep",
        repeatValue: 2,
        steps: [
          {
            stepOrder: 2,
            durationType: "DISTANCE",
            durationValue: 400,
            targetType: "SPEED",
            targetValueLow: 5,
            targetValueHigh: 5,
          },
        ],
      },
    ]);
    expect(structure.items[0]).toMatchObject({ type: "repeat", count: 2 });
  });
  it.each([
    { type: "repetitions", count: 4 },
    { type: "untilFinished" },
  ] as const)("rejects unsupported completion", (duration) => {
    const invalid = {
      ...structure,
      items: [
        {
          type: "step" as const,
          id: "33333333-3333-4333-8333-333333333333",
          name: "x",
          duration,
          targets: [],
        },
      ],
    };
    expect(() =>
      projectGarminTrainingActivityPlan({
        name: "x",
        description: null,
        structure: activityPlanStructureSchema.parse(invalid),
      }),
    ).toThrow(GarminTrainingProjectionError);
  });
  it("rejects swim, relative targets, and Garmin's 100-step limit", () => {
    expect(() =>
      projectGarminTrainingActivityPlan({
        name: "x",
        description: null,
        structure: { ...structure, activity_category: "swim" },
      }),
    ).toThrow("cannot preserve");
    const relative = {
      ...structure,
      activity_category: "bike" as const,
      items: [
        {
          type: "step" as const,
          id: "44444444-4444-4444-8444-444444444444",
          name: "x",
          duration: { type: "time" as const, seconds: 60 },
          targets: [{ type: "%FTP" as const, intensity: 80 }],
        },
      ],
    };
    expect(() =>
      projectGarminTrainingActivityPlan({
        name: "x",
        description: null,
        structure: activityPlanStructureSchema.parse(relative),
      }),
    ).toThrow("cannot preserve");
  });
});

describe("Garmin Training client", () => {
  it("uses documented create and other routes, bearer auth, and calendar dates", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({ workoutId: 7 }))
      .mockResolvedValueOnce(response([{ scheduleId: 2, workoutId: 7, date: "2028-02-29" }]));
    const client = new GarminTrainingClient({ accessToken: "secret", fetchImpl });
    await expect(client.createActivityPlan(activityPlan)).resolves.toEqual({ workoutId: 7 });
    await expect(client.getSchedulesByDate("2028-02-29", "2028-02-29")).resolves.toHaveLength(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("https://apis.garmin.com/workoutportal/workout/v2");
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({ Authorization: "Bearer secret" }),
      redirect: "error",
    });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://apis.garmin.com/training-api/schedule?startDate=2028-02-29&endDate=2028-02-29",
    );
  });
  it("sends every CRUD method/path/body and accepts generated step IDs and empty successful writes", async () => {
    const schedule = { scheduleId: 2, workoutId: 7, date: "2028-02-29" };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(returnedActivityPlan))
      .mockResolvedValueOnce(response(returnedActivityPlan, 200))
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      .mockResolvedValueOnce(response({ scheduleId: 2 }))
      .mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(response(schedule))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new GarminTrainingClient({ accessToken: "secret", fetchImpl });
    await expect(client.getActivityPlan(7)).resolves.toMatchObject({
      workoutId: 7,
      segments: [{ steps: [{ steps: [{ stepId: 70 }] }] }],
    });
    await expect(client.updateActivityPlan(7, returnedActivityPlan)).resolves.toMatchObject({
      workoutId: 7,
    });
    await expect(client.updateActivityPlan(7, returnedActivityPlan)).resolves.toBeUndefined();
    await client.deleteActivityPlan(7);
    await expect(client.createSchedule({ workoutId: 7, date: "2028-02-29" })).resolves.toEqual({
      scheduleId: 2,
    });
    await expect(client.getSchedule(2)).resolves.toEqual(schedule);
    await expect(client.updateSchedule(2, schedule)).resolves.toEqual(schedule);
    await client.deleteSchedule(2);
    expect(fetchImpl.mock.calls.map(([url, init]) => [init.method, url])).toEqual([
      ["GET", "https://apis.garmin.com/training-api/workout/v2/7"],
      ["PUT", "https://apis.garmin.com/training-api/workout/v2/7"],
      ["PUT", "https://apis.garmin.com/training-api/workout/v2/7"],
      ["DELETE", "https://apis.garmin.com/training-api/workout/v2/7"],
      ["POST", "https://apis.garmin.com/training-api/schedule/"],
      ["GET", "https://apis.garmin.com/training-api/schedule/2"],
      ["PUT", "https://apis.garmin.com/training-api/schedule/2"],
      ["DELETE", "https://apis.garmin.com/training-api/schedule/2"],
    ]);
    expect(JSON.parse(fetchImpl.mock.calls[1]?.[1].body)).toMatchObject({
      workoutId: 7,
      ownerId: 9,
    });
    expect(JSON.parse(fetchImpl.mock.calls[4]?.[1].body)).toEqual({
      workoutId: 7,
      date: "2028-02-29",
    });
  });
  it("rejects invalid path IDs/dates and never calls fetch", async () => {
    const fetchImpl = vi.fn();
    const client = new GarminTrainingClient({ accessToken: "secret", fetchImpl });
    expect(() => assertGarminTrainingId("7/evil")).toThrow();
    expect(() => assertGarminTrainingDate("2027-02-29")).toThrow();
    await expect(client.getActivityPlan("7/evil")).rejects.toThrow();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each([
    [204, "unknown_outcome"],
    [401, "unauthorized"],
    [403, "forbidden"],
    [412, "permission"],
    [429, "rate_limited"],
  ] as const)("classifies write response %s without retry", async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(response(undefined, status));
    const client = new GarminTrainingClient({ accessToken: "secret", fetchImpl });
    await expect(client.createActivityPlan(activityPlan)).rejects.toMatchObject({ code });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("bounds malformed/oversized read responses without leaking a token", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response("x".repeat(70_000)));
    const client = new GarminTrainingClient({ accessToken: "secret", fetchImpl });
    await expect(client.getActivityPlan(3)).rejects.toBeInstanceOf(GarminTrainingClientError);
  });
  it("treats malformed create acknowledgements as unknown outcomes and sanitizes malformed schedule lists", async () => {
    const writeFetch = vi.fn().mockResolvedValue(response({ unexpected: "body" }));
    await expect(
      new GarminTrainingClient({ accessToken: "secret", fetchImpl: writeFetch }).createActivityPlan(
        activityPlan,
      ),
    ).rejects.toMatchObject({ code: "unknown_outcome" });
    const listFetch = vi.fn().mockResolvedValue(response([{ workoutId: 7, date: "2028-02-29" }]));
    await expect(
      new GarminTrainingClient({ accessToken: "secret", fetchImpl: listFetch }).getSchedulesByDate(
        "2028-02-29",
        "2028-02-29",
      ),
    ).rejects.toMatchObject({
      code: "invalid_response",
      message: "Garmin Training request failed",
    });
  });
  it("treats transport failure for a write as unknown without retry or secret leakage", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("redirect failed"));
    const client = new GarminTrainingClient({ accessToken: "secret-token", fetchImpl });
    await expect(client.createActivityPlan(activityPlan)).rejects.toMatchObject({
      code: "unknown_outcome",
      message: expect.not.stringContaining("secret-token"),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid returned/mismatched IDs, calendar dates, and unbounded deadlines locally", async () => {
    expect(() => new GarminTrainingClient({ accessToken: "secret", timeoutMs: 60_001 })).toThrow();
    expect(
      () => new GarminTrainingClient({ accessToken: "secret", timeoutMs: Number.NaN }),
    ).toThrow();
    expect(() => garminWorkoutScheduleSchema.parse({ workoutId: 1, date: "2027-02-29" })).toThrow();
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(response({ ...returnedActivityPlan, workoutId: 8 }));
    const client = new GarminTrainingClient({ accessToken: "secret", fetchImpl });
    await expect(client.getActivityPlan(7)).rejects.toMatchObject({ code: "invalid_response" });
    await expect(
      client.updateActivityPlan(7, { ...returnedActivityPlan, workoutId: 8 }),
    ).rejects.toThrow();
    await expect(client.getSchedulesByDate("2028-03-01", "2028-02-29")).rejects.toThrow();
  });
  it("classifies an expired read deadline without exposing request details", async () => {
    const fetchImpl: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    await expect(
      new GarminTrainingClient({ accessToken: "secret", fetchImpl, timeoutMs: 1 }).getActivityPlan(
        7,
      ),
    ).rejects.toMatchObject({ code: "request_timeout", message: "Garmin Training request failed" });
  });
});
