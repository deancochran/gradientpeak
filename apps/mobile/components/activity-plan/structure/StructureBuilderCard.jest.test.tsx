import type {
  ActivityPlanInterval,
  ActivityPlanIntervalStep,
  ActivityPlanSegment,
} from "@repo/core";
import { createElement, type ReactNode } from "react";
import type { ActivityPlanCopyResult } from "@/lib/stores/activityPlanCreation";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import { StructureBuilderCard } from "./StructureBuilderCard";

const timelineProps = jest.fn();
const resourceMetricsProps = jest.fn();
const mockDraggableListProps = jest.fn();

type MockDraggableListProps = {
  data: unknown[];
  renderItem: (params: {
    item: unknown;
    drag: () => void;
    getIndex: () => number;
    isActive: boolean;
  }) => ReactNode;
};

jest.mock("react-native-draggable-flatlist", () => ({
  NestableDraggableFlatList: (props: MockDraggableListProps) => {
    mockDraggableListProps(props);
    return createElement(
      "NestableDraggableFlatList",
      props,
      props.data.map((item, index) =>
        createElement(
          "DraggableRow",
          { key: String(index) },
          props.renderItem({ item, drag: jest.fn(), getIndex: () => index, isActive: false }),
        ),
      ),
    );
  },
}));

jest.mock("@/components/activity-plan/activity/TimelineChart", () => ({
  TimelineChart: (props: unknown) => {
    timelineProps(props);
    return null;
  },
}));

jest.mock("@/components/shared/ResourceCardPrimitives", () => ({
  ResourceMetricsRow: (props: object) => {
    resourceMetricsProps(props);
    return createElement("ResourceMetricsRow", props);
  },
}));

const structure = {
  version: 3 as const,
  activity_category: "run" as const,
  segments: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      role: "activity" as const,
      name: "Run",
      intervals: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Main",
          repetitions: 1,
          steps: [
            {
              id: "00000000-0000-4000-8000-000000000003",
              name: "Steady",
              duration: { type: "time" as const, seconds: 300 },
              targets: [{ type: "RPE" as const, intensity: 5 }],
            },
          ] satisfies [ActivityPlanIntervalStep],
        },
      ] satisfies [ActivityPlanInterval],
    },
  ] satisfies [ActivityPlanSegment],
};

describe("StructureBuilderCard", () => {
  it("keeps the chart as the compact interval navigation surface", async () => {
    const onAddInterval = jest.fn();
    const onTimelineIntervalPress = jest.fn();
    await renderNative(
      <StructureBuilderCard
        intervals={structure.segments[0].intervals}
        onAddInterval={onAddInterval}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={jest.fn(() => ({ success: true as const }))}
        onDeleteInterval={jest.fn()}
        onTimelineIntervalPress={onTimelineIntervalPress}
        segmentId={structure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={structure}
        structureStats={{
          distanceMeters: 0,
          durationMs: 300_000,
          hasOpenDuration: false,
          hasPartialDuration: false,
          stepCount: 1,
        }}
        validationErrors={{}}
      />,
    );

    expect(screen.getByText("Structure")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-structure-card").props.className).toContain(
      "rounded-3xl border border-border bg-card p-4",
    );
    expect(screen.getByTestId("activity-plan-structure-metrics")).toBeTruthy();
    expect(resourceMetricsProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metrics: [
          { label: "Expected duration", value: "5m" },
          { label: "Steps", value: "1" },
        ],
      }),
    );
    expect(screen.queryByText("Activity intensity")).toBeNull();
    expect(timelineProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        height: 156,
        onIntervalPress: onTimelineIntervalPress,
      }),
    );
    await fireEvent.press(screen.getByText("Add interval"));
    expect(onAddInterval).toHaveBeenCalledTimes(1);
  });

  it("keeps copy and delete as separate row actions without opening the editor", async () => {
    const onTimelineIntervalPress = jest.fn();
    const onDeleteInterval = jest.fn();
    const onDuplicateInterval = jest.fn(
      (): ActivityPlanCopyResult => ({
        success: true,
      }),
    );
    const interval = structure.segments[0].intervals[0];
    if (!interval) throw new Error("Expected an interval in the test fixture.");
    await renderNative(
      <StructureBuilderCard
        intervals={structure.segments[0].intervals}
        onAddInterval={jest.fn()}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={onDuplicateInterval}
        onDeleteInterval={onDeleteInterval}
        onTimelineIntervalPress={onTimelineIntervalPress}
        segmentId={structure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={structure}
        structureStats={{
          distanceMeters: 0,
          durationMs: 300_000,
          hasOpenDuration: false,
          hasPartialDuration: false,
          stepCount: 1,
        }}
        validationErrors={{}}
      />,
    );

    expect(screen.getByText("1× · 5 min")).toBeTruthy();
    expect(screen.getByLabelText("Duplicate interval Main")).toBeTruthy();
    await fireEvent.press(screen.getByTestId(`duplicate-interval-${interval.id}`));
    expect(onDuplicateInterval).toHaveBeenCalledWith(interval.id);
    expect(onTimelineIntervalPress).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId(`delete-interval-${interval.id}`));
    expect(onDeleteInterval).toHaveBeenCalledWith(interval.id);
    expect(onTimelineIntervalPress).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId(`interval-row-${interval.id}`));
    expect(onTimelineIntervalPress).toHaveBeenCalledWith(interval.id);

    onDuplicateInterval.mockReturnValueOnce({
      success: false,
      error: "An activity can contain at most 50 intervals.",
    });
    await fireEvent.press(screen.getByTestId(`duplicate-interval-${interval.id}`));
    expect(screen.getByText("An activity can contain at most 50 intervals.")).toBeTruthy();
  });

  it("previews placeholder order in the timeline and commits only a changed drop", async () => {
    const onReorderIntervals = jest.fn();
    const [firstInterval] = structure.segments[0].intervals;
    if (!firstInterval) throw new Error("Expected an interval in the test fixture.");
    const [firstStep] = firstInterval.steps;
    if (!firstStep) throw new Error("Expected an interval step in the test fixture.");
    const secondInterval = {
      ...firstInterval,
      id: "00000000-0000-4000-8000-000000000004",
      name: "Second",
      repetitions: 2,
      steps: [{ ...firstStep, id: "00000000-0000-4000-8000-000000000006" }],
    };
    const thirdInterval = {
      ...firstInterval,
      id: "00000000-0000-4000-8000-000000000005",
      name: "Third",
      repetitions: 3,
      steps: [{ ...firstStep, id: "00000000-0000-4000-8000-000000000007" }],
    };
    const intervals = [firstInterval, secondInterval, thirdInterval];
    const dragStructure = {
      ...structure,
      segments: [{ ...structure.segments[0], intervals }] satisfies [ActivityPlanSegment],
    };
    const { rerender } = await renderNative(
      <StructureBuilderCard
        intervals={intervals}
        onAddInterval={jest.fn()}
        onDeleteInterval={jest.fn()}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={jest.fn(() => ({ success: true as const }))}
        onReorderIntervals={onReorderIntervals}
        onTimelineIntervalPress={jest.fn()}
        segmentId={dragStructure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={dragStructure}
        structureStats={{
          distanceMeters: 0,
          durationMs: 300_000,
          hasOpenDuration: false,
          hasPartialDuration: false,
          stepCount: 3,
        }}
        validationErrors={{}}
      />,
    );

    const dragProps = mockDraggableListProps.mock.calls.at(-1)?.[0] as {
      data: typeof intervals;
      onDragBegin: (index: number) => void;
      onDragEnd: (params: { data: typeof intervals; from: number; to: number }) => void;
      onPlaceholderIndexChange: (index: number) => void;
    };
    const secondGrip = screen.getByTestId(`reorder-interval-${secondInterval.id}`);
    expect(secondGrip.props.accessibilityActions).toEqual([
      { name: "increment", label: "Move interval earlier" },
      { name: "decrement", label: "Move interval later" },
    ]);
    await act(async () =>
      secondGrip.props.onAccessibilityAction({ nativeEvent: { actionName: "increment" } }),
    );
    expect(onReorderIntervals).toHaveBeenCalledWith([secondInterval, firstInterval, thirdInterval]);
    expect(screen.queryByTestId(`move-interval-up-${secondInterval.id}`)).toBeNull();
    expect(screen.queryByTestId(`move-interval-down-${secondInterval.id}`)).toBeNull();
    onReorderIntervals.mockClear();

    await act(async () => dragProps.onDragBegin(0));
    await act(async () => dragProps.onPlaceholderIndexChange(2));

    const previewPresentation = timelineProps.mock.calls.at(-1)?.[0].presentation;
    expect(
      Array.from(
        new Set(
          previewPresentation.occurrences.map(
            (occurrence: { intervalId?: string }) => occurrence.intervalId,
          ),
        ),
      ),
    ).toEqual([secondInterval.id, thirdInterval.id, firstInterval.id]);
    expect(onReorderIntervals).not.toHaveBeenCalled();

    await act(async () =>
      dragProps.onDragEnd({
        data: [secondInterval, thirdInterval, firstInterval],
        from: 0,
        to: 2,
      }),
    );
    expect(onReorderIntervals).toHaveBeenCalledWith([secondInterval, thirdInterval, firstInterval]);
    expect(onReorderIntervals.mock.calls[0]?.[0][2]).toBe(firstInterval);

    await act(async () => dragProps.onDragBegin(1));
    await act(async () => dragProps.onDragEnd({ data: intervals, from: 1, to: 1 }));
    expect(onReorderIntervals).toHaveBeenCalledTimes(1);

    const externalIntervals = [thirdInterval, firstInterval, secondInterval];
    const externalStructure = {
      ...dragStructure,
      segments: [{ ...dragStructure.segments[0], intervals: externalIntervals }] satisfies [
        ActivityPlanSegment,
      ],
    };
    await act(async () => dragProps.onDragBegin(0));
    await act(async () => dragProps.onPlaceholderIndexChange(2));
    await rerender(
      <StructureBuilderCard
        intervals={externalIntervals}
        onAddInterval={jest.fn()}
        onDeleteInterval={jest.fn()}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={jest.fn(() => ({ success: true as const }))}
        onReorderIntervals={onReorderIntervals}
        onTimelineIntervalPress={jest.fn()}
        segmentId={externalStructure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={externalStructure}
        structureStats={{
          distanceMeters: 0,
          durationMs: 300_000,
          hasOpenDuration: false,
          hasPartialDuration: false,
          stepCount: 3,
        }}
        validationErrors={{}}
      />,
    );
    await act(async () =>
      dragProps.onDragEnd({
        data: [secondInterval, thirdInterval, firstInterval],
        from: 0,
        to: 2,
      }),
    );
    expect(onReorderIntervals).toHaveBeenCalledTimes(1);
    const currentPresentation = timelineProps.mock.calls.at(-1)?.[0].presentation;
    expect(
      Array.from(
        new Set(
          currentPresentation.occurrences.map(
            (occurrence: { intervalId?: string }) => occurrence.intervalId,
          ),
        ),
      ),
    ).toEqual([thirdInterval.id, firstInterval.id, secondInterval.id]);
  });

  it("renders one add action for either an empty or populated interval list", async () => {
    const { rerender } = await renderNative(
      <StructureBuilderCard
        intervals={[]}
        onAddInterval={jest.fn()}
        onDeleteInterval={jest.fn()}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={jest.fn(() => ({ success: true as const }))}
        onTimelineIntervalPress={jest.fn()}
        segmentId={structure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={{ ...structure, segments: [{ ...structure.segments[0], intervals: [] }] }}
        structureStats={{
          distanceMeters: 0,
          durationMs: 0,
          hasOpenDuration: false,
          hasPartialDuration: false,
          stepCount: 0,
        }}
        validationErrors={{}}
      />,
    );

    expect(screen.getAllByText("Add your first interval")).toHaveLength(1);
    expect(screen.queryByText("Add interval")).toBeNull();

    await rerender(
      <StructureBuilderCard
        intervals={structure.segments[0].intervals}
        onAddInterval={jest.fn()}
        onDeleteInterval={jest.fn()}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={jest.fn(() => ({ success: true as const }))}
        onTimelineIntervalPress={jest.fn()}
        segmentId={structure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={structure}
        structureStats={{
          distanceMeters: 0,
          durationMs: 300_000,
          hasOpenDuration: false,
          hasPartialDuration: false,
          stepCount: 1,
        }}
        validationErrors={{}}
      />,
    );

    expect(screen.getAllByText("Add interval")).toHaveLength(1);
    expect(screen.queryByText("Add your first interval")).toBeNull();
  });

  it("does not invent a zero-minute total for open or mixed-duration plans", async () => {
    const openStructure = {
      ...structure,
      segments: [
        {
          ...structure.segments[0],
          intervals: [
            {
              ...structure.segments[0].intervals[0],
              steps: [
                {
                  ...structure.segments[0].intervals[0].steps[0],
                  duration: { type: "untilFinished" as const },
                },
              ],
            },
          ],
        },
      ] satisfies [ActivityPlanSegment],
    };
    await renderNative(
      <StructureBuilderCard
        intervals={openStructure.segments[0].intervals}
        onAddInterval={jest.fn()}
        onDeleteInterval={jest.fn()}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={jest.fn(() => ({ success: true as const }))}
        onTimelineIntervalPress={jest.fn()}
        segmentId={openStructure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={openStructure}
        structureStats={{
          distanceMeters: 0,
          durationMs: null,
          hasOpenDuration: true,
          hasPartialDuration: false,
          stepCount: 1,
        }}
        validationErrors={{}}
      />,
    );

    expect(resourceMetricsProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metrics: [
          { label: "Expected duration", value: "Open-ended" },
          { label: "Steps", value: "1" },
        ],
      }),
    );

    await renderNative(
      <StructureBuilderCard
        intervals={openStructure.segments[0].intervals}
        onAddInterval={jest.fn()}
        onDeleteInterval={jest.fn()}
        onDismissChartCoachmark={jest.fn()}
        onDuplicateInterval={jest.fn(() => ({ success: true as const }))}
        onTimelineIntervalPress={jest.fn()}
        segmentId={openStructure.segments[0].id}
        selectedIntervalId={null}
        showChartCoachmark={false}
        structure={openStructure}
        structureStats={{
          distanceMeters: 0,
          durationMs: null,
          hasOpenDuration: true,
          hasPartialDuration: true,
          stepCount: 2,
        }}
        validationErrors={{}}
      />,
    );

    expect(resourceMetricsProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        metrics: [
          { label: "Expected duration", value: "Partial duration" },
          { label: "Steps", value: "2" },
        ],
      }),
    );
  });
});
