// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createActivityQuantificationBundle } from "../../test-support/activity-quantification";

import { ActivityCategoryBadges } from "../activity-category-presentation";
import {
  ActivityEffortListCard,
  ActivityListCard,
  EntityMapCard,
  LikeToggleButton,
  RouteListCard,
} from "./activity-route-primitives";

vi.mock("../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ unitSystem: "metric" }),
}));

afterEach(() => cleanup());

describe("ActivityListCard", () => {
  const unavailableHeartRateQuantification = createActivityQuantificationBundle({
    activityCategory: "run",
    id: "activity-run",
    kind: "observation",
    load: null,
    method: "heart_rate_zones",
    nativeIntensity: null,
    unavailableReason: "threshold_missing",
  });

  it("renders modern activity DTO category and elapsed fields", () => {
    render(
      <ActivityListCard
        activity={
          {
            id: "11111111-1111-4111-8111-111111111111",
            profile_id: "22222222-2222-4222-8222-222222222222",
            activity_categories: ["run", "bike", "run"],
            activity_kind: "multisport",
            name: "Brick activity",
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

    expect(screen.getByText("Brick activity")).toBeTruthy();
    expect(screen.getByText("Run • Ride")).toBeTruthy();
    expect(screen.getByText("Run, Ride")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("Common Load")).toBeTruthy();
    expect(screen.getByText("Normalized intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByText(/no canonical activity quantification was provided/i)).toBeTruthy();
    expect(screen.getByTestId("activity-card-11111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect(
      screen.getByTestId("activity-card-11111111-1111-4111-8111-111111111111-open"),
    ).toBeTruthy();
  });

  it("renders the canonical activity-category-specific LTHR diagnostic", () => {
    render(
      <ActivityListCard
        activity={{
          name: "Morning Run",
          started_at: "2026-07-17T10:00:00.000Z",
          activity_categories: ["run"],
          elapsed_ms: 3_600_000,
          avg_heart_rate: 150,
          derived: { observationQuantification: unavailableHeartRateQuantification },
          segment_loads: [{ observationQuantification: unavailableHeartRateQuantification }],
        }}
        onOpen={() => undefined}
      />,
    );

    expect(
      screen.getByText(/activity-category-specific LTHR is missing for this activity/),
    ).toBeTruthy();
    expect(screen.getByText(/Add a current activity-category-specific LTHR/)).toBeTruthy();
  });
});

describe("resource card selectors", () => {
  it("exposes route and effort identities plus their open actions", () => {
    render(
      <>
        <RouteListCard
          onOpen={() => undefined}
          route={{
            id: "route-1",
            name: "Ridge loop",
            created_at: "2026-07-17T10:00:00.000Z",
          }}
        />
        <ActivityEffortListCard
          effort={{
            id: "effort-1",
            activity_category: "run",
            effort_type: "threshold",
            recorded_at: "2026-07-17T10:00:00.000Z",
            value: 300,
            unit: "seconds",
          }}
          onOpen={() => undefined}
        />
      </>,
    );

    expect(screen.getByTestId("route-card-route-1")).toBeTruthy();
    expect(screen.getByTestId("route-card-route-1-open")).toBeTruthy();
    expect(screen.getByTestId("activity-effort-card-effort-1")).toBeTruthy();
    expect(screen.getByTestId("activity-effort-card-effort-1-open")).toBeTruthy();
  });
});

describe("EntityMapCard", () => {
  it("exposes the route section and visualization with accessible semantics", () => {
    render(
      <EntityMapCard
        coordinates={[
          { latitude: 40.1, longitude: -74.1 },
          { latitude: 40.2, longitude: -74.2 },
        ]}
        emptyMessage="No route"
        title="Route preview"
      />,
    );

    expect(screen.getByRole("heading", { name: "Route preview" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Route preview map" })).toBeTruthy();
  });
});

describe("LikeToggleButton", () => {
  it("surfaces an explicit retry action after a failed optimistic update", () => {
    render(
      <LikeToggleButton
        count={0}
        liked={false}
        onClick={() => undefined}
        retryLabel="Retry like"
      />,
    );

    expect(screen.getByRole("button", { name: "Retry like" })).toBeTruthy();
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
