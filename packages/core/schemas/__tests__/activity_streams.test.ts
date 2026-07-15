import { describe, expect, it } from "vitest";
import { activityStreamRecordSchema } from "../activity_streams";

describe("activityStreamRecordSchema", () => {
  it("accepts parser-native Date timestamps", () => {
    const timestamp = new Date("2026-07-14T10:00:00.000Z");

    expect(
      activityStreamRecordSchema.parse({ timestamp, heartRate: 150, power: 220, speed: 4 }),
    ).toEqual({ timestamp, heartRate: 150, power: 220, speed: 4 });
  });
});
