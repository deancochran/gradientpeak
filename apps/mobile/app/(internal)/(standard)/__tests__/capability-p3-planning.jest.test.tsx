import React from "react";
import { createHost, createPressableHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const setRangeMock = jest.fn();
const Button = createPressableHost();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ navigate: jest.fn() }) }));
jest.mock("@repo/ui/components/button", () => ({ Button }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("Fallback"),
}));
jest.mock("@/components/shared", () => ({ AppHeader: createHost("AppHeader") }));
jest.mock("@/components/calendar/CalendarAgendaSheet", () => ({
  CalendarAgendaSheet: createHost("CalendarAgendaSheet"),
}));
jest.mock("@/components/plan/ledger/PlanningLedgerSheet", () => ({
  PlanningLedgerSheet: createHost("PlanningLedgerSheet"),
}));
jest.mock("@/components/plan/training-path/TrainingPathSection", () => ({
  TrainingPathSection: ({ chartRange, onChartRangeChange }: Record<string, unknown>) =>
    React.createElement("View", null, [
      React.createElement("Text", { key: "heading" }, "Weekly Training Path"),
      React.createElement("Pressable", {
        key: "range",
        onPress: () => (onChartRangeChange as (range: string) => void)("weekly"),
        testID: "training-path-range-weekly",
        accessibilityLabel: `Training path range: ${chartRange}`,
      }),
    ]),
}));
jest.mock("@/components/plan/training-path/usePlanTrainingPathData", () => ({
  usePlanTrainingPathData: () => ({
    queryFailureCount: 0,
    hasUsableData: true,
    trainingPath: { selectedWeekSummary: null },
    dailyTrainingPathPoints: [],
    chartLoading: false,
    chartUnavailable: false,
    selectedDate: "2026-04-15",
    handleRefresh: jest.fn(),
    handleSelectedDateChange: jest.fn(),
    handleSelectedWeekChange: jest.fn(),
  }),
}));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/lib/stores/planDisplayPreferences", () => ({
  usePlanDisplayPreferences: (
    selector: (state: { range: string; setRange: jest.Mock }) => unknown,
  ) => selector({ range: "daily", setRange: setRangeMock }),
}));

const Plan = require("../../(tabs)/plan").default;

it("shows the composed training path and changes its display range", () => {
  renderNative(<Plan />);

  expect(screen.getByText("Weekly Training Path")).toBeTruthy();
  fireEvent.press(screen.getByTestId("training-path-range-weekly"));

  expect(setRangeMock).toHaveBeenCalledWith("weekly");
});
