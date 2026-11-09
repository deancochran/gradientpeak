// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ activity: null as Record<string, unknown> | null }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: object) => ({
    ...options,
    useLoaderData: () => ({ activity: mocks.activity }),
  }),
  notFound: vi.fn(),
}));
vi.mock("../../../lib/public-share", () => ({ loadPublicActivity: vi.fn() }));

import { Route } from "./$activityId";

afterEach(cleanup);

function activityWith(performance: Record<string, number | null>) {
  return {
    activityComposition: { categories: ["run"] },
    likes: 0,
    notes: null,
    owner: { name: "Runner", username: null },
    performance: {
      distanceMeters: 0,
      elapsedSeconds: 0,
      movingSeconds: null,
      timingCoverage: "complete",
      ...performance,
    },
    sourceArtifact: null,
    startedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("PublicActivityPage performance details", () => {
  it("renders zero-valued shared metrics rather than treating them as absent", () => {
    mocks.activity = activityWith({
      averageHeartRate: 0,
      averagePower: 0,
      calories: 0,
      elevationGainMeters: 0,
      maximumHeartRate: 0,
      maximumPower: 0,
    });
    const PublicActivityPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<PublicActivityPage />);
    expect(screen.getByText("Average heart rate").parentElement?.textContent).toContain("0 bpm");
    expect(screen.getByText("Average power").parentElement?.textContent).toContain("0 W");
    expect(screen.getByText("Calories").parentElement?.textContent).toContain("0 kcal");
    expect(screen.getByText("Elevation gain").parentElement?.textContent).toContain("0 m");
  });

  it("renders null shared metrics as not shared", () => {
    mocks.activity = activityWith({
      averageHeartRate: null,
      averagePower: null,
      calories: null,
      elevationGainMeters: null,
      maximumHeartRate: null,
      maximumPower: null,
    });
    const PublicActivityPage = (Route as unknown as { component: React.ComponentType }).component;
    render(<PublicActivityPage />);
    expect(screen.getAllByText("Not shared")).toHaveLength(7);
  });
});
