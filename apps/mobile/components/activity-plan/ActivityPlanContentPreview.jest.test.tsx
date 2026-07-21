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

jest.mock("@/components/activity-plan/workout/TimelineChart", () => ({
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
  segments: [
    {
      id: id(1),
      role: "activity",
      category: "run",
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
      <ActivityPlanContentPreview
        plan={{
          authoritative_metrics: {
            estimated_duration: 3600,
            estimated_tss: 70,
            intensity_factor: 0.8,
          },
        }}
        size="medium"
        testIDPrefix="metrics-only-preview"
      />,
    );

    expect(screen.queryByTestId("metrics-only-preview")).toBeNull();
    expect(screen.queryByText("Intensity profile")).toBeNull();
  });

  it("collapses repeated segment, category, interval, and step labels in a multisport flow", () => {
    renderNative(
      <ActivityPlanContentPreview
        plan={{
          structure: {
            version: 3,
            segments: [
              {
                id: id(10),
                role: "activity",
                category: "swim",
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
              {
                id: id(13),
                role: "transition",
                name: "Transition 1",
                duration: { type: "time", seconds: 240 },
              },
              {
                id: id(14),
                role: "activity",
                category: "bike",
                name: "Bike",
                intervals: [
                  {
                    id: id(15),
                    name: "Bike",
                    repetitions: 1,
                    steps: [
                      {
                        id: id(16),
                        name: "Bike",
                        duration: { type: "time", seconds: 2700 },
                        targets: [{ type: "RPE", intensity: 6 }],
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
    expect(screen.getByText("RPE 5 · 20min")).toBeTruthy();
    expect(screen.getByText("Transition 1")).toBeTruthy();
    expect(screen.queryByText("transition")).toBeNull();
    expect(screen.getByText("4min")).toBeTruthy();
    expect(screen.getAllByText("Bike")).toHaveLength(1);
    expect(screen.queryByText("bike")).toBeNull();
    expect(screen.getByText("RPE 6 · 45min")).toBeTruthy();
  });

  it("keeps distinct hierarchy labels and formats longer target summaries", () => {
    renderNative(
      <ActivityPlanContentPreview
        plan={{
          structure: {
            version: 3,
            segments: [
              {
                id: id(20),
                role: "activity",
                category: "run",
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
                          { type: "speed", intensity: 30 },
                          { type: "cadence", intensity: 90 },
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
});
