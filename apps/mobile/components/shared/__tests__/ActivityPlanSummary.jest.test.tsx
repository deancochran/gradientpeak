import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityPlanSummary } from "../ActivityPlanSummary";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

const id = (value: number) => `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;

describe("ActivityPlanSummary", () => {
  it("labels expanded activity steps as plan volume", () => {
    renderNative(
      <ActivityPlanSummary
        estimatedDuration={900}
        showAttribution={false}
        structure={{
          version: 3,
          segments: [
            {
              id: id(4),
              role: "rest",
              name: "Prepare",
              duration: { type: "time", seconds: 60 },
            },
            {
              id: id(1),
              role: "activity",
              category: "run",
              name: "Run",
              intervals: [
                {
                  id: id(2),
                  name: "Work",
                  repetitions: 2,
                  steps: [
                    {
                      id: id(3),
                      name: "Tempo",
                      duration: { type: "time", seconds: 450 },
                      targets: [{ type: "RPE", intensity: 6 }],
                    },
                  ],
                },
              ],
            },
          ],
        }}
        title="Tempo repeats"
      />,
    );

    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("Steps")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("suppresses TSS and intensity when structure is unavailable", () => {
    renderNative(
      <ActivityPlanSummary
        activityCategory="run"
        estimatedTss={100}
        intensityFactor={0.9}
        showAttribution={false}
        structure={null}
        title="Brick session"
      />,
    );

    expect(screen.queryByText("TSS")).toBeNull();
    expect(screen.queryByText("Intensity")).toBeNull();
  });
});
