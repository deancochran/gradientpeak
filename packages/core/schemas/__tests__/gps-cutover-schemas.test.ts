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

  it("requires structured intervals and rejects activity_location in activityPlanCreateSchema", () => {
    expect(
      activityPlanCreateSchema.safeParse({
        name: "Easy Run",
        description: "",
        activity_category: "run",
        structure: {
          version: 2,
          intervals: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Main Set",
              repetitions: 1,
              steps: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "Run",
                  duration: { type: "time", seconds: 600 },
                  targets: [{ type: "%MaxHR", intensity: 70 }],
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(true);

    expect(
      activityPlanCreateSchema.safeParse({
        name: "Route Only",
        description: "",
        activity_category: "run",
        structure: {
          version: 2,
          intervals: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              name: "Follow Route",
              repetitions: 1,
              steps: [
                {
                  id: "22222222-2222-4222-8222-222222222222",
                  name: "Follow Route",
                  duration: { type: "untilFinished" },
                  targets: [],
                },
              ],
            },
          ],
        },
      }).success,
    ).toBe(false);

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
    ).toBe(false);

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
