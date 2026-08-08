import { describe, expect, it } from "vitest";
import { resolveAthleteStateMaterialEffectiveAt } from "./athlete-state-evidence";

describe("resolveAthleteStateMaterialEffectiveAt", () => {
  it("waits for a future parent activity when its effort was recorded earlier", () => {
    const activityFinishedAt = new Date("2026-08-08T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt,
        activityMaterialChanged: false,
        effortMaterialRecordedAt: new Date("2026-08-07T10:00:00.000Z"),
      }),
    ).toEqual(activityFinishedAt);
  });

  it("preserves a future effort boundary on an already-finished activity", () => {
    const effortMaterialRecordedAt = new Date("2026-08-08T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt: new Date("2026-08-01T10:00:00.000Z"),
        activityMaterialChanged: false,
        effortMaterialRecordedAt,
      }),
    ).toEqual(effortMaterialRecordedAt);
  });

  it("keeps an independently due activity change ahead of later effort evidence", () => {
    const activityFinishedAt = new Date("2026-08-01T10:00:00.000Z");

    expect(
      resolveAthleteStateMaterialEffectiveAt({
        activityFinishedAt,
        activityMaterialChanged: true,
        effortMaterialRecordedAt: new Date("2026-08-08T10:00:00.000Z"),
      }),
    ).toEqual(activityFinishedAt);
  });
});
