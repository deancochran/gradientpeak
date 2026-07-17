import { describe, expect, it } from "vitest";
import { ActivityPayloadSchema, ActivityUploadSchema } from "../activity_payload";
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

  it("requires strict V3 structure and rejects top-level location/category aliases", () => {
    const structure = {
      version: 3 as const,
      segments: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          role: "activity" as const,
          category: "run" as const,
          name: "Run",
          intervals: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Main Set",
              repetitions: 1,
              steps: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "Run",
                  duration: { type: "time" as const, seconds: 600 },
                  targets: [{ type: "%MaxHR" as const, intensity: 70 }],
                },
              ],
            },
          ],
        },
      ],
    };

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Easy Run",
        description: "",
        structure,
      }).success,
    ).toBe(true);

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Old input",
        description: "",
        structure: { version: 2, intervals: [] },
      }).success,
    ).toBe(false);

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Easy Run",
        description: "",
        activity_category: "run",
        structure,
      }).success,
    ).toBe(false);

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Easy Run",
        description: "",
        activity_location: "outdoor",
        structure,
      }).success,
    ).toBe(false);
  });
});
