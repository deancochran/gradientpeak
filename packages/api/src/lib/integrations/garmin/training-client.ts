import { z } from "zod";
import {
  assertGarminTrainingDate,
  assertGarminTrainingId,
  GARMIN_TRAINING_MAX_RESPONSE_BYTES,
  GarminTrainingValidationError,
  type GarminWorkout,
  type GarminWorkoutSchedule,
  garminWorkoutScheduleSchema,
  garminWorkoutSchema,
} from "./training-types";

const API = "https://apis.garmin.com";
const activityPlanIdResponse = z
  .object({ workoutId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
  .passthrough();
const scheduleIdResponse = z
  .object({ scheduleId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
  .passthrough();

export class GarminTrainingClientError extends Error {
  constructor(
    readonly code:
      | "unauthorized"
      | "forbidden"
      | "permission"
      | "rate_limited"
      | "http"
      | "invalid_response"
      | "network_unavailable"
      | "request_timeout"
      | "unknown_outcome",
  ) {
    super("Garmin Training request failed");
    this.name = "GarminTrainingClientError";
  }
}
type Method = "DELETE" | "GET" | "POST" | "PUT";
export class GarminTrainingClient {
  constructor(
    private readonly input: { accessToken: string; fetchImpl?: typeof fetch; timeoutMs?: number },
  ) {
    if (!input.accessToken.trim() || input.accessToken.length > 8192)
      throw new GarminTrainingValidationError("invalid_payload");
    if (
      input.timeoutMs !== undefined &&
      (!Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > 60_000)
    )
      throw new GarminTrainingValidationError("invalid_payload");
  }
  async createActivityPlan(
    activityPlan: Omit<GarminWorkout, "workoutId" | "ownerId">,
  ): Promise<{ workoutId: number }> {
    const response = await this.request(
      "POST",
      "/workoutportal/workout/v2",
      garminWorkoutSchema.omit({ workoutId: true, ownerId: true }).parse(activityPlan),
      true,
    );
    return this.extractWriteId(response, activityPlanIdResponse, "workoutId");
  }
  async getActivityPlan(activityPlanId: unknown): Promise<GarminWorkout> {
    const id = assertGarminTrainingId(activityPlanId);
    const parsed = garminWorkoutSchema.safeParse(
      await this.request("GET", `/training-api/workout/v2/${id}`),
    );
    if (!parsed.success || parsed.data.workoutId !== id)
      throw new GarminTrainingClientError("invalid_response");
    return parsed.data;
  }
  async updateActivityPlan(
    activityPlanId: unknown,
    activityPlan: GarminWorkout,
  ): Promise<GarminWorkout | undefined> {
    const id = assertGarminTrainingId(activityPlanId);
    if (
      activityPlan.ownerId === undefined ||
      (activityPlan.workoutId !== undefined && activityPlan.workoutId !== id)
    )
      throw new GarminTrainingValidationError("invalid_payload");
    const result = this.parseWriteOptional(
      await this.request(
        "PUT",
        `/training-api/workout/v2/${id}`,
        garminWorkoutSchema.parse(activityPlan),
        true,
      ),
      garminWorkoutSchema,
    );
    if (result !== undefined && result.workoutId !== undefined && result.workoutId !== id)
      throw new GarminTrainingClientError("invalid_response");
    return result;
  }
  async deleteActivityPlan(activityPlanId: unknown): Promise<void> {
    await this.request(
      "DELETE",
      `/training-api/workout/v2/${assertGarminTrainingId(activityPlanId)}`,
      undefined,
      true,
    );
  }
  async createSchedule(
    schedule: Omit<GarminWorkoutSchedule, "scheduleId">,
  ): Promise<{ scheduleId: number }> {
    const value = garminWorkoutScheduleSchema.omit({ scheduleId: true }).parse(schedule);
    assertGarminTrainingDate(value.date);
    return this.extractWriteId(
      await this.request("POST", "/training-api/schedule/", value, true),
      scheduleIdResponse,
      "scheduleId",
    );
  }
  async getSchedule(scheduleId: unknown): Promise<GarminWorkoutSchedule> {
    const id = assertGarminTrainingId(scheduleId);
    const parsed = garminWorkoutScheduleSchema.safeParse(
      await this.request("GET", `/training-api/schedule/${id}`),
    );
    if (!parsed.success || parsed.data.scheduleId !== id)
      throw new GarminTrainingClientError("invalid_response");
    return parsed.data;
  }
  async updateSchedule(
    scheduleId: unknown,
    schedule: GarminWorkoutSchedule,
  ): Promise<GarminWorkoutSchedule | undefined> {
    const id = assertGarminTrainingId(scheduleId);
    if (schedule.scheduleId !== undefined && schedule.scheduleId !== id)
      throw new GarminTrainingValidationError("invalid_payload");
    assertGarminTrainingDate(schedule.date);
    const result = this.parseWriteOptional(
      await this.request(
        "PUT",
        `/training-api/schedule/${id}`,
        garminWorkoutScheduleSchema.parse(schedule),
        true,
      ),
      garminWorkoutScheduleSchema,
    );
    if (result !== undefined && result.scheduleId !== undefined && result.scheduleId !== id)
      throw new GarminTrainingClientError("invalid_response");
    return result;
  }
  async deleteSchedule(scheduleId: unknown): Promise<void> {
    await this.request(
      "DELETE",
      `/training-api/schedule/${assertGarminTrainingId(scheduleId)}`,
      undefined,
      true,
    );
  }
  async getSchedulesByDate(startDate: string, endDate: string): Promise<GarminWorkoutSchedule[]> {
    const start = assertGarminTrainingDate(startDate);
    const end = assertGarminTrainingDate(endDate);
    if (start > end) throw new GarminTrainingValidationError("invalid_date");
    const params = new URLSearchParams({ startDate: start, endDate: end });
    const parsed = z
      .array(garminWorkoutScheduleSchema)
      .max(1000)
      .safeParse(await this.request("GET", `/training-api/schedule?${params}`));
    if (!parsed.success || parsed.data.some((schedule) => schedule.scheduleId === undefined))
      throw new GarminTrainingClientError("invalid_response");
    return parsed.data;
  }
  private async request(
    method: Method,
    path: string,
    body?: unknown,
    write = false,
  ): Promise<unknown | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.input.timeoutMs ?? 10_000);
    try {
      const response = await (this.input.fetchImpl ?? fetch)(`${API}${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.input.accessToken}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok)
        throw new GarminTrainingClientError(
          response.status === 401
            ? "unauthorized"
            : response.status === 403
              ? "forbidden"
              : response.status === 412
                ? "permission"
                : response.status === 429
                  ? "rate_limited"
                  : "http",
        );
      if (
        response.status === 204 ||
        (response.status === 200 && (method === "DELETE" || method === "PUT"))
      ) {
        const contentLength = response.headers.get("content-length");
        if (contentLength === "0" || !response.body) return undefined;
      }
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof GarminTrainingClientError) {
        if (write && error.code === "invalid_response")
          throw new GarminTrainingClientError("unknown_outcome");
        throw error;
      }
      if (error instanceof GarminTrainingValidationError) throw error;
      if (controller.signal.aborted)
        throw new GarminTrainingClientError(write ? "unknown_outcome" : "request_timeout");
      throw new GarminTrainingClientError(write ? "unknown_outcome" : "network_unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
  private extractId<K extends "workoutId" | "scheduleId">(
    response: unknown | undefined,
    schema: z.ZodType<Record<K, number>>,
    key: K,
  ): Record<K, number> {
    if (response === undefined) throw new GarminTrainingClientError("unknown_outcome");
    const parsed = schema.safeParse(response);
    if (!parsed.success) throw new GarminTrainingClientError("invalid_response");
    return { [key]: parsed.data[key] } as Record<K, number>;
  }
  private extractWriteId<K extends "workoutId" | "scheduleId">(
    response: unknown | undefined,
    schema: z.ZodType<Record<K, number>>,
    key: K,
  ): Record<K, number> {
    try {
      return this.extractId(response, schema, key);
    } catch (error) {
      if (error instanceof GarminTrainingClientError && error.code === "invalid_response")
        throw new GarminTrainingClientError("unknown_outcome");
      throw error;
    }
  }
  private parseOptional<T>(response: unknown | undefined, schema: z.ZodType<T>): T | undefined {
    if (response === undefined) return undefined;
    const parsed = schema.safeParse(response);
    if (!parsed.success) throw new GarminTrainingClientError("invalid_response");
    return parsed.data;
  }
  private parseWriteOptional<T>(
    response: unknown | undefined,
    schema: z.ZodType<T>,
  ): T | undefined {
    try {
      return this.parseOptional(response, schema);
    } catch (error) {
      if (error instanceof GarminTrainingClientError && error.code === "invalid_response")
        throw new GarminTrainingClientError("unknown_outcome");
      throw error;
    }
  }
}
async function readBoundedJson(response: Response): Promise<unknown | undefined> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > GARMIN_TRAINING_MAX_RESPONSE_BYTES) {
    try {
      await response.body?.cancel();
    } catch {}
    throw new GarminTrainingClientError("invalid_response");
  }
  if (!response.body) throw new GarminTrainingClientError("invalid_response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > GARMIN_TRAINING_MAX_RESPONSE_BYTES) {
        try {
          await reader.cancel();
        } catch {}
        throw new GarminTrainingClientError("invalid_response");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total === 0) return undefined;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new GarminTrainingClientError("invalid_response");
  }
}
