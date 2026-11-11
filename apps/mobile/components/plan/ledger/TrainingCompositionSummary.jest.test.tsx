import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/lib/stores/theme-store", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}));
jest.mock("victory-native", () => ({
  Pie: { Chart: createHost("PieChart") },
  PolarChart: createHost("PolarChart"),
}));

const { TrainingCompositionSummary } = require("./TrainingCompositionSummary");

it("shows an interactive Victory duration donut and selected category details", async () => {
  await renderNative(
    <TrainingCompositionSummary
      composition={{
        activeDaysLabel: "2 active days",
        categories: [
          {
            activityCategory: "run",
            completedDuration: 5400,
            completedLabel: "1h 30m",
            label: "Run",
            plannedDuration: 2700,
            plannedLabel: "45 min",
          },
        ],
        completedDuration: 5400,
        completedLabel: "1h 30m",
        plannedDuration: 2700,
        plannedLabel: "45 min",
        sessionsLabel: "2 sessions",
      }}
    />,
  );

  expect(screen.getByTestId("training-composition-duration-donut")).toBeTruthy();
  expect(screen.getByText("1h 30m")).toBeTruthy();
  expect(screen.getByText("45 min")).toBeTruthy();
  expect(screen.getByText("1h 30m completed · 45 min planned")).toBeTruthy();
  expect(screen.getByText("2 sessions · 2 active days")).toBeTruthy();
  await fireEvent.press(screen.getByTestId("training-composition-run"));
  expect(
    screen.getByTestId("training-composition-selected-category").props.accessibilityLabel,
  ).toContain("Selected Run");
});

it("groups more than five categories without hiding the selected details", async () => {
  const categories = Array.from({ length: 6 }, (_, index) => ({
    activityCategory: `category-${index}`,
    completedDuration: 600,
    completedLabel: "10 min",
    label: `Category ${index}`,
    plannedDuration: 0,
    plannedLabel: "0 min",
  }));
  await renderNative(
    <TrainingCompositionSummary
      composition={{
        activeDaysLabel: null,
        categories,
        completedDuration: 3600,
        completedLabel: "1h",
        plannedDuration: 0,
        plannedLabel: "0 min",
        sessionsLabel: null,
      }}
    />,
  );

  expect(screen.getByTestId("training-composition-other")).toBeTruthy();
});

it("keeps unavailable duration distinct from zero", async () => {
  await renderNative(
    <TrainingCompositionSummary
      composition={{
        activeDaysLabel: null,
        categories: [],
        completedDuration: null,
        completedLabel: "—",
        plannedDuration: null,
        plannedLabel: "—",
        sessionsLabel: null,
      }}
    />,
  );

  expect(screen.getByText("Duration composition is unavailable for this period.")).toBeTruthy();
  expect(screen.queryByText(/0 min/)).toBeNull();
});
