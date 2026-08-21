import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";
import { ActivityPlanContentPreview } from "./ActivityPlanContentPreview";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("@/components/activity-plan/activity/TimelineChart", () => ({
  __esModule: true,
  TimelineChart: createHost("TimelineChart"),
}));

jest.mock("@/components/shared/StaticRouteMapPreview", () => ({
  __esModule: true,
  StaticRouteMapPreview: createHost("StaticRouteMapPreview"),
}));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

const structure = {
  version: 3,
  activity_category: "run",
  segments: [
    {
      id: id(1),
      role: "activity",
      name: "Tempo run",
      intervals: [
        {
          id: id(2),
          name: "Build",
          repetitions: 2,
          steps: [
            {
              id: id(3),
              name: "Tempo",
              duration: { type: "time", seconds: 300 },
              targets: [{ type: "RPE", intensity: 7 }],
            },
          ],
        },
      ],
    },
  ],
};

describe("ActivityPlanContentPreview", () => {
  it("shows the interval chart without an embedded profile heading", () => {
    renderNative(
      <ActivityPlanContentPreview
        plan={{ structure }}
        size="medium"
        testIDPrefix="structured-plan-preview"
      />,
    );

    expect(screen.queryByText("Intensity profile")).toBeNull();
    expect(screen.getByTestId("structured-plan-preview-timeline")).toBeTruthy();
  });

  it("does not render an empty visual wrapper for a metrics-only plan", () => {
    renderNative(
      <ActivityPlanContentPreview plan={{}} size="medium" testIDPrefix="metrics-only-preview" />,
    );

    expect(screen.queryByTestId("metrics-only-preview")).toBeNull();
    expect(screen.queryByText("Intensity profile")).toBeNull();
  });

  it("collapses repeated segment, activity_category, interval, and step labels", () => {
    renderNative(
      <ActivityPlanContentPreview
        plan={{
          structure: {
            version: 3,
            activity_category: "swim",
            segments: [
              {
                id: id(10),
                role: "activity",
                name: "Swim",
                intervals: [
                  {
                    id: id(11),
                    name: "Swim",
                    repetitions: 1,
                    steps: [
                      {
                        id: id(12),
                        name: "Swim",
                        duration: { type: "time", seconds: 1200 },
                        targets: [{ type: "RPE", intensity: 5 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }}
        size="large"
      />,
    );

    expect(screen.getAllByText("Swim")).toHaveLength(1);
    expect(screen.queryByText("swim")).toBeNull();
    expect(screen.getByText("5 RPE · 20min")).toBeTruthy();
  });

  it("keeps distinct hierarchy labels and formats longer target summaries", () => {
    renderNative(
      <ActivityPlanContentPreview
        plan={{
          structure: {
            version: 3,
            activity_category: "run",
            segments: [
              {
                id: id(20),
                role: "activity",
                name: "Run",
                intervals: [
                  {
                    id: id(21),
                    name: "क",
                    repetitions: 2,
                    steps: [
                      {
                        id: id(22),
                        name: "कि",
                        duration: { type: "time", seconds: 600 },
                        targets: [
                          { type: "cadence", intensity: 90 },
                          { type: "speed", intensity: 30 },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }}
        size="large"
      />,
    );

    expect(screen.getByText("Run")).toBeTruthy();
    expect(screen.getByText("क · 2x")).toBeTruthy();
    expect(screen.getByText("कि")).toBeTruthy();
    expect(screen.getByText("30 km/h · 90 rpm · 10min")).toBeTruthy();
  });

  it("shows authored fallback by default and viewer-personalized output only when enabled", () => {
    const bikeStructure = structuredClone(structure);
    bikeStructure.activity_category = "bike";
    bikeStructure.segments[0].intervals[0].steps[0].targets = [{ type: "%FTP", intensity: 80 }];
    const performanceTargets = buildPerformanceTargetFactsFixture({
      asOf: "2026-08-18T12:00:00.000Z",
      athleteId: "viewer-1",
      bikeThresholdWatts: 300,
    });
    const { rerender } = renderNative(
      <ActivityPlanContentPreview
        performanceTargets={performanceTargets}
        plan={{ structure: bikeStructure }}
        size="large"
      />,
    );

    expect(screen.getByText(/80% FTP/)).toBeTruthy();
    expect(screen.queryByText(/240 W/)).toBeNull();

    rerender(
      <ActivityPlanContentPreview
        personalizeTargets
        performanceTargets={performanceTargets}
        plan={{ structure: bikeStructure }}
        size="large"
      />,
    );
    expect(screen.getByText(/240 W \(80% FTP\)/)).toBeTruthy();
  });

  it("shows every authored instruction annotation on the full detail preview", () => {
    renderNative(
      <ActivityPlanContentPreview
        plan={{
          structure: {
            version: 3,
            activity_category: "run",
            segments: [
              {
                id: id(30),
                role: "activity",
                name: "Tempo run",
                notes: "Keep the warm-up easy.",
                intervals: [
                  {
                    id: id(31),
                    name: "Work",
                    notes: "Jog the recoveries.",
                    repetitions: 1,
                    steps: [
                      {
                        id: id(32),
                        name: "Tempo",
                        description: "Hold a controlled hard effort.",
                        notes: "Relax your shoulders.",
                        duration: { type: "time", seconds: 300 },
                        targets: [{ type: "RPE", intensity: 7 }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        }}
        size="large"
      />,
    );

    expect(screen.getByText("Keep the warm-up easy.")).toBeTruthy();
    expect(screen.getByText("Jog the recoveries.")).toBeTruthy();
    expect(screen.getByText("Hold a controlled hard effort.")).toBeTruthy();
    expect(screen.getByText("Relax your shoulders.")).toBeTruthy();
  });
});
