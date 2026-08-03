import type { AthletePerformanceOverview } from "@repo/core/performance-model";
import { buildPerformanceOverviewFixture } from "@repo/core/testing/performance-model";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";
import { PerformanceModelSummary } from "./PerformanceModelSummary";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

function overviewFixture(): AthletePerformanceOverview {
  const overview = buildPerformanceOverviewFixture();
  return {
    ...overview,
    bike: {
      ...overview.bike,
      fiveSecondPower: {
        status: "partial",
        value: "1,200 W",
        confidence: "low",
        freshness: "current",
        trainingImpact: "Training targets stay unchanged.",
        action: "Record more activity data.",
      },
    },
  };
}

describe("PerformanceModelSummary", () => {
  it("aligns available, limited, and unavailable athlete states", () => {
    renderNative(<PerformanceModelSummary overview={overviewFixture()} />);

    expect(
      screen.getByLabelText(
        "Bike Planning threshold power: 247 W, Available. Confidence: High. Freshness: Current. Training impact: Sets cycling power zones and cycling power targets.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Bike Five-second power: 1,200 W, Limited. Confidence: Low. Freshness: Current. Training impact: Training targets stay unchanged. Record more activity data.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Run Planning threshold pace: Not available, Not available. Training impact: Training targets stay unchanged. Record more activity data.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        "Swim CSS pace: Not available, Not available. Training impact: Training targets stay unchanged.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/canonical|as-of|protocol|progressive|max-HR/i)).toBeNull();
  });
});
