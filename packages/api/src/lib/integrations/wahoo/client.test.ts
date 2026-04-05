import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WahooClient } from "./client";

describe("WahooClient", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("creates plans with base64-encoded form data at the fetch boundary", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 42,
          name: "Threshold Builder",
          description: "Build threshold",
          external_id: "plan-1",
          file: { url: "https://example.com/plan.json" },
          provider_updated_at: "2026-04-03T12:00:00.000Z",
          workout_type_family_id: 4,
          workout_type_location_id: 2,
          deleted: false,
        }),
        { status: 200 },
      ),
    );
    const client = new WahooClient({ accessToken: "access-token" });

    const result = await client.createPlan({
      structure: { header: { version: 1 }, intervals: [{ type: "warmup", seconds: 300 }] },
      name: "Threshold Builder",
      description: "Build threshold",
      activityType: "bike",
      externalId: "plan-1",
    });

    expect(result.id).toBe(42);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.wahooligan.com/v1/plans");
    expect(options.method).toBe("POST");
    expect(options.headers).toMatchObject({
      Authorization: "Bearer access-token",
      "Content-Type": "application/x-www-form-urlencoded",
    });

    const form = new URLSearchParams(String(options.body));
    expect(form.get("plan[filename]")).toBe("plan.json");
    expect(form.get("plan[external_id]")).toBe("plan-1");
    expect(
      JSON.parse(Buffer.from(form.get("plan[file]") ?? "", "base64").toString("utf8")),
    ).toEqual({
      header: { version: 1 },
      intervals: [{ type: "warmup", seconds: 300 }],
    });
    expect(form.get("plan[provider_updated_at]")).toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it("creates workouts with route_id only when provided", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 99,
          name: "Long Ride",
          starts: "2026-04-05T09:00:00.000Z",
          minutes: 90,
          workout_type_id: 7,
          plan_id: 42,
          plan_ids: [42],
          workout_token: "event-1",
          created_at: "2026-04-03T12:00:00.000Z",
          updated_at: "2026-04-03T12:00:00.000Z",
        }),
        { status: 200 },
      ),
    );
    const client = new WahooClient({ accessToken: "access-token" });

    await client.createWorkout({
      planId: 42,
      name: "Long Ride",
      scheduledDate: "2026-04-05T09:00:00.000Z",
      externalId: "event-1",
      routeId: 77,
      workoutTypeId: 7,
      durationMinutes: 90,
    });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toMatchObject({
      Authorization: "Bearer access-token",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(options.body))).toEqual({
      workout: {
        plan_id: 42,
        name: "Long Ride",
        starts: "2026-04-05T09:00:00.000Z",
        external_id: "event-1",
        workout_token: "event-1",
        workout_type_id: 7,
        minutes: 90,
        route_id: 77,
      },
    });
  });

  it("returns success for delete requests on 204 responses", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new WahooClient({ accessToken: "access-token" });

    await expect(client.deleteWorkout("workout-1")).resolves.toEqual({ success: true });
  });

  it("encodes external_id query parameters when listing routes", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 3,
            user_id: 9,
            name: "Morning Route",
            description: null,
            file: { url: "https://example.com/route.gpx" },
            workout_type_family_id: 0,
            external_id: "route/id with spaces",
            provider_updated_at: "2026-04-03T12:00:00.000Z",
            deleted: false,
            start_lat: 35,
            start_lng: -80,
            distance: 12000,
            ascent: 300,
            descent: 250,
            updated_at: "2026-04-03T12:00:00.000Z",
            created_at: "2026-04-03T12:00:00.000Z",
          },
        ]),
        { status: 200 },
      ),
    );
    const client = new WahooClient({ accessToken: "access-token" });

    await client.getRoutes("route/id with spaces");

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.wahooligan.com/v1/routes?external_id=route%2Fid%20with%20spaces");
  });

  it("surfaces structured API errors with status and provider code", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "invalid_request",
          error_description: "plan_id is required",
          code: "WAHOO_4001",
        }),
        { status: 400, statusText: "Bad Request" },
      ),
    );
    const client = new WahooClient({ accessToken: "access-token" });

    await expect(client.getWorkout("workout-1")).rejects.toMatchObject({
      message: "invalid_request: plan_id is required",
      status: 400,
      code: "WAHOO_4001",
    });
  });

  it("falls back to an HTTP-based error when the error response is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("service unavailable", { status: 503, statusText: "Service Unavailable" }),
    );
    const client = new WahooClient({ accessToken: "access-token" });

    await expect(client.getUserProfile()).rejects.toMatchObject({
      message: "Wahoo API error: 503 Service Unavailable",
      status: 503,
      code: "HTTP_503",
    });
  });

  it("wraps fetch failures as request errors", async () => {
    fetchMock.mockRejectedValueOnce(new Error("socket hang up"));
    const client = new WahooClient({ accessToken: "access-token" });

    await expect(client.getWorkoutSummary("summary-1")).rejects.toMatchObject({
      message: "Wahoo API request failed: socket hang up",
    });
  });
});

describe("WahooClient.withRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries retryable failures with exponential backoff until success", async () => {
    vi.useFakeTimers();
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockRejectedValueOnce(Object.assign(new Error("temporarily unavailable"), { status: 503 }))
      .mockResolvedValueOnce("ok");

    const resultPromise = WahooClient.withRetry(fn, 3);

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);

    await expect(resultPromise).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry non-429 client errors", async () => {
    const error = Object.assign(new Error("bad request"), { status: 400 });
    const fn = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(WahooClient.withRetry(fn, 3)).rejects.toBe(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
