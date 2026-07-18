import React from "react";
import type { ReactTestInstance } from "react-test-renderer";
import type { HostProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { TrainingPathChart } from "./TrainingPathChart";
import { TrainingPathLegend } from "./TrainingPathLegend";
import type { TrainingPathViewModel } from "./trainingPathTypes";

const interactionOrder: string[] = [];
const originalRequestAnimationFrame = global.requestAnimationFrame;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: (props: HostProps) =>
    React.createElement("TouchableOpacity", props, props.children),
  View: (props: HostProps) => React.createElement("View", props, props.children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: (props: HostProps) => React.createElement("Text", props, props.children),
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  Circle: (props: HostProps) => React.createElement("SkiaCircle", props),
  DashPathEffect: (props: HostProps) => React.createElement("DashPathEffect", props),
  interpolateColors: (_value: number, _input: number[], output: string[]) => output[0],
  Line: (props: HostProps) => React.createElement("SkiaLine", props, props.children),
  Rect: (props: HostProps) => React.createElement("SkiaRect", props),
  Text: (props: HostProps) => React.createElement("SkiaText", props),
  useFont: () => ({ getTextWidth: () => 24 }),
  vec: (x: number, y: number) => ({ x, y }),
}));

jest.mock("react-native-reanimated", () => {
  const React = require("react");
  const ScrollView = React.forwardRef((props: HostProps, ref: React.ForwardedRef<unknown>) => {
    React.useImperativeHandle(ref, () => ({
      scrollTo: () => interactionOrder.push("scrollTo"),
    }));
    return React.createElement("AnimatedScrollView", props, props.children);
  });
  return {
    __esModule: true,
    default: { ScrollView },
    runOnJS: <T extends (...args: never[]) => unknown>(fn: T) => fn,
    scrollTo: () => interactionOrder.push("scrollTo"),
    useAnimatedRef: () => React.useRef(null),
    useAnimatedReaction: jest.fn(),
    useAnimatedScrollHandler: <T,>(handler: T) => handler,
    useDerivedValue: <T,>(factory: () => T) => ({ value: factory() }),
    useSharedValue: <T,>(value: T) => ({ value }),
  };
});

jest.mock("victory-native", () => ({
  __esModule: true,
  CartesianChart: ({
    chartPressConfig,
    chartPressState,
    children,
    data,
    yAxis,
    yKeys,
  }: {
    chartPressConfig?: unknown;
    chartPressState?: unknown;
    children: (context: {
      points: Record<string, unknown[]>;
      chartBounds: HostProps;
    }) => React.ReactNode;
    data: Record<string, number>[];
    yAxis?: unknown;
    yKeys: string[];
  }) => {
    const points = Object.fromEntries(
      yKeys.map((key: string) => [
        key,
        data.map((datum: Record<string, number>, index: number) => ({
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
  Line: (props: HostProps) => React.createElement("Line", props, props.children),
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

function getHostNodes(type: string) {
  return screen.UNSAFE_root.findAll((node: ReactTestInstance) => String(node.type) === type);
}

function getHostNode(type: string) {
  const node = getHostNodes(type)[0];
  if (!node) throw new Error(`Expected ${type} host node`);
  return node;
}

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

    const chart = getHostNode("CartesianChart");
    expect(chart.props.chartPressState).toBeTruthy();
    expect(chart.props.chartPressConfig?.pan?.simultaneousWithExternalGesture).toBeTruthy();
    expect(screen.queryByTestId("training-path-week-2026-04-13")).toBeNull();
  });

  it("exposes selected weekly load and fitness through an adjustable control", () => {
    const onSelectedWeekChange = jest.fn();
    renderNative(
      <TrainingPathChart
        model={model}
        range="season"
        reviewWeeks
        scrollX
        onSelectedWeekChange={onSelectedWeekChange}
      />,
    );

    const adjustable = screen.getByLabelText("Weekly training path chart");
    expect(adjustable.props.accessibilityRole).toBe("adjustable");
    expect(adjustable.props.accessibilityValue.text).toContain("Completed load 20 TSS");
    expect(adjustable.props.accessibilityValue.text).toContain("Projected fitness 42");

    fireEvent(adjustable, "accessibilityAction", {
      nativeEvent: { actionName: "increment" },
    });
    expect(onSelectedWeekChange).toHaveBeenCalledWith("2026-04-13");
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

    fireEvent(getHostNode("AnimatedScrollView"), "scroll", {
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

    const scrollView = getHostNode("AnimatedScrollView");
    const renderedLines = getHostNodes("Line");
    const renderedRects = getHostNodes("SkiaRect");

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

    const dots = getHostNodes("SkiaCircle").filter(
      (circle: ReactTestInstance) => circle.props.cx !== undefined && circle.props.cy !== undefined,
    );
    const strokedBars = getHostNodes("SkiaRect").filter(
      (rect: ReactTestInstance) => rect.props.style === "stroke",
    );

    expect(dots.length).toBeGreaterThan(1);
    expect(strokedBars).toHaveLength(0);
  });

  it("renders actual and projected fitness solid while keeping target fitness dotted in the fallback chart and legend", () => {
    renderNative(
      <>
        <TrainingPathChart model={model} range="season" />
        <TrainingPathLegend range="season" />
      </>,
    );

    const lines = getHostNodes("Line");
    const plannedCtlLine = lines.find(
      (line: ReactTestInstance) => line.props.color === "rgba(37, 99, 235, 0.95)",
    );
    const idealCtlLine = lines.find(
      (line: ReactTestInstance) => line.props.color === "rgba(15, 23, 42, 0.42)",
    );
    const legendDottedSwatch = getHostNodes("View").find(
      (view: ReactTestInstance) => view.props.style?.borderStyle === "dotted",
    );
    if (!plannedCtlLine || !idealCtlLine) throw new Error("Expected planned and ideal CTL lines");

    expect(plannedCtlLine.props.children).toBeUndefined();
    expect(idealCtlLine.props.children.type).toEqual(expect.any(Function));
    expect(idealCtlLine.props.children.props.intervals).toEqual([4, 4]);
    expect(screen.getByText("Actual fitness")).toBeTruthy();
    expect(screen.getByText("Projected fitness")).toBeTruthy();
    expect(screen.getByText("Target fitness")).toBeTruthy();
    expect(screen.getByText("Target")).toBeTruthy();
    expect(screen.getByText("Completed, load unavailable")).toBeTruthy();
    expect(screen.getByText("✓")).toBeTruthy();
    expect(legendDottedSwatch?.props.style).toEqual(
      expect.objectContaining({ borderStyle: "dotted" }),
    );
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

    const renderedRects = getHostNodes("SkiaRect");
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

    const renderedRects = getHostNodes("SkiaRect");
    expect(renderedRects.length).toBeGreaterThanOrEqual(4);
    const loadBarWidths = renderedRects
      .map((rect: ReactTestInstance) => rect.props.width)
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

    const chart = getHostNode("CartesianChart");
    expect(chart.props.yAxis[0].domain[1]).toBeGreaterThan(240);
  });
});
