import React from "react";
import type { HostProps, PressableHostProps } from "../../../../test/mock-components";

import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import { BuilderScheduleEditor } from "../BuilderScheduleEditor";

let mockScrollViewCount = 0;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: (props: HostProps) => React.createElement("Pressable", props, props.children),
  ScrollView: (props: HostProps) => {
    mockScrollViewCount += 1;
    return React.createElement("ScrollView", props, props.children);
  },
  View: (props: HostProps) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, disabled, onPress, ...props }: PressableHostProps) =>
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
  Text: (props: HostProps) => React.createElement("Text", props, props.children),
}));

jest.mock("lucide-react-native", () => {
  const Icon = (props: HostProps) => React.createElement("Icon", props);
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
  TrainingPlanBuilderEventCard: ({
    onDuplicate,
    onEdit,
    onMoveByDays,
    onRemove,
  }: {
    onDuplicate: () => void;
    onEdit: () => void;
    onMoveByDays: (days: number) => void;
    onRemove: () => void;
  }) =>
    React.createElement(
      "View",
      { testID: "mock-event-card" },
      React.createElement("Pressable", { onPress: onEdit, testID: "event-edit" }),
      React.createElement("Pressable", { onPress: onDuplicate, testID: "event-duplicate" }),
      React.createElement("Pressable", { onPress: () => onMoveByDays(1), testID: "event-move" }),
      React.createElement("Pressable", { onPress: onRemove, testID: "event-remove" }),
    ),
}));

const makeWeeks = () => [
  { label: "Week 1", plannedLoad: 100, targetLoad: 120, weekStart: "2026-02-02" },
  { label: "Week 2", plannedLoad: 110, targetLoad: 130, weekStart: "2026-02-09" },
  { label: "Week 3", plannedLoad: 90, targetLoad: 115, weekStart: "2026-02-16" },
];

const makeTimelineWeeks = () =>
  makeWeeks().map((week, weekIndex) => ({
    estimatedCommonLoad: week.plannedLoad,
    recommendedLoad: week.targetLoad,
    sessions: [],
    weekIndex,
  }));

function getFirstByTestId(testID: string) {
  const first = screen.getAllByTestId(testID)[0];
  if (!first) throw new Error(`Expected at least one element with testID ${testID}`);
  return first;
}

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
  beforeEach(() => {
    mockScrollViewCount = 0;
  });
  it("adds a activity at the selected week start offset", () => {
    const props = renderEditor(2);

    fireEvent.press(screen.getByTestId("builder-sessions-workspace-add"));

    expect(props.onAddSessionAtOffset).toHaveBeenCalledTimes(1);
    expect(props.onAddSessionAtOffset).toHaveBeenCalledWith(14);
  });

  it("adds a activity at the selected day offset when the chart has a selected day", () => {
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

  it("renders selected-day sessions in the parent vertical flow without a capped inner scroll area", () => {
    const props = renderEditor(0, {
      viewModel: {
        timelineWeeks: [
          {
            sessions: [
              { session: { localId: "session-1", offsetDays: 0 } },
              { session: { localId: "session-2", offsetDays: 0 } },
            ],
            weekIndex: 0,
          },
        ],
      },
    } as unknown as Partial<React.ComponentProps<typeof BuilderScheduleEditor>>);

    expect(screen.getAllByTestId("mock-event-card")).toHaveLength(2);
    expect(mockScrollViewCount).toBe(0);
    fireEvent.press(getFirstByTestId("event-edit"));
    fireEvent.press(getFirstByTestId("event-duplicate"));
    fireEvent.press(getFirstByTestId("event-move"));
    fireEvent.press(getFirstByTestId("event-remove"));
    expect(props.onPressSession).toHaveBeenCalledWith("session-1");
    expect(props.onDuplicateSession).toHaveBeenCalledWith("session-1");
    expect(props.onMoveSessionByDays).toHaveBeenCalledWith("session-1", 1);
    expect(props.onRemoveSession).toHaveBeenCalledWith("session-1");
  });
});
