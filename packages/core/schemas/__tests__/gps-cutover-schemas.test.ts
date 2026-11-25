import { describe, expect, it } from "vitest";
import { ActivityPayloadSchema, ActivityUploadSchema } from "../activity_payload";
import { activityPlanCreateSchema } from "../index";

describe("GPS cutover schemas", () => {
  it("requires GPS-off launch payloads and rejects legacy location aliases", () => {
    expect(
      ActivityPayloadSchema.safeParse({
        activity_category: "run",
        gpsRecordingEnabled: false,
      }).success,
    ).toBe(true);
    expect(
      ActivityPayloadSchema.safeParse({
        activity_category: "run",
        gpsRecordingEnabled: true,
      }).success,
    ).toBe(false);
    expect(
      ActivityPayloadSchema.safeParse({
        activity_category: "run",
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
    for (const retiredField of ["ftp", "threshold_hr"] as const) {
      expect(
        ActivityUploadSchema.safeParse({
          ...base,
          profileSnapshot: { [retiredField]: 250 },
        }).success,
      ).toBe(false);
    }
  });
  it("requires strict structure and rejects top-level location/activity_category aliases", () => {
    const structure = {
      version: 5 as const,
      activity_category: "run" as const,
      items: [
        {
          type: "step",
          id: "22222222-2222-4222-8222-222222222222",
          name: "Run",
          duration: { type: "time" as const, seconds: 600 },
          targets: [{ type: "%MaxHR" as const, intensity: 70 }],
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
