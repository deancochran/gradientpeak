import React from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { TrainingPathChart } from "./TrainingPathChart";
import type { TrainingPathViewModel } from "./trainingPathTypes";

const interactionOrder: string[] = [];
const originalRequestAnimationFrame = global.requestAnimationFrame;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: (props: any) => React.createElement("TouchableOpacity", props, props.children),
  View: (props: any) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: any) => React.createElement("Text", props, props.children),
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  Circle: (props: any) => React.createElement("SkiaCircle", props),
  DashPathEffect: (props: any) => React.createElement("DashPathEffect", props),
  interpolateColors: (_value: number, _input: number[], output: string[]) => output[0],
  Line: (props: any) => React.createElement("SkiaLine", props, props.children),
  Rect: (props: any) => React.createElement("SkiaRect", props),
  Text: (props: any) => React.createElement("SkiaText", props),
  useFont: () => ({ getTextWidth: () => 24 }),
  vec: (x: number, y: number) => ({ x, y }),
}));

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const ScrollView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      scrollTo: () => interactionOrder.push("scrollTo"),
    }));
    return React.createElement("AnimatedScrollView", props, props.children);
  });
  return {
    __esModule: true,
    default: { ScrollView },
    runOnJS: (fn: any) => fn,
    scrollTo: () => interactionOrder.push("scrollTo"),
    useAnimatedRef: () => React.useRef(null),
    useAnimatedReaction: jest.fn(),
    useAnimatedScrollHandler: (handler: any) => handler,
    useDerivedValue: (factory: any) => ({ value: factory() }),
    useSharedValue: (value: any) => ({ value }),
  };
});

jest.mock("victory-native", () => ({
  __esModule: true,
  CartesianChart: ({ chartPressConfig, chartPressState, children, data, yAxis, yKeys }: any) => {
    const points = Object.fromEntries(
      yKeys.map((key: string) => [
        key,
        data.map((datum: any, index: number) => ({
          x: index * 38,
          xValue: index,
          y: 120 - (datum[key] ?? 0),
          yValue: datum[key],
        })),
      ]),
    );
    return React.createElement(
      "CartesianChart",
      { chartPressConfig, chartPressState, data, yAxis },
      children({ points, chartBounds: { left: 0, right: 200, top: 0, bottom: 120 } }),
    );
  },
  Line: (props: any) => React.createElement("Line", props, props.children),
  useChartPressState: jest.fn(() => ({
    isActive: false,
    state: {
      isActive: { value: false },
      matchedIndex: { value: -1 },
      x: { position: { value: 0 }, value: { value: 0 } },
      y: { targetLoad: { position: { value: 0 }, value: { value: 0 } } },
      yIndex: { value: 0 },
    },
  })),
}));

jest.mock("@/assets/fonts/SpaceMono-Regular.ttf", () => ({
  __esModule: true,
  default: "mock-font",
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

const model: TrainingPathViewModel = {
  domains: { fitness: [0, 80], load: [0, 200] },
  emptyState: null,
  goalMarkers: [],
  selectedWeekSummary: null,
  todayKey: "2026-04-06",
  weeks: [
    {
      weekStart: "2026-04-06",
      weekEnd: "2026-04-12",
      label: "Apr 6",
      completedLoad: 20,
      plannedLoad: 40,
      tentativePlannedLoad: 0,
      targetLoad: 80,
      fitness: 40,
      scheduledFitness: 42,
      targetFitness: 45,
      fatigue: 50,
      form: -8,
      riskZone: "moderate",
      isCurrent: true,
      isSelected: true,
    },
    {
      weekStart: "2026-04-13",
      weekEnd: "2026-04-19",
      label: "Apr 13",
      completedLoad: 0,
      plannedLoad: 60,
      tentativePlannedLoad: 20,
      targetLoad: 90,
      fitness: null,
      scheduledFitness: 44,
      targetFitness: 46,
      fatigue: null,
      form: null,
      riskZone: null,
      isCurrent: false,
      isSelected: false,
    },
  ],
};

describe("TrainingPathChart interactions", () => {
  beforeEach(() => {
    interactionOrder.length = 0;
    global.requestAnimationFrame = jest.fn((callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it("uses Victory chart press state instead of touch overlays for bar selection", () => {
    renderNative(
      <TrainingPathChart
        model={model}
        range="season"
        scrollX
        onDisplayedWeekChange={() => interactionOrder.push("displayed")}
        onScrollInteractionStart={() => interactionOrder.push("scrollStart")}
        onSelectedWeekChange={() => interactionOrder.push("selected")}
      />,
    );

    const chart = (screen as any).UNSAFE_getByType("CartesianChart");
    expect(chart.props.chartPressState).toBeTruthy();
    expect(chart.props.chartPressConfig?.pan?.simultaneousWithExternalGesture).toBeTruthy();
    expect(screen.queryByTestId("training-path-week-2026-04-13")).toBeNull();
  });

  it("does not publish React week changes from continuous scroll ticks", () => {
    const onDisplayedWeekChange = jest.fn();
    const onSelectedWeekChange = jest.fn();

    renderNative(
      <TrainingPathChart
        model={model}
        range="season"
        scrollX
        onDisplayedWeekChange={onDisplayedWeekChange}
        onSelectedWeekChange={onSelectedWeekChange}
      />,
    );

    fireEvent((screen as any).UNSAFE_getByType("AnimatedScrollView"), "scroll", {
      contentOffset: { x: 38 },
      contentSize: { width: 300 },
      layoutMeasurement: { width: 100 },
    });

    expect(onDisplayedWeekChange).not.toHaveBeenCalled();
    expect(onSelectedWeekChange).not.toHaveBeenCalled();
  });

  it("can render as a scroll-only preview without week review snapping", () => {
    renderNative(
      <TrainingPathChart
        model={model}
        range="season"
        reviewWeeks={false}
        scrollX
        showCompletedLoad={false}
        showPlannedLoad={false}
        showScheduledFitness={false}
      />,
    );

    const scrollView = (screen as any).UNSAFE_getByType("AnimatedScrollView");
    const renderedLines = (screen as any).UNSAFE_getAllByType("Line");
    const renderedRects = (screen as any).UNSAFE_getAllByType("SkiaRect");

    expect(screen.queryByTestId("training-path-week-2026-04-13")).toBeNull();
    expect(scrollView.props.disableIntervalMomentum).toBe(false);
    expect(scrollView.props.snapToInterval).toBeUndefined();
    expect(renderedLines).toHaveLength(2);
    expect(renderedRects).toHaveLength(2);
  });

  it("renders tentative load as borderless dotted fill", () => {
    renderNative(
      <TrainingPathChart model={model} range="season" onSelectedWeekChange={jest.fn()} />,
    );

    const dots = (screen as any)
      .UNSAFE_getAllByType("SkiaCircle")
      .filter((circle: any) => circle.props.cx !== undefined && circle.props.cy !== undefined);
    const strokedBars = (screen as any)
      .UNSAFE_getAllByType("SkiaRect")
      .filter((rect: any) => rect.props.style === "stroke");

    expect(dots.length).toBeGreaterThan(1);
    expect(strokedBars).toHaveLength(0);
  });

  it("renders planned and recommended bars independently when completed load is absent", () => {
    const sparseModel: TrainingPathViewModel = {
      ...model,
      weeks: [
        {
          ...model.weeks[0],
          completedLoad: null,
          plannedLoad: 40,
          targetLoad: 80,
          isSelected: true,
        },
      ],
    };

    renderNative(
      <TrainingPathChart
        model={sparseModel}
        range="season"
        showCompletedLoad={false}
        showPlannedLoad
      />,
    );

    const renderedRects = (screen as any).UNSAFE_getAllByType("SkiaRect");
    expect(renderedRects.length).toBeGreaterThanOrEqual(2);
  });

  it("renders sparse two-week planned bars without completed load anchors", () => {
    const sparseModel: TrainingPathViewModel = {
      ...model,
      weeks: model.weeks.map((week) => ({
        ...week,
        completedLoad: null,
        plannedLoad: week.plannedLoad ?? 0,
        targetLoad: week.targetLoad ?? 0,
      })),
    };

    renderNative(
      <TrainingPathChart
        model={sparseModel}
        range="season"
        scrollX
        showCompletedLoad={false}
        showPlannedLoad
      />,
    );

    const renderedRects = (screen as any).UNSAFE_getAllByType("SkiaRect");
    expect(renderedRects.length).toBeGreaterThanOrEqual(4);
    const loadBarWidths = renderedRects
      .map((rect: any) => rect.props.width)
      .filter((width: unknown): width is number => typeof width === "number" && width > 0);
    expect(loadBarWidths).toEqual(expect.arrayContaining([28, 28, 28, 28]));
  });

  it("expands the load domain to fit recommended load bars", () => {
    const highTargetModel: TrainingPathViewModel = {
      ...model,
      domains: { ...model.domains, load: [0, 100] },
      weeks: [
        {
          ...model.weeks[0],
          completedLoad: 20,
          plannedLoad: 40,
          targetLoad: 240,
        },
      ],
    };

    renderNative(<TrainingPathChart model={highTargetModel} range="season" />);

    const chart = (screen as any).UNSAFE_getByType("CartesianChart");
    expect(chart.props.yAxis[0].domain[1]).toBeGreaterThan(240);
  });
});
