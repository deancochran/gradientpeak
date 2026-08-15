import { describe, expect, it } from "vitest";

import { buildPerformanceTargetFactsFixture } from "../../testing/performance-model";
import { athletePerformanceOverviewSchema, projectAthletePerformanceOverview } from "../overview";

describe("projectAthletePerformanceOverview", () => {
  it("projects canonical native thresholds with display-only pace conversions", () => {
    const overview = projectAthletePerformanceOverview(
      buildPerformanceTargetFactsFixture({
        bikeThresholdWatts: 250,
        runThresholdMetersPerSecond: 4,
        swimThresholdMetersPerSecond: 1.25,
      }),
    );

    expect(overview.thresholds).toEqual({
      bike: expect.objectContaining({ status: "available", value: "250 W" }),
      run: expect.objectContaining({ status: "available", value: "4:10 min/km" }),
      swim: expect.objectContaining({ status: "available", value: "1:20 min/100m" }),
    });
    expect(overview).not.toHaveProperty("bike.planningThresholdPower");
    expect(overview).not.toHaveProperty("run.planningThresholdPace");
    expect(overview).not.toHaveProperty("swim.cssPace");
  });

  it("retains stale usable target values without exposing expiry timestamps", () => {
    const facts = buildPerformanceTargetFactsFixture({ bikeThresholdWatts: 250 });
    if (facts.thresholds.bike.status !== "available") throw new Error("Expected bike threshold");
    facts.thresholds.bike.freshness = "stale";

    const overview = projectAthletePerformanceOverview(facts);

    expect(overview.thresholds.bike).toMatchObject({
      status: "available",
      value: "250 W",
      freshness: "stale",
      action: "Record more recent activity data.",
    });
    expect(JSON.stringify(overview)).not.toContain("expiresAt");
  });

  it("keeps heart-rate capabilities separate from threshold facts", () => {
    const overview = projectAthletePerformanceOverview(
      buildPerformanceTargetFactsFixture({ lthrBpm: { run: 175 }, maxHrBpm: { run: 195 } }),
    );

    expect(overview.heartRate.run).toEqual({
      lthr: expect.objectContaining({ status: "available", value: "175 bpm" }),
      maxHeartRate: expect.objectContaining({ status: "available", value: "195 bpm" }),
    });
    expect(overview.thresholds.run.status).toBe("unavailable");
  });

  it("rejects legacy overview fields", () => {
    const overview = projectAthletePerformanceOverview(buildPerformanceTargetFactsFixture());
    expect(
      athletePerformanceOverviewSchema.safeParse({
        ...overview,
        planningThresholdPower: overview.thresholds.bike,
      }).success,
    ).toBe(false);
  });
});
