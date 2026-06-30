import React from "react";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import { BuilderScheduleEditor } from "../BuilderScheduleEditor";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: (props: any) => React.createElement("Pressable", props, props.children),
  ScrollView: (props: any) => React.createElement("ScrollView", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, disabled, onPress, ...props }: any) =>
    React.createElement(
      "Pressable",
      {
        ...props,
        accessibilityState: { disabled: Boolean(disabled) },
        disabled,
        onPress: disabled ? undefined : onPress,
      },
      children,
    ),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

jest.mock("lucide-react-native", () => {
  const Icon = (props: any) => React.createElement("Icon", props);
  return {
    __esModule: true,
    ChevronLeft: Icon,
    ChevronRight: Icon,
    Plus: Icon,
  };
});

jest.mock("../BuilderTrainingPathReviewSection", () => ({
  __esModule: true,
  BuilderTrainingPathReviewSection: () =>
    React.createElement("View", { testID: "mock-chart-review" }),
}));

jest.mock("../TrainingPlanBuilderEventCard", () => ({
  __esModule: true,
  TrainingPlanBuilderEventCard: () => React.createElement("View", { testID: "mock-event-card" }),
}));

const makeWeeks = () => [
  { label: "Week 1", plannedLoad: 100, targetLoad: 120, weekStart: "2026-02-02" },
  { label: "Week 2", plannedLoad: 110, targetLoad: 130, weekStart: "2026-02-09" },
  { label: "Week 3", plannedLoad: 90, targetLoad: 115, weekStart: "2026-02-16" },
];

const makeTimelineWeeks = () =>
  makeWeeks().map((week, weekIndex) => ({
    estimatedTss: week.plannedLoad,
    recommendedTss: week.targetLoad,
    sessions: [],
    weekIndex,
  }));

const renderEditor = (
  selectedWeekIndex: number,
  overrides: Partial<React.ComponentProps<typeof BuilderScheduleEditor>> = {},
) => {
  const weeks = makeWeeks();
  const props = {
    chartReview: {
      chart: { weeks },
      extendEnd: jest.fn(),
      extendStart: jest.fn(),
      selectDate: jest.fn(),
      selectWeekStart: jest.fn(),
      selectedDate: weeks[selectedWeekIndex]?.weekStart ?? null,
      selectedDayOffset: selectedWeekIndex * 7,
      selectedWeek: weeks[selectedWeekIndex],
      selectedWeekIndex,
      selectedWeekStart: weeks[selectedWeekIndex]?.weekStart ?? null,
    },
    estimateBySessionId: new Map(),
    onAddSession: jest.fn(),
    onAddSessionAtOffset: jest.fn(),
    onDuplicateSession: jest.fn(),
    onMoveSessionByDays: jest.fn(),
    onOpenSchedulePreview: jest.fn(),
    onPressSession: jest.fn(),
    onRemoveSession: jest.fn(),
    projection: {},
    showChart: false,
    viewModel: { timelineWeeks: makeTimelineWeeks() },
    ...overrides,
  } as unknown as React.ComponentProps<typeof BuilderScheduleEditor>;

  renderNative(<BuilderScheduleEditor {...props} />);

  return props;
};

describe("BuilderScheduleEditor selected day planning", () => {
  it("adds a workout at the selected week start offset", () => {
    const props = renderEditor(2);

    fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));

    expect(props.onAddSessionAtOffset).toHaveBeenCalledTimes(1);
    expect(props.onAddSessionAtOffset).toHaveBeenCalledWith(14);
  });

  it("adds a workout at the selected day offset when the chart has a selected day", () => {
    const props = renderEditor(1, {
      chartReview: {
        chart: { weeks: makeWeeks() },
        extendEnd: jest.fn(),
        extendStart: jest.fn(),
        selectDate: jest.fn(),
        selectWeekStart: jest.fn(),
        selectedDate: "2026-02-12",
        selectedDayOffset: 10,
        selectedWeek: makeWeeks()[1],
        selectedWeekIndex: 1,
        selectedWeekStart: "2026-02-09",
      },
    } as unknown as Partial<React.ComponentProps<typeof BuilderScheduleEditor>>);

    fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));

    expect(props.onAddSessionAtOffset).toHaveBeenCalledTimes(1);
    expect(props.onAddSessionAtOffset).toHaveBeenCalledWith(10);
  });
});
