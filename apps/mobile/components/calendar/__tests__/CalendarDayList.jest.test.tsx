import { act } from "@testing-library/react-native/pure";
import type React from "react";

import { renderNative } from "../../../test/render-native";

const mockScrollToIndex = jest.fn();
const mockScrollToOffset = jest.fn();
type MockFlatListProps = {
  CellRendererComponent: (props: { children: React.ReactNode; index: number }) => {
    props: { onLayout: (event: { nativeEvent: { layout: Record<string, number> } }) => void };
  };
  data: { dateKey: string; type: string }[];
  onMomentumScrollEnd: (event: { nativeEvent: { contentOffset: { y: number } } }) => void;
  onScrollToIndexFailed: (info: {
    averageItemLength: number;
    highestMeasuredFrameIndex: number;
    index: number;
  }) => void;
  onScroll: {
    onScroll: (event: { contentOffset: { y: number } }, context: Record<string, number>) => void;
  };
};
let mockFlatListProps: MockFlatListProps | undefined;

jest.mock("react-native", () => {
  const reactNative = jest.requireActual("@repo/ui/test/react-native");

  return {
    __esModule: true,
    ...reactNative,
    FlatList: "FlatList",
  };
});

jest.mock("react-native-reanimated", () => {
  const React = jest.requireActual<typeof import("react")>("react");

  return {
    __esModule: true,
    default: {
      createAnimatedComponent: () =>
        React.forwardRef((props: MockFlatListProps, ref: React.ForwardedRef<unknown>) => {
          mockFlatListProps = props;
          React.useImperativeHandle(ref, () => ({
            scrollToIndex: mockScrollToIndex,
            scrollToOffset: mockScrollToOffset,
          }));
          return React.createElement("FlatList", props);
        }),
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedScrollHandler: (handler: unknown) => handler,
  };
});

jest.mock("../CalendarTimelineRows", () => ({
  CalendarDayHeaderRow: () => null,
  CalendarScheduleObjectRow: () => null,
}));

import { CalendarDayList, type CalendarDayListProps } from "../CalendarDayList";

const initialDayKey = "2026-03-23";
const middleDayKey = "2026-03-24";
const targetDayKey = "2026-03-25";
const dayKeys = [initialDayKey, middleDayKey, targetDayKey] as const;

function createProps(overrides: Partial<CalendarDayListProps> = {}): CalendarDayListProps {
  return {
    rangeStart: initialDayKey,
    rangeEnd: targetDayKey,
    visibleDayKey: initialDayKey,
    selectedDateKey: initialDayKey,
    todayKey: initialDayKey,
    scrollTargetDateKey: null,
    scrollTargetVersion: 0,
    activitiesByDate: new Map(),
    eventsByDate: new Map(),
    groupEventsByDate: new Map(),
    goalsByDate: new Map(),
    onReachStart: jest.fn(),
    onReachEnd: jest.fn(),
    onVisibleDayChange: jest.fn(),
    onVisibleDaySettled: jest.fn(),
    onPressDay: jest.fn(),
    onPressActivity: jest.fn(),
    onPressEvent: jest.fn(),
    onPressGroupEvent: jest.fn(),
    onPressGoal: jest.fn(),
    ...overrides,
  };
}

function getMockFlatListProps() {
  if (!mockFlatListProps) {
    throw new Error("Expected CalendarDayList to render its FlatList");
  }
  return mockFlatListProps;
}

function layoutDayHeaders() {
  const list = getMockFlatListProps();
  const CellRendererComponent = list.CellRendererComponent;

  act(() => {
    for (const [dateKey, y] of dayKeys.map((key, index) => [key, index * 150] as const)) {
      const index = list.data.findIndex((row) => row.type === "day" && row.dateKey === dateKey);
      const cell = CellRendererComponent({ children: null, index });
      cell.props.onLayout({ nativeEvent: { layout: { height: 40, width: 390, x: 0, y } } });
    }
  });

  return list;
}

describe("CalendarDayList scrolling", () => {
  beforeEach(() => {
    mockScrollToIndex.mockClear();
    mockScrollToOffset.mockClear();
    mockFlatListProps = undefined;
  });

  it("settles the currently visible manual-scroll day without corrective movement", () => {
    const onVisibleDayChange = jest.fn();
    const onVisibleDaySettled = jest.fn();
    renderNative(<CalendarDayList {...createProps({ onVisibleDayChange, onVisibleDaySettled })} />);
    const list = layoutDayHeaders();

    act(() => {
      list.onScroll.onScroll({ contentOffset: { y: 230 } }, {});
      list.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 230 } } });
    });

    expect(onVisibleDayChange).toHaveBeenCalledWith(middleDayKey);
    expect(onVisibleDaySettled).toHaveBeenCalledWith(middleDayKey);
    expect(mockScrollToOffset).not.toHaveBeenCalled();
  });

  it("uses scrollToIndex for explicit navigation and settles only after reaching its target", () => {
    const onVisibleDaySettled = jest.fn();
    const props = createProps({ onVisibleDaySettled });
    const rendered = renderNative(<CalendarDayList {...props} />);
    let list = layoutDayHeaders();

    rendered.rerender(
      <CalendarDayList {...props} scrollTargetDateKey={targetDayKey} scrollTargetVersion={1} />,
    );
    list = getMockFlatListProps();

    expect(mockScrollToIndex).toHaveBeenCalledWith({
      index: 2,
      animated: true,
      viewPosition: 0,
    });

    act(() => {
      list.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 150 } } });
    });
    expect(onVisibleDaySettled).not.toHaveBeenCalled();

    act(() => {
      list.onScroll.onScroll({ contentOffset: { y: 300 } }, {});
      list.onMomentumScrollEnd({ nativeEvent: { contentOffset: { y: 300 } } });
    });

    expect(onVisibleDaySettled).toHaveBeenCalledWith(targetDayKey);
    expect(mockScrollToOffset).not.toHaveBeenCalled();
  });

  it("does not repeat explicit navigation when schedule rows hydrate", () => {
    const props = createProps({ scrollTargetDateKey: targetDayKey, scrollTargetVersion: 1 });
    const rendered = renderNative(<CalendarDayList {...props} />);
    expect(mockScrollToIndex).toHaveBeenCalledTimes(1);

    mockScrollToIndex.mockClear();
    rendered.rerender(
      <CalendarDayList
        {...props}
        goalsByDate={new Map([[middleDayKey, [{ id: "goal-1" } as never]]])}
      />,
    );

    expect(mockScrollToIndex).not.toHaveBeenCalled();
  });

  it("never requests an index outside the FlatList data after rows change", () => {
    const props = createProps({ scrollTargetDateKey: targetDayKey, scrollTargetVersion: 1 });
    const rendered = renderNative(<CalendarDayList {...props} />);

    rendered.rerender(
      <CalendarDayList
        {...props}
        goalsByDate={new Map([[middleDayKey, [{ id: "goal-1" } as never]]])}
        scrollTargetVersion={2}
      />,
    );

    const list = getMockFlatListProps();
    const request = mockScrollToIndex.mock.calls.at(-1)?.[0] as { index: number } | undefined;
    expect(request).toBeDefined();
    expect(request?.index).toBeLessThan(list.data.length);
  });

  it("re-resolves a failed scroll target after rows change before retry", () => {
    const queuedFrames: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });

    try {
      const props = createProps({
        scrollTargetDateKey: targetDayKey,
        scrollTargetVersion: 1,
        goalsByDate: new Map([[middleDayKey, [{ id: "goal-1" } as never]]]),
      });
      const rendered = renderNative(<CalendarDayList {...props} />);
      const listWithGoal = getMockFlatListProps();
      expect(mockScrollToIndex).toHaveBeenLastCalledWith({
        index: 3,
        animated: true,
        viewPosition: 0,
      });

      act(() => {
        listWithGoal.onScrollToIndexFailed({
          averageItemLength: 100,
          highestMeasuredFrameIndex: 1,
          index: 3,
        });
      });
      rendered.rerender(<CalendarDayList {...props} goalsByDate={new Map()} />);
      mockScrollToIndex.mockClear();

      act(() => queuedFrames.shift()?.(0));
      expect(mockScrollToOffset).toHaveBeenCalledWith({ animated: false, offset: 100 });
      act(() => queuedFrames.shift()?.(0));
      expect(mockScrollToIndex).toHaveBeenCalledWith({
        index: 2,
        animated: true,
        viewPosition: 0,
      });
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("does not let an older failed-scroll retry override newer navigation", () => {
    const queuedFrames: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });

    try {
      const props = createProps({ scrollTargetDateKey: middleDayKey, scrollTargetVersion: 1 });
      const rendered = renderNative(<CalendarDayList {...props} />);
      const list = getMockFlatListProps();

      act(() => {
        list.onScrollToIndexFailed({
          averageItemLength: 100,
          highestMeasuredFrameIndex: 1,
          index: 1,
        });
      });
      rendered.rerender(
        <CalendarDayList {...props} scrollTargetDateKey={targetDayKey} scrollTargetVersion={2} />,
      );
      mockScrollToIndex.mockClear();

      act(() => queuedFrames.shift()?.(0));
      expect(mockScrollToOffset).not.toHaveBeenCalled();
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });

  it("cancels an initial-scroll retry when explicit navigation supersedes it", () => {
    const queuedFrames: FrameRequestCallback[] = [];
    const originalRequestAnimationFrame = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });

    try {
      const props = createProps();
      const rendered = renderNative(<CalendarDayList {...props} />);
      const list = getMockFlatListProps();

      act(() => {
        list.onScrollToIndexFailed({
          averageItemLength: 100,
          highestMeasuredFrameIndex: 0,
          index: 0,
        });
      });
      rendered.rerender(
        <CalendarDayList {...props} scrollTargetDateKey={targetDayKey} scrollTargetVersion={1} />,
      );
      mockScrollToIndex.mockClear();

      act(() => queuedFrames.shift()?.(0));
      expect(mockScrollToOffset).not.toHaveBeenCalled();
      expect(mockScrollToIndex).not.toHaveBeenCalled();
    } finally {
      globalThis.requestAnimationFrame = originalRequestAnimationFrame;
    }
  });
});
