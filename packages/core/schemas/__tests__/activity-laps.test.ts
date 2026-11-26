import { describe, expect, it } from "vitest";
import {
  activityLapRecordListSchema,
  MAX_ACTIVITY_LAPS,
  MAX_ACTIVITY_LAPS_JSON_BYTES,
  parseActivityLapRecords,
} from "../activity_streams";

describe("canonical activity laps", () => {
  it.each([0, 1, 10, 50, 200, 1000])("preserves stable order for %i laps", (count) => {
    const laps = Array.from({ length: count }, (_, index) => ({ distanceMeters: index }));
    expect(activityLapRecordListSchema.parse(laps)).toEqual(laps);
  });

  it("rejects excessive and malformed payloads", () => {
    expect(() =>
      activityLapRecordListSchema.parse(
        Array.from({ length: MAX_ACTIVITY_LAPS + 1 }, (_, distanceMeters) => ({ distanceMeters })),
      ),
    ).toThrow();
    expect(parseActivityLapRecords({ not: "an array" })).toEqual([]);
    expect(parseActivityLapRecords([null])).toEqual([]);
  });

  it("enforces the serialized writer-size boundary exactly", () => {
    const empty = [{ payload: "" }];
    const overhead = new TextEncoder().encode(JSON.stringify(empty)).byteLength;
    const atLimit = [{ payload: "x".repeat(MAX_ACTIVITY_LAPS_JSON_BYTES - overhead) }];
    expect(activityLapRecordListSchema.parse(atLimit)).toEqual(atLimit);
    expect(() =>
      activityLapRecordListSchema.parse([{ payload: `${atLimit[0]?.payload}x` }]),
    ).toThrow("1 MiB");
  });
});
