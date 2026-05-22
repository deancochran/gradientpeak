import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  FlatList: ({ data, renderItem, ListEmptyComponent, ...props }: any) =>
    React.createElement(
      "FlatList",
      props,
      data?.length ? data.map((item: any) => renderItem({ item })) : ListEmptyComponent,
    ),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  CompactInsightCard: createHost("CompactInsightCard"),
  DetailChartModal: ({ children, visible }: any) => {
    if (!visible) return null;

    return React.createElement(
      "DetailChartModal",
      null,
      typeof children === "function" ? children("all") : children,
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
                items: [
                  {
                    id: "metric-1",
                    metric_type: "weight_kg",
                    value: 70.5,
                    unit: "kg",
                    recorded_at: "2026-03-02T00:00:00.000Z",
                  },
                ],
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
  });

  it("opens metric detail from a selected metric type", () => {
    renderNative(<ProfileMetricsListScreen />);

    fireEvent.press(screen.getByTestId("profile-metric-type-weight_kg"));
    fireEvent.press(screen.getByTestId("profile-metric-record-metric-1"));

    expect(pushMock).toHaveBeenCalledWith("/profile-metric-detail?id=metric-1");
  });
});
