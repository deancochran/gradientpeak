import { fireEvent } from "@testing-library/react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const captureProductAnalytics = jest.fn();

jest.mock("react-native", () => ({
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
  View: createHost("View"),
}));
jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  G: createHost("G"),
  Line: createHost("Line"),
  Polyline: createHost("Polyline"),
  Rect: createHost("Rect"),
}));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/lib/stores/theme-store", () => ({ useTheme: () => ({ resolvedTheme: "light" }) }));
jest.mock("@/lib/analytics/productAnalytics", () => ({
  useProductAnalytics: () => ({ capture: captureProductAnalytics }),
}));

const { PlanTrainingInsight } = require("./PlanTrainingInsight");

it("shows only completed/planned Load and selected-date actions in the overview", async () => {
  const onAdd = jest.fn();
  const onOpenDetails = jest.fn();
  await renderNative(
    <PlanTrainingInsight
      goalDate="2026-04-16"
      metric="load"
      onAdd={onAdd}
      onNextSelectedDate={jest.fn()}
      onOpenDetails={onOpenDetails}
      onPreviousSelectedDate={jest.fn()}
      points={[
        { date: "2026-04-15", effectiveCompletedLoad: 35, plannedLoad: 60 },
        { date: "2026-04-16", effectiveCompletedLoad: 0, plannedLoad: 45 },
      ]}
      selectedDate="2026-04-15"
      todayKey="2026-04-15"
      window={{ end: "2026-04-16", start: "2026-04-15" }}
    />,
  );

  expect(screen.getByText("■ Completed Load")).toBeTruthy();
  expect(screen.getByText("□ Planned Load")).toBeTruthy();
  expect(screen.getByText("Completed Load 35 · Planned Load 60")).toBeTruthy();
  expect(screen.queryByText("Fitness")).toBeNull();
  expect(screen.queryByText("Fatigue")).toBeNull();
  expect(screen.queryByText("Form")).toBeNull();
  await fireEvent.press(screen.getByTestId("plan-selected-date-add"));
  await fireEvent.press(screen.getByTestId("plan-selected-date-training-breakdown"));
  expect(screen.queryByTestId("plan-selected-date-calendar")).toBeNull();
  expect(onAdd).toHaveBeenCalledWith("2026-04-15");
  expect(onOpenDetails).toHaveBeenCalledWith("2026-04-15");
});

it("renders a partial-status subtotal without exposing its internal status", async () => {
  await renderNative(
    <PlanTrainingInsight
      goalDate={null}
      metric="load"
      onAdd={jest.fn()}
      onNextSelectedDate={jest.fn()}
      onOpenDetails={jest.fn()}
      onPreviousSelectedDate={jest.fn()}
      points={[
        {
          date: "2026-04-15",
          effectiveCompletedLoad: 70,
          effectiveCompletedLoadStatus: "partial",
          plannedLoad: 60,
        },
      ]}
      selectedDate="2026-04-15"
      todayKey="2026-04-15"
      window={{ end: "2026-04-15", start: "2026-04-15" }}
    />,
  );

  expect(screen.getByText("Completed Load 70 · Planned Load 60")).toBeTruthy();
  expect(screen.queryByText(/~70|partial|subtotal/i)).toBeNull();
});

it.each([
  ["fitness", { fitnessCtl: 40 }, { scheduledFitnessCtl: 44 }],
  ["fatigue", { actualFatigueAtl: 50 }, { scheduledFatigueAtl: 46 }],
  ["form", { formTsb: -4 }, { scheduledFormTsb: 3 }],
] as const)("keeps observed and scheduled %s separate and leaves missing days as gaps", async (metric, observed, scheduled) => {
  const label = `${metric.slice(0, 1).toUpperCase()}${metric.slice(1)}`;
  await renderNative(
    <PlanTrainingInsight
      goalDate={null}
      metric={metric}
      onAdd={jest.fn()}
      onNextSelectedDate={jest.fn()}
      onOpenDetails={jest.fn()}
      onPreviousSelectedDate={jest.fn()}
      points={[
        { date: "2026-04-13", ...observed },
        { date: "2026-04-14", ...observed },
        { date: "2026-04-15" },
        { date: "2026-04-16", ...scheduled },
        { date: "2026-04-17", ...scheduled },
      ]}
      selectedDate="2026-04-15"
      todayKey="2026-04-15"
      window={{ end: "2026-04-17", start: "2026-04-13" }}
    />,
  );

  expect(screen.getByText(`━ Observed ${label}`)).toBeTruthy();
  expect(screen.getByText(`┄ Scheduled / recommended ${label}`)).toBeTruthy();
  expect(
    screen.getByTestId(`plan-training-actual-${metric}-0`).props.points.split(" "),
  ).toHaveLength(2);
  expect(
    screen.getByTestId(`plan-training-scheduled-${metric}-0`).props.points.split(" "),
  ).toHaveLength(2);
  expect(screen.queryByTestId(`plan-training-actual-${metric}-1`)).toBeNull();
  expect(screen.getByTestId(`plan-training-scheduled-${metric}-0`).props.strokeDasharray).toBe(
    "6 4",
  );
  expect(
    screen.getByTestId("plan-training-chart-accessibility-summary").props.accessibilityLabel,
  ).toContain("Missing values remain gaps");
});
