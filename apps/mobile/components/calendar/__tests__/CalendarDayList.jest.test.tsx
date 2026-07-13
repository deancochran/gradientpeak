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
});
