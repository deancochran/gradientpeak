// @vitest-environment jsdom

import { createUnavailableAthletePerformanceTargetFacts } from "@repo/core/performance-model";
import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ActivityPlanStructure } from "./activity-plan-structure";

const asOf = "2026-08-12T12:00:00.000Z";

const structure = {
  version: 3,
  activity_category: "bike",
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "activity",
      name: "Ride",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Work",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              name: "Tempo",
              duration: { type: "time", seconds: 60 },
              targets: [{ type: "%FTP", intensity: 80 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("ActivityPlanStructure", () => {
  afterEach(cleanup);
  it("shows confirmed personalized targets with their abstract source context", () => {
    const performanceTargets = buildPerformanceTargetFactsFixture({
      asOf,
      athleteId: "athlete-1",
      bikeThresholdWatts: 300,
    });

    render(
      <ActivityPlanStructure
        asOf="2026-08-12T13:00:00.000Z"
        performanceTargets={performanceTargets}
        structure={structure}
      />,
    );

    expect(screen.getByText(/240 W \(80% FTP\)/)).toBeTruthy();
  });

  it("keeps a stale canonical threshold usable without expiry suppression", () => {
    const performanceTargets = buildPerformanceTargetFactsFixture({
      asOf,
      athleteId: "athlete-1",
      bikeThresholdWatts: 300,
    });
    if (performanceTargets.thresholds.bike.status !== "available") {
      throw new Error("Expected an available bike threshold fixture.");
    }
    performanceTargets.thresholds.bike.freshness = "stale";

    render(
      <ActivityPlanStructure
        asOf="2026-08-14T12:00:00.000Z"
        performanceTargets={performanceTargets}
        structure={structure}
      />,
    );

    expect(screen.getByText(/240 W \(80% FTP\)/)).toBeTruthy();
  });

  it("keeps targets abstract when their calibration is unavailable", () => {
    render(
      <ActivityPlanStructure
        performanceTargets={createUnavailableAthletePerformanceTargetFacts(asOf, "athlete-1")}
        structure={structure}
      />,
    );

    expect(screen.getByText(/80% FTP$/, { exact: false })).toBeTruthy();
    expect(screen.queryByText(/240 W/)).toBeNull();
  });
});
