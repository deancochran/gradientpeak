import React from "react";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

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

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => pushMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    profileMetrics: {
      list: {
        useQuery: () => ({
          data: {
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
          isLoading: false,
          error: null,
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

const ProfileMetricsListScreen = require("../profile-metrics-list").default;

describe("profile metrics list screen", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("opens metric detail when tapping a metric row", () => {
    renderNative(<ProfileMetricsListScreen />);

    fireEvent.press(screen.getByTestId("profile-metric-list-item-metric-1"));

    expect(pushMock).toHaveBeenCalledWith("/profile-metric-detail?id=metric-1");
  });
});
