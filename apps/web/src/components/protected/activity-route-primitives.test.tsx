// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  const activity = {
    contractVersion: "activity-display-v1" as const,
    id: "11111111-1111-4111-8111-111111111111",
    href: "/activities/11111111-1111-4111-8111-111111111111",
    owner: { id: "owner-1", username: "runner", avatarUrl: null },
    time: { startedAt: "2026-07-17T10:00:00.000Z", finishedAt: null },
    activityComposition: {
      kind: "multisport" as const,
      categories: ["run" as const, "bike" as const],
    },
    title: "Activity",
    notes: null,
    metrics: [
      {
        key: "common_load" as const,
        label: "Load",
        status: "unavailable" as const,
        value: null,
        unit: "score",
        reason: "quantification_unavailable",
      },
      {
        key: "normalized_intensity" as const,
        label: "Intensity",
        status: "unavailable" as const,
        value: null,
        unit: "ratio",
        reason: "quantification_unavailable",
      },
      {
        key: "elapsed_duration" as const,
        label: "Elapsed",
        status: "available" as const,
        value: 5_400,
        unit: "seconds",
        reason: null,
      },
    ],
    visibility: "private" as const,
    engagement: { likes: 0, comments: 0, viewerHasLiked: false },
    capabilities: {
      canLike: true,
      canComment: true,
      canShare: false,
      canEdit: true,
      canDelete: true,
      hasRoute: false,
    },
  };

  it("renders the canonical display projection", () => {
    render(<ActivityListCard activity={activity} onOpen={() => undefined} />);

    expect(screen.getByRole("heading", { name: "Activity" })).toBeTruthy();
    expect(screen.getByText("Run • Ride")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getAllByText("Unavailable")).toHaveLength(2);
    expect(screen.getByTestId("activity-card-11111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect(
      screen.getByTestId("activity-card-11111111-1111-4111-8111-111111111111-open"),
    ).toBeTruthy();
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
