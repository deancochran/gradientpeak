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

  it("creates plans with multipart JSON file form data at the fetch boundary", async () => {
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
    expect(options.headers).toMatchObject({ Authorization: "Bearer access-token" });
    expect((options.headers as Record<string, string>)["Content-Type"]).toBeUndefined();

    const form = options.body as FormData;
    expect(form.get("plan[external_id]")).toBe("plan-1");
    expect(JSON.parse(await (form.get("plan[file]") as File).text())).toEqual({
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

  it("lists and deletes plans by external id", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 42,
              user_id: 9,
              name: "Plan",
              description: "Description",
              file: { url: "https://example.com/plan.json" },
              workout_type_family_id: 1,
              workout_type_location_id: 0,
              external_id: "plan/id with spaces",
              provider_updated_at: "2026-04-03T12:00:00.000Z",
              deleted: false,
              updated_at: "2026-04-03T12:00:00.000Z",
              created_at: "2026-04-03T12:00:00.000Z",
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }));
    const client = new WahooClient({ accessToken: "access-token" });

    await expect(client.getPlans("plan/id with spaces")).resolves.toHaveLength(1);
    await expect(client.deletePlan(42)).resolves.toEqual({ success: true });

    expect((fetchMock.mock.calls[0] as [string, RequestInit])[0]).toBe(
      "https://api.wahooligan.com/v1/plans?external_id=plan%2Fid%20with%20spaces",
    );
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[0]).toBe(
      "https://api.wahooligan.com/v1/plans/42",
    );
  });

  it("fetches power zones for onboarding enrichment", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ftp: 248,
          critical_power: 255,
          zones: [{ name: "Zone 2", min: 140, max: 190 }],
          updated_at: "2026-04-03T12:00:00.000Z",
        }),
        { status: 200 },
      ),
    );
    const client = new WahooClient({ accessToken: "access-token" });

    await expect(client.getPowerZones()).resolves.toMatchObject({ ftp: 248 });

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.wahooligan.com/v1/power_zones");
    expect(options.method).toBe("GET");
    expect(options.headers).toMatchObject({ Authorization: "Bearer access-token" });
  });

  it("lists workout summaries for a bounded history window", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          workouts: [
            {
              id: 456,
              starts: "2026-04-03T10:00:00.000Z",
              minutes: 60,
              name: "Friday ride",
              plan_id: null,
              plan_ids: [],
              route_id: null,
              workout_token: "token-1",
              workout_type_id: 0,
              created_at: "2026-04-03T09:55:00.000Z",
              updated_at: "2026-04-03T11:05:00.000Z",
              workout_summary: {
                id: 123,
                updated_at: "2026-04-03T11:05:00.000Z",
                ascent_accum: 789,
                cadence_avg: 92,
                calories_accum: 654,
                distance_accum: 40235,
                duration_active_accum: 3501,
                duration_total_accum: 3600,
                heart_rate_avg: 149,
                power_avg: 212,
                power_bike_np_last: 228,
                power_bike_tss_last: 85,
                speed_avg: 8.9,
                work_accum: 760000,
                file: { url: "https://example.com/123.fit" },
                fitness_app_id: 1,
                manual: false,
                edited: false,
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const client = new WahooClient({ accessToken: "access-token" });

    await expect(
      client.listWorkoutSummaries({
        endDate: "2026-04-03T12:00:00.000Z",
        page: 2,
        perPage: 25,
        startDate: "2025-04-03T12:00:00.000Z",
      }),
    ).resolves.toMatchObject([
      {
        id: 123,
        started_at: "2026-04-03T10:00:00.000Z",
        workout_id: 456,
        workout: { id: 456, name: "Friday ride", workout_type_id: 0 },
      },
    ]);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.wahooligan.com/v1/workouts?page=2&per_page=25");
    expect(options.method).toBe("GET");
    expect(options.headers).toMatchObject({ Authorization: "Bearer access-token" });
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
