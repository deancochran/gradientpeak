import { Activity } from "lucide-react-native";

import { renderNative } from "../../test/render-native";
import { metricCardFixtures } from "./fixtures";
import { MetricCard } from "./index.native";

describe("MetricCard native", () => {
  it("renders comparison fixture content", () => {
    const { getByText } = renderNative(
      <MetricCard {...metricCardFixtures.distance} icon={Activity} />,
    );

    expect(getByText(metricCardFixtures.distance.label)).toBeTruthy();
    expect(getByText(String(metricCardFixtures.distance.value))).toBeTruthy();
    expect(getByText(String(metricCardFixtures.distance.comparisonValue))).toBeTruthy();
  });
});
