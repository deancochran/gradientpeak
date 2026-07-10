import { describe, expect, it } from "vitest";
import {
  lineageGroupIdSchema,
  parseLineageGroupId,
  parseSourceId,
  selectOnePerLineage,
  sourceIdSchema,
} from "../lineage";

describe("sourceIdSchema", () => {
  it.each([
    "activity",
    "metric",
    "effort",
    "goal",
    "manual",
  ])("accepts the approved %s namespace", (namespace) => {
    expect(sourceIdSchema.safeParse(`${namespace}:opaque-id`).success).toBe(true);
  });

  it("rejects unapproved and malformed namespaces", () => {
    for (const value of ["unknown:123", "activity:", "activity", ":123"]) {
      expect(sourceIdSchema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts opaque non-UUID identifiers containing additional colons", () => {
    const value = sourceIdSchema.parse("metric:garmin:daily-summary:2026-07-10");

    expect(parseSourceId(value)).toEqual({
      namespace: "metric",
      opaqueId: "garmin:daily-summary:2026-07-10",
    });
  });
});

describe("lineageGroupIdSchema", () => {
  it.each([
    "activity",
    "metric",
    "manual-test",
  ])("accepts the approved %s namespace", (namespace) => {
    expect(lineageGroupIdSchema.safeParse(`${namespace}:opaque-id`).success).toBe(true);
  });

  it("validates lineage namespaces separately from source namespaces", () => {
    expect(sourceIdSchema.safeParse("effort:abc-123").success).toBe(true);
    expect(lineageGroupIdSchema.safeParse("effort:abc-123").success).toBe(false);
    expect(sourceIdSchema.safeParse("manual-test:abc-123").success).toBe(false);
  });

  it("parses an activity lineage independently from an effort source", () => {
    const sourceId = sourceIdSchema.parse("effort:abc-123");
    const lineageId = lineageGroupIdSchema.parse("activity:def-456");

    expect(parseSourceId(sourceId).namespace).toBe("effort");
    expect(parseLineageGroupId(lineageId)).toEqual({
      namespace: "activity",
      opaqueId: "def-456",
    });
  });
});

describe("selectOnePerLineage", () => {
  const activityOne = lineageGroupIdSchema.parse("activity:one");
  const activityTwo = lineageGroupIdSchema.parse("activity:two");

  it("selects only the greatest influence from duplicate lineage groups", () => {
    const values = [
      { id: "lower", lineage: activityOne, influence: 0.3 },
      { id: "higher", lineage: activityOne, influence: 0.8 },
    ];

    expect(
      selectOnePerLineage({
        values,
        lineageOf: (value) => value.lineage,
        influenceOf: (value) => value.influence,
      }),
    ).toEqual([values[1]]);
  });

  it("keeps different lineage groups independent", () => {
    const values = [
      { id: "one", lineage: activityOne, influence: 0.4 },
      { id: "two", lineage: activityTwo, influence: 0.2 },
    ];

    expect(
      selectOnePerLineage({
        values,
        lineageOf: (value) => value.lineage,
        influenceOf: (value) => value.influence,
      }),
    ).toEqual(values);
  });

  it("deterministically retains the earliest item when influences tie", () => {
    const values = [
      { id: "first", lineage: activityOne, influence: 0.5 },
      { id: "second", lineage: activityOne, influence: 0.5 },
    ];

    expect(
      selectOnePerLineage({
        values,
        lineageOf: (value) => value.lineage,
        influenceOf: (value) => value.influence,
      }),
    ).toEqual([values[0]]);
  });

  it("does not mutate the input array or selected values", () => {
    const first = Object.freeze({
      id: "first",
      lineage: activityOne,
      influence: 0.2,
    });
    const second = Object.freeze({
      id: "second",
      lineage: activityOne,
      influence: 0.9,
    });
    const values = Object.freeze([first, second]);

    const result = selectOnePerLineage({
      values,
      lineageOf: (value) => value.lineage,
      influenceOf: (value) => value.influence,
    });

    expect(result).toEqual([second]);
    expect(values).toEqual([first, second]);
    expect(result[0]).toBe(second);
  });
});
