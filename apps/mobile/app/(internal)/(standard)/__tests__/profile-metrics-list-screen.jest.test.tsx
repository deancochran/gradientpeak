import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
let mockDateRange = "all";
let mockProfileMetricItems = [
  {
    id: "metric-1",
    metric_type: "weight_kg",
    value: 70.5,
    unit: "kg",
    recorded_at: "2000-03-02T00:00:00.000Z",
  },
  {
    id: "metric-2",
    metric_type: "lthr",
    value: 168,
    unit: "bpm",
    recorded_at: "2000-03-03T00:00:00.000Z",
  },
];

type FlatListMockProps = Record<string, unknown> & {
  data?: unknown[];
  renderItem: (info: { item: unknown }) => React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: FlatListMockProps) =>
    React.createElement(
      "FlatList",
      props,
      data?.length ? data.map((item) => renderItem({ item })) : ListEmptyComponent,
    ),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: createHost("StackScreen") },
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ testId, ...props }: { testId?: string; [key: string]: unknown }) =>
    React.createElement("Button", { ...props, testID: testId }),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  CompactInsightCard: createHost("CompactInsightCard"),
  DetailChartModal: ({
    children,
    visible,
  }: {
    children: React.ReactNode | ((range: string) => React.ReactNode);
    visible: boolean;
  }) => {
    if (!visible) return null;

    return React.createElement(
      "DetailChartModal",
      null,
      typeof children === "function" ? children(mockDateRange) : children,
    );
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    profileMetrics: {
      list: {
        useInfiniteQuery: () => ({
          data: {
            pages: [
              {
                items: mockProfileMetricItems,
              },
            ],
          },
          isLoading: false,
          error: null,
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
    },
  },
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  HeartPulse: createHost("HeartPulse"),
  Scale: createHost("Scale"),
  TrendingUp: createHost("TrendingUp"),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: createHost("Svg"),
  Circle: createHost("Circle"),
  Line: createHost("Line"),
  Path: createHost("Path"),
  Text: createHost("SvgText"),
}));

const ProfileMetricsListScreen = require("../profile-metrics-list").default;

describe("profile metrics list screen", () => {
  beforeAll(() => {
    Object.defineProperty(global, "requestAnimationFrame", {
      configurable: true,
      value: (callback: (time: number) => void) => {
        callback(0);
        return 0;
      },
    });
  });

  beforeEach(() => {
    pushMock.mockReset();
    mockDateRange = "all";
    mockProfileMetricItems = [
      {
        id: "metric-1",
        metric_type: "weight_kg",
        value: 70.5,
        unit: "kg",
        recorded_at: "2000-03-02T00:00:00.000Z",
      },
      {
        id: "metric-2",
        metric_type: "lthr",
        value: 168,
        unit: "bpm",
        recorded_at: "2000-03-03T00:00:00.000Z",
      },
    ];
  });

  it("opens metric detail from a selected metric type", () => {
    renderNative(<ProfileMetricsListScreen />);

    fireEvent.press(screen.getByTestId("profile-metric-type-weight_kg"));
    fireEvent.press(screen.getByTestId("profile-metric-record-metric-1"));

    expect(pushMock).toHaveBeenCalledWith("/profile-metric-detail?id=metric-1");
  });

  it("groups every metric under its semantic section", () => {
    renderNative(<ProfileMetricsListScreen />);

    expect(screen.getByTestId("profile-metric-section-load_calibration")).toBeTruthy();
    expect(screen.getByTestId("profile-metric-section-supporting_physiology")).toBeTruthy();
    expect(screen.getByTestId("profile-metric-section-recovery")).toBeTruthy();
    expect(screen.getByTestId("profile-metric-section-body_aerobic")).toBeTruthy();
    expect(screen.getByTestId("profile-metric-type-ftp")).toBeTruthy();
    expect(screen.getByTestId("profile-metric-type-threshold_pace_seconds_per_km")).toBeTruthy();
    expect(screen.getByTestId("profile-metric-type-css_seconds_per_100m")).toBeTruthy();
    expect(screen.getByTestId("profile-metric-type-lthr")).toBeTruthy();
  });

  it("keeps calculated CSS history read-only", () => {
    renderNative(<ProfileMetricsListScreen />);

    fireEvent.press(screen.getByTestId("profile-metric-type-css_seconds_per_100m"));
    expect(screen.queryByTestId("profile-metric-css-test")).toBeNull();
    expect(pushMock).not.toHaveBeenCalledWith("/profile-css-test");
  });

  it("shows the latest value from the selected date range", () => {
    mockDateRange = "7d";

    renderNative(<ProfileMetricsListScreen />);
    fireEvent.press(screen.getByTestId("profile-metric-type-weight_kg"));

    expect(screen.getByText("--")).toBeTruthy();
    expect(screen.getByText("No records in this range.")).toBeTruthy();
  });
});
