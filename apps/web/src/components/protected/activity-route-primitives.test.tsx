// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityCategoryBadges } from "../activity-category-presentation";

vi.mock("../app-href-link", () => ({
  AppHrefLink: (props: React.ComponentProps<"a">) => <a {...props} />,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => (
    <a {...props} href={to}>
      {children}
    </a>
  ),
}));

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
vi.mock("../../lib/api/client", () => ({
  api: {
    social: {
      toggleLike: {
        useMutation: () => ({ isPending: false, mutate: vi.fn() }),
      },
    },
  },
}));

afterEach(() => {
  cleanup();
});

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

  it("renders the mobile-aligned activity summary", () => {
    render(
      <ActivityListCard
        activity={{ ...activity, notes: "Steady aerobic work." }}
        onOpen={() => undefined}
      />,
    );

    expect(screen.getByRole("heading", { name: "Activity" })).toBeTruthy();
    expect(screen.getByText("@runner")).toBeTruthy();
    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("Ride")).toBeTruthy();
    expect(screen.getByText("Steady aerobic work.")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByTestId("activity-card-11111111-1111-4111-8111-111111111111")).toBeTruthy();
    expect(
      screen.getByTestId("activity-card-11111111-1111-4111-8111-111111111111-open"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Like activity Activity/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Comment on activity Activity/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Share activity Activity" })).toBeTruthy();
  });

  it("uses a descriptive activity link when rendered as navigation", () => {
    render(<ActivityListCard activity={activity} href={activity.href} />);

    expect(screen.getByRole("link", { name: "Open activity Activity" }).getAttribute("href")).toBe(
      activity.href,
    );
  });

  it("keeps Share visible and explains when a private activity cannot be shared", () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    render(<ActivityListCard activity={activity} />);

    fireEvent.click(screen.getByRole("button", { name: "Share activity Activity" }));

    expect(alert).toHaveBeenCalledWith("Only public activities can be shared.");
  });

  it("marks partial Load and Intensity values as estimates", () => {
    render(
      <ActivityListCard
        activity={{
          ...activity,
          metrics: [
            {
              key: "common_load",
              label: "Load",
              status: "partial",
              value: 32,
              unit: "score",
              reason: "quantification_partial",
            },
            {
              key: "normalized_intensity",
              label: "Intensity",
              status: "partial",
              value: 0.8,
              unit: "ratio",
              reason: "quantification_partial",
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Load")).toBeTruthy();
    expect(screen.getByText("Intensity")).toBeTruthy();
    expect(screen.queryByText("Load (partial)")).toBeNull();
    expect(screen.queryByText("Intensity (partial)")).toBeNull();
    expect(screen.getByText("~32")).toBeTruthy();
    expect(screen.getByText("~0.80")).toBeTruthy();
  });
});

describe("resource card selectors", () => {
  it("exposes route and effort identities plus their open actions", () => {
    render(
      <>
        <RouteListCard
          onOpen={() => undefined}
          route={{
            created_at: "2026-07-17T10:00:00.000Z",
            updated_at: "2026-07-17T10:00:00.000Z",
            description: null,
            id: "route-1",
            name: "Ridge loop",
            profile_id: null,
            file_path: "routes/ridge-loop.gpx",
            storage_state: "ready",
            total_distance: 1_000,
            total_ascent: null,
            total_descent: null,
            elevation_polyline: null,
            polyline: "encoded-polyline",
            is_system_template: false,
            is_public: false,
            likes_count: 0,
            has_liked: false,
          }}
        />
        <ActivityEffortListCard
          effort={{
            id: "effort-1",
            created_at: new Date("2026-07-17T10:00:00.000Z"),
            profile_id: "profile-1",
            activity_id: "activity-1",
            segment_id: "segment-1",
            activity_category: "run",
            effort_type: "power",
            source_series: "power",
            recorded_at: new Date("2026-07-17T10:00:00.000Z"),
            duration_seconds: 300,
            distance_meters: null,
            source_artifact_id: "artifact-1",
            source_revision: 1,
            start_offset_ms: 0,
            end_offset_ms: 300_000,
            window_coverage: 1,
            max_gap_seconds: 0,
            value: 300,
            unit: "watts",
            source: "derived",
            method: "activity_file_best_effort",
            calculation_version: "best-effort-extraction-v1",
            quality_score: null,
            provenance: {},
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
