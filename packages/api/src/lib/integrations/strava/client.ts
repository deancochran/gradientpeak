import { MAX_ACTIVITY_FILE_SIZE_BYTES } from "@repo/core/activity-files";
import { z } from "zod";
import { logger } from "../../logger";
import { type StravaUploadFileFormat, stravaUploadStatusSchema } from "./upload-contract";

const STRAVA_API_BASE_URL = "https://www.strava.com/api/v3";
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
const MAX_STREAM_SAMPLES = 1_000_000;

const identifierSchema = z.union([
  z.string().regex(/^\d{1,20}$/),
  z.number().int().safe().nonnegative(),
]);
const boundedString = z.string().max(512);
const coordinateSchema = z.tuple([
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
]);
const mapSchema = z
  .object({ summary_polyline: z.string().max(1_000_000).nullable().optional() })
  .passthrough();

export const stravaAthleteSchema = z.object({ id: identifierSchema }).passthrough();
export type StravaAthlete = z.infer<typeof stravaAthleteSchema>;

export const stravaActivitySchema = z
  .object({
    id: identifierSchema,
    name: boundedString,
    sport_type: boundedString.optional(),
    type: boundedString,
    start_date: z.iso.datetime({ offset: true }),
    elapsed_time: z.number().int().positive().max(31_536_000),
    moving_time: z.number().int().nonnegative().max(31_536_000),
    distance: z.number().finite().nonnegative().max(100_000_000),
    total_elevation_gain: z.number().finite().nonnegative().max(1_000_000).optional(),
    calories: z.number().finite().nonnegative().max(10_000_000).optional(),
    average_heartrate: z.number().finite().nonnegative().max(400).optional(),
    max_heartrate: z.number().finite().nonnegative().max(400).optional(),
    average_watts: z.number().finite().nonnegative().max(100_000).optional(),
    max_watts: z.number().finite().nonnegative().max(100_000).optional(),
    average_cadence: z.number().finite().nonnegative().max(1_000).optional(),
    average_speed: z.number().finite().nonnegative().max(200).optional(),
    max_speed: z.number().finite().nonnegative().max(200).optional(),
    device_name: boundedString.nullable().optional(),
    map: mapSchema.nullable().optional(),
  })
  .passthrough();
export type StravaActivity = z.infer<typeof stravaActivitySchema>;

export const stravaDetailedActivitySchema = stravaActivitySchema.extend({
  athlete: stravaAthleteSchema,
  external_id: boundedString.nullable().optional(),
});
export type StravaDetailedActivity = z.infer<typeof stravaDetailedActivitySchema>;

const streamBase = {
  original_size: z.number().int().nonnegative().max(MAX_STREAM_SAMPLES),
  resolution: z.enum(["low", "medium", "high"]),
  series_type: z.enum(["distance", "time"]),
};
const numberStream = (value: z.ZodNumber) =>
  z.object({ ...streamBase, data: z.array(value).max(MAX_STREAM_SAMPLES) }).passthrough();
const booleanStream = z
  .object({ ...streamBase, data: z.array(z.boolean()).max(MAX_STREAM_SAMPLES) })
  .passthrough();
const coordinateStream = z
  .object({ ...streamBase, data: z.array(coordinateSchema).max(MAX_STREAM_SAMPLES) })
  .passthrough();

export const stravaStreamsSchema = z
  .object({
    time: numberStream(z.number().finite().nonnegative().max(31_536_000)).optional(),
    distance: numberStream(z.number().finite().nonnegative().max(100_000_000)).optional(),
    heartrate: numberStream(z.number().finite().nonnegative().max(400)).optional(),
    watts: numberStream(z.number().finite().nonnegative().max(100_000)).optional(),
    cadence: numberStream(z.number().finite().nonnegative().max(1_000)).optional(),
    velocity_smooth: numberStream(z.number().finite().nonnegative().max(200)).optional(),
    altitude: numberStream(z.number().finite().min(-20_000).max(100_000)).optional(),
    latlng: coordinateStream.optional(),
    moving: booleanStream.optional(),
    temp: numberStream(z.number().finite().min(-200).max(200)).optional(),
  })
  .passthrough();
export type StravaStreams = z.infer<typeof stravaStreamsSchema>;

export type StravaRateLimit = {
  limit15Minute: number;
  limitDaily: number;
  usage15Minute: number;
  usageDaily: number;
  remaining15Minute: number;
  remainingDaily: number;
};

export type StravaClientFailure =
  | "authorization"
  | "activity_missing"
  | "invalid_response"
  | "network_unavailable"
  | "provider_unavailable"
  | "rate_limited"
  | "request_rejected"
  | "request_timeout";

export class StravaClientError extends Error {
  constructor(
    public readonly kind: StravaClientFailure,
    public readonly details: {
      status?: number;
      retryAfterSeconds?: number;
      rateLimit?: StravaRateLimit | null;
    } = {},
  ) {
    super(`Strava request failed: ${kind}`);
    this.name = StravaClientError.name;
  }
}

function parseRatePair(value: string | null): [number, number] | null {
  if (!value || !/^\d+,\d+$/.test(value.trim())) return null;
  const [short, daily] = value.split(",").map(Number);
  return short !== undefined && daily !== undefined ? [short, daily] : null;
}

export function parseStravaRateLimitHeaders(headers: Headers): StravaRateLimit | null {
  const limit = parseRatePair(headers.get("x-ratelimit-limit"));
  const usage = parseRatePair(headers.get("x-ratelimit-usage"));
  if (!limit || !usage) return null;
  return {
    limit15Minute: limit[0],
    limitDaily: limit[1],
    usage15Minute: usage[0],
    usageDaily: usage[1],
    remaining15Minute: Math.max(0, limit[0] - usage[0]),
    remainingDaily: Math.max(0, limit[1] - usage[1]),
  };
}

function retryAfterSeconds(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(86_400, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date)
    ? Math.min(86_400, Math.max(0, Math.ceil((date - Date.now()) / 1_000)))
    : undefined;
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new StravaClientError("invalid_response", { status: response.status });
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
      throw new StravaClientError("invalid_response", { status: response.status });
    }
    return JSON.parse(text);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new StravaClientError("invalid_response", { status: response.status });
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function classifyStatus(status: number, activityScoped: boolean): StravaClientFailure {
  if (status === 401 || status === 403) return "authorization";
  if (status === 404 && activityScoped) return "activity_missing";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "request_rejected";
}

export class StravaClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(input: {
    accessToken: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    baseUrl?: string;
  }) {
    if (!input.accessToken) throw new Error("Strava access token is required");
    this.accessToken = input.accessToken;
    this.fetchImpl = input.fetchImpl ?? fetch;
    this.timeoutMs = Math.max(1, Math.floor(input.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    this.baseUrl = input.baseUrl ?? STRAVA_API_BASE_URL;
  }

  private readonly accessToken: string;

  private async request<T>(input: {
    path: string;
    operation: string;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
    activityScoped?: boolean;
  }): Promise<{ data: T; rateLimit: StravaRateLimit | null }> {
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort(input.signal?.reason);
    if (input.signal?.aborted) controller.abort(input.signal.reason);
    else input.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${input.path}`, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
        signal: controller.signal,
      });
      const rateLimit = parseStravaRateLimitHeaders(response.headers);
      if (!response.ok) {
        const kind = classifyStatus(response.status, input.activityScoped ?? false);
        logger.warn("Strava API request failed", {
          provider: "strava",
          operation: input.operation,
          outcome: kind,
          status: response.status,
        });
        throw new StravaClientError(kind, {
          status: response.status,
          rateLimit,
          ...(kind === "rate_limited" ? { retryAfterSeconds: retryAfterSeconds(response) } : {}),
        });
      }
      let value: unknown;
      try {
        value = await readBoundedJson(response);
      } catch (error) {
        if (error instanceof StravaClientError) throw error;
        throw new StravaClientError("invalid_response", { status: response.status, rateLimit });
      }
      const parsed = input.schema.safeParse(value);
      if (!parsed.success) {
        throw new StravaClientError("invalid_response", { status: response.status, rateLimit });
      }
      return { data: parsed.data, rateLimit };
    } catch (error) {
      if (error instanceof StravaClientError) throw error;
      if (timedOut) throw new StravaClientError("request_timeout");
      if (input.signal?.aborted) throw error;
      throw new StravaClientError("network_unavailable");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  getAuthenticatedAthlete(signal?: AbortSignal) {
    return this.request({
      path: "/athlete",
      operation: "read_athlete",
      schema: stravaAthleteSchema,
      signal,
    });
  }

  listAthleteActivitiesPage(input: {
    after: number;
    before: number;
    page: number;
    perPage: number;
    signal?: AbortSignal;
  }) {
    const params = new URLSearchParams({
      after: String(Math.floor(input.after)),
      before: String(Math.floor(input.before)),
      page: String(Math.max(1, Math.floor(input.page))),
      per_page: String(Math.min(200, Math.max(1, Math.floor(input.perPage)))),
    });
    return this.request({
      path: `/athlete/activities?${params.toString()}`,
      operation: "list_activities",
      schema: z.array(stravaActivitySchema).max(200),
      signal: input.signal,
    });
  }

  getActivity(activityId: string, signal?: AbortSignal) {
    return this.request({
      path: `/activities/${encodeURIComponent(activityId)}?include_all_efforts=false`,
      operation: "read_activity",
      schema: stravaDetailedActivitySchema,
      signal,
      activityScoped: true,
    });
  }

  getActivityStreams(activityId: string, signal?: AbortSignal) {
    const keys = [
      "time",
      "distance",
      "heartrate",
      "watts",
      "cadence",
      "velocity_smooth",
      "altitude",
      "latlng",
      "moving",
      "temp",
    ].join(",");
    return this.request({
      path: `/activities/${encodeURIComponent(activityId)}/streams?keys=${keys}&key_by_type=true`,
      operation: "read_streams",
      schema: stravaStreamsSchema,
      signal,
      activityScoped: true,
    });
  }

  async uploadActivity(input: {
    bytes: Uint8Array;
    externalId: string;
    format: StravaUploadFileFormat;
    signal?: AbortSignal;
  }) {
    if (input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_ACTIVITY_FILE_SIZE_BYTES) {
      throw new StravaClientError("request_rejected");
    }
    const externalId = z.string().min(1).max(255).parse(input.externalId);
    const controller = new AbortController();
    let timedOut = false;
    const forwardAbort = () => controller.abort(input.signal?.reason);
    if (input.signal?.aborted) controller.abort(input.signal.reason);
    else input.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const body = new FormData();
    body.set("data_type", input.format);
    body.set("external_id", externalId);
    body.set(
      "file",
      new Blob([Uint8Array.from(input.bytes)], { type: "application/octet-stream" }),
      `activity.${input.format}`,
    );
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/uploads`, {
        method: "POST",
        headers: { Accept: "application/json", Authorization: `Bearer ${this.accessToken}` },
        body,
        signal: controller.signal,
      });
      const rateLimit = parseStravaRateLimitHeaders(response.headers);
      if (!response.ok) {
        const kind = classifyStatus(response.status, false);
        logger.warn("Strava API request failed", {
          provider: "strava",
          operation: "upload_activity",
          outcome: kind,
          status: response.status,
        });
        throw new StravaClientError(kind, {
          status: response.status,
          rateLimit,
          ...(kind === "rate_limited" ? { retryAfterSeconds: retryAfterSeconds(response) } : {}),
        });
      }
      let value: unknown;
      try {
        value = await readBoundedJson(response);
      } catch (error) {
        if (error instanceof StravaClientError) throw error;
        throw new StravaClientError("invalid_response", { status: response.status, rateLimit });
      }
      const parsed = stravaUploadStatusSchema.safeParse(value);
      if (!parsed.success) {
        throw new StravaClientError("invalid_response", { status: response.status, rateLimit });
      }
      return { data: parsed.data, rateLimit };
    } catch (error) {
      if (error instanceof StravaClientError) throw error;
      if (timedOut) throw new StravaClientError("request_timeout");
      if (input.signal?.aborted) throw error;
      throw new StravaClientError("network_unavailable");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", forwardAbort);
    }
  }

  getUploadStatus(uploadId: string, signal?: AbortSignal) {
    const id = z
      .string()
      .regex(/^\d{1,20}$/)
      .parse(uploadId);
    return this.request({
      path: `/uploads/${encodeURIComponent(id)}`,
      operation: "read_upload",
      schema: stravaUploadStatusSchema,
      signal,
    });
  }
}
