import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/lib/stores/theme-store", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
jest.mock("../training-path/planChartTheme", () => ({
  getPlanChartTheme: () => ({ intensity: { endurance: "#2563eb" } }),
}));

const { IntensityDistributionChart } = require("./IntensityDistributionChart");

it("keeps intensity unavailable when there are no classified bands", async () => {
  await renderNative(
    <IntensityDistributionChart
      intensity={{
        bands: [],
        durationLabel: "0 min",
        summary: "Intensity distribution is unavailable for this period.",
      }}
    />,
  );

  expect(screen.getByText("Time at intensity · 0 min")).toBeTruthy();
  expect(screen.getByText("Intensity distribution is unavailable for this period.")).toBeTruthy();
  expect(screen.queryByRole("image")).toBeNull();
});

it("renders every classified intensity band unchanged", async () => {
  await renderNative(
    <IntensityDistributionChart
      intensity={{
        bands: [
          {
            band: "endurance",
            durationLabel: "30 min",
            label: "Endurance",
            percentage: 100,
            percentageLabel: "100%",
          },
        ],
        durationLabel: "30 min",
        summary: "Intensity distribution across 30 min: Endurance 100%.",
      }}
    />,
  );

  expect(screen.getByRole("image").props.accessibilityLabel).toContain("Endurance 100%");
  expect(screen.getByText("Endurance 100% · 30 min")).toBeTruthy();
});
