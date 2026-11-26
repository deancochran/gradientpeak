import { describe, expect, it, vi } from "vitest";
import { StravaClient, type StravaClientError } from "./client";

const activity = {
  id: 123,
  name: "Private activity",
  type: "Run",
  sport_type: "Run",
  start_date: "2026-09-01T10:00:00Z",
  elapsed_time: 600,
  moving_time: 590,
  distance: 2_000,
};

describe("Strava API client", () => {
  it("validates paginated activities and exposes bounded rate-limit state", async () => {
    let requestedUrl = "";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      requestedUrl = String(input);
      return Response.json([activity], {
        headers: {
          "x-ratelimit-limit": "100,1000",
          "x-ratelimit-usage": "42,400",
        },
      });
    });
    const client = new StravaClient({
      accessToken: "secret",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(
      client.listAthleteActivitiesPage({ after: 1, before: 2, page: 3, perPage: 30 }),
    ).resolves.toMatchObject({
      data: [expect.objectContaining({ id: 123 })],
      rateLimit: { remaining15Minute: 58, remainingDaily: 600 },
    });
    const requested = new URL(requestedUrl);
    expect(requested.searchParams.get("page")).toBe("3");
    expect(requested.searchParams.get("per_page")).toBe("30");
  });

  it("validates activity detail and keyed stream shapes", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ ...activity, athlete: { id: 456 } }))
      .mockResolvedValueOnce(
        Response.json({
          time: {
            data: [0, 1],
            original_size: 2,
            resolution: "high",
            series_type: "time",
          },
          heartrate: {
            data: [120, 125],
            original_size: 2,
            resolution: "high",
            series_type: "time",
          },
        }),
      );
    const client = new StravaClient({ accessToken: "secret", fetchImpl });
    await expect(client.getActivity("123")).resolves.toMatchObject({ data: { id: 123 } });
    await expect(client.getActivityStreams("123")).resolves.toMatchObject({
      data: { heartrate: { data: [120, 125] } },
    });
  });

  it.each([
    [401, "authorization"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const)("classifies HTTP %s as %s", async (status, kind) => {
    const fetchImpl = vi.fn(async () =>
      Response.json(
        { message: "not logged" },
        { status, headers: status === 429 ? { "retry-after": "60" } : {} },
      ),
    );
    const client = new StravaClient({
      accessToken: "secret",
      fetchImpl: fetchImpl as typeof fetch,
    });
    await expect(client.getAuthenticatedAthlete()).rejects.toEqual(
      expect.objectContaining<Partial<StravaClientError>>({ kind }),
    );
  });

  it("classifies an authenticated activity 404 as authoritative absence", async () => {
    const client = new StravaClient({
      accessToken: "secret",
      fetchImpl: vi.fn(async () => Response.json({}, { status: 404 })) as typeof fetch,
    });
    await expect(client.getActivity("123")).rejects.toEqual(
      expect.objectContaining<Partial<StravaClientError>>({ kind: "activity_missing" }),
    );
  });

  it("rejects malformed official response shapes", async () => {
    const client = new StravaClient({
      accessToken: "secret",
      fetchImpl: vi.fn(async () =>
        Response.json([{ ...activity, elapsed_time: -1 }]),
      ) as typeof fetch,
    });
    await expect(
      client.listAthleteActivitiesPage({ after: 1, before: 2, page: 1, perPage: 30 }),
    ).rejects.toEqual(expect.objectContaining({ kind: "invalid_response" }));
  });

  it("uploads a real artifact as multipart and polls only by the returned upload ID", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          {
            id: 789,
            id_str: "789",
            external_id: "gp-v1-signed.fit",
            error: null,
            status: "Your activity is still being processed.",
            activity_id: null,
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 789,
          id_str: "789",
          external_id: "gp-v1-signed.fit",
          error: null,
          status: "Your activity is ready.",
          activity_id: 456,
        }),
      );
    const client = new StravaClient({ accessToken: "secret", fetchImpl });
    await expect(
      client.uploadActivity({
        bytes: new Uint8Array([1, 2, 3]),
        externalId: "gp-v1-signed",
        format: "fit",
      }),
    ).resolves.toMatchObject({ data: { id: 789, activity_id: null } });
    const uploadRequest = fetchImpl.mock.calls[0];
    expect(String(uploadRequest?.[0])).toBe("https://www.strava.com/api/v3/uploads");
    expect(uploadRequest?.[1]).toMatchObject({ method: "POST" });
    const form = uploadRequest?.[1]?.body as FormData;
    expect(form.get("data_type")).toBe("fit");
    expect(form.get("external_id")).toBe("gp-v1-signed");
    expect(form.get("file")).toBeInstanceOf(Blob);

    await expect(client.getUploadStatus("789")).resolves.toMatchObject({
      data: { id: 789, activity_id: 456 },
    });
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe("https://www.strava.com/api/v3/uploads/789");
  });
});
