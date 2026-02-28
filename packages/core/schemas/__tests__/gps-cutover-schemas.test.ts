import { describe, expect, it } from "vitest";
import {
  ActivityPayloadSchema,
  ActivityUploadSchema,
} from "../activity_payload";
import { activityPlanCreateSchema } from "../index";

describe("GPS cutover schemas", () => {
  it("accepts gpsRecordingEnabled and rejects legacy location in ActivityPayloadSchema", () => {
    expect(
      ActivityPayloadSchema.safeParse({
        category: "run",
        gpsRecordingEnabled: true,
      }).success,
    ).toBe(true);

    expect(
      ActivityPayloadSchema.safeParse({
        category: "run",
        gpsRecordingEnabled: true,
        location: "outdoor",
      }).success,
    ).toBe(false);
  });

  it("rejects location aliases in ActivityUploadSchema", () => {
    const base = {
      name: "Morning Run",
      type: "run" as const,
      startedAt: "2026-01-01T10:00:00.000Z",
      finishedAt: "2026-01-01T10:45:00.000Z",
      durationSeconds: 2700,
      movingSeconds: 2650,
      distanceMeters: 9000,
      metrics: {},
    };

    expect(ActivityUploadSchema.safeParse(base).success).toBe(true);

    expect(
      ActivityUploadSchema.safeParse({
        ...base,
        location: "outdoor",
      }).success,
    ).toBe(false);
  });

  it("does not require persisted GPS fields and rejects activity_location in activityPlanCreateSchema", () => {
    expect(
      activityPlanCreateSchema.safeParse({
        name: "Easy Run",
        description: "",
        activity_category: "run",
        structure: {
          version: 2,
          intervals: [],
        },
      }).success,
    ).toBe(true);

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Easy Run",
        description: "",
        activity_category: "run",
        activity_location: "outdoor",
        structure: {
          version: 2,
          intervals: [],
        },
      }).success,
    ).toBe(false);
  });
});
