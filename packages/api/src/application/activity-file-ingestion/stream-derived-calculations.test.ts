import { describe, expect, it } from "vitest";
import { buildActivityFileBestEffortRows } from "./stream-derived-calculations";

const timestamps = Array.from({ length: 61 }, (_, index) => index);
const base = {
  activityId: "11111111-1111-4111-8111-111111111111",
  profileId: "22222222-2222-4222-8222-222222222222",
  recordedAt: new Date("2026-07-13T12:00:00.000Z"),
  normalizedGradedSpeed: null,
};

function rowsFor(activityType: string) {
  return buildActivityFileBestEffortRows({
    ...base,
    activityType,
    streamMetadata: {
      timestamps,
      powerStream: timestamps.map(() => 250),
      speedStream: timestamps.map(() => 4),
      altitudeStream: timestamps.map(() => 0),
    },
  });
}

describe("buildActivityFileBestEffortRows", () => {
  it.each([
    ["bike", ["power"]],
    ["run", ["speed"]],
    ["swim", ["speed"]],
    ["strength", []],
  ])("enforces the %s stream-derived effort matrix", (activityType, effortTypes) => {
    const rows = rowsFor(activityType);
    expect([...new Set(rows.map((row) => row.effort_type))]).toEqual(effortTypes);
    expect(rows.every((row) => row.activity_category === activityType)).toBe(true);
  });

  it("persists canonical units and import provenance", () => {
    expect(rowsFor("bike")[0]).toMatchObject({
      effort_type: "power",
      unit: "watts",
      source: "imported",
      method: "activity_file_best_effort",
      provenance: { derived_from: "activity_file_stream", activity_id: base.activityId },
    });
    expect(rowsFor("swim")[0]).toMatchObject({
      effort_type: "speed",
      unit: "meters_per_second",
    });
  });
});
