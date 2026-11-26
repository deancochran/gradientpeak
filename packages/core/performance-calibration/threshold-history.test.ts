import { describe, expect, it } from "vitest";
import { mergeThresholdHistoryPages } from "./threshold-history";

describe("mergeThresholdHistoryPages", () => {
  it("keeps complete first-page objects across an overlapping older page and sorts newest first", () => {
    const current = {
      effectiveAt: "2026-05-01T00:00:00.000Z",
      provenance: { sourceActivities: ["newest-source"] },
      thresholdId: "current",
      value: 250,
    };
    const older = {
      effectiveAt: "2026-02-01T00:00:00.000Z",
      provenance: { sourceActivities: ["older-source"] },
      thresholdId: "older",
      value: 225,
    };

    expect(
      mergeThresholdHistoryPages(
        [current],
        [{ ...current, provenance: { sourceActivities: ["stale-source"] }, value: 999 }, older],
      ),
    ).toEqual([current, older]);
  });

  it("orders same-instant records by descending threshold ID", () => {
    expect(
      mergeThresholdHistoryPages([
        { effectiveAt: "2026-05-01T00:00:00.000Z", thresholdId: "a" },
        { effectiveAt: "2026-05-01T00:00:00.000Z", thresholdId: "b" },
      ]),
    ).toEqual([
      { effectiveAt: "2026-05-01T00:00:00.000Z", thresholdId: "b" },
      { effectiveAt: "2026-05-01T00:00:00.000Z", thresholdId: "a" },
    ]);
  });
});
