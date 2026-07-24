// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityCategoryBadges } from "../activity-category-presentation";
import { ActivityListCard } from "./activity-route-primitives";

vi.mock("../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ unitSystem: "metric" }),
}));

afterEach(() => cleanup());

describe("ActivityListCard", () => {
  const unavailableHeartRateLoad = {
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    sport: "run",
    method: "heart_rate_zones",
    quality: null,
    thresholdEvidence: null,
    sessionRpeEvidence: null,
    evidenceFingerprint: null,
    computedAsOf: "2026-07-21T12:00:00.000Z",
    contributingDurationSeconds: null,
    reason: "threshold_missing",
  } as const;
  const unavailableAggregate = {
    status: "unavailable",
    model: "gradientpeak_relative_load",
    version: "1",
    contributingDurationSeconds: 0,
    knownDurationSeconds: 3_600,
    contributingActivityCount: 0,
    partialActivityCount: 0,
    unavailableActivityCount: 1,
    totalActivityCount: 1,
    activityCountCoverage: 0,
    knownDurationCoverage: 0,
    unknownDurationActivityCount: 0,
    reason: "no_load_data",
  } as const;

  it("renders modern activity DTO category and elapsed fields", () => {
    render(
      <ActivityListCard
        activity={
          {
            id: "11111111-1111-4111-8111-111111111111",
            profile_id: "22222222-2222-4222-8222-222222222222",
            activity_categories: ["run", "bike", "run"],
            activity_kind: "multisport",
            name: "Brick workout",
            notes: null,
            started_at: new Date("2026-07-17T10:00:00.000Z"),
            finished_at: new Date("2026-07-17T11:30:00.000Z"),
            elapsed_ms: 5_400_000,
            active_ms: null,
            moving_ms: null,
            timing_coverage: "unavailable",
            distance_meters: 25_000,
            derived: null,
            has_liked: false,
            likes_count: 0,
          } as never
        }
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByText("Brick workout")).toBeTruthy();
    expect(screen.getByText("Run • Ride")).toBeTruthy();
    expect(screen.getByText("Run, Ride")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText(/no current result was provided/i)).toBeTruthy();
  });

  it("renders the canonical sport-specific LTHR diagnostic", () => {
    render(
      <ActivityListCard
        activity={{
          name: "Morning Run",
          started_at: "2026-07-17T10:00:00.000Z",
          activity_categories: ["run"],
          elapsed_ms: 3_600_000,
          avg_heart_rate: 150,
          derived: { common_load: unavailableAggregate },
          segment_loads: [{ common_load: unavailableHeartRateLoad }],
        }}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByText(/sport-specific LTHR is missing for this activity/)).toBeTruthy();
    expect(screen.getByText(/Add a current sport-specific LTHR/)).toBeTruthy();
  });
});

describe("ActivityCategoryBadges", () => {
  it("renders one icon and label for every unique category", () => {
    render(<ActivityCategoryBadges categories={["run", "bike", "run"]} />);

    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Ride")).toBeTruthy();
    expect(screen.getAllByText("🏃")).toHaveLength(1);
    expect(screen.getAllByText("🚴")).toHaveLength(1);
  });
});
