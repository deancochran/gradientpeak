// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityListCard } from "./activity-route-primitives";

vi.mock("../../hooks/use-viewing-user-preferred-unit-system", () => ({
  useViewingUserPreferredUnitSystem: () => ({ unitSystem: "metric" }),
}));

afterEach(() => cleanup());

describe("ActivityListCard", () => {
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
    expect(screen.getByText("Run → Ride → Run")).toBeTruthy();
    expect(screen.getByText("1h 30m")).toBeTruthy();
  });
});
