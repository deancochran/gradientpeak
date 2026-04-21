import React from "react";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn() }),
}));

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
    activityEfforts: {
      getForProfile: {
        useQuery: () => ({
          data: [
            {
              id: "effort-1",
              activity_category: "run",
              effort_type: "power",
              recorded_at: "2026-03-01T00:00:00.000Z",
              duration_seconds: 60,
              value: 400,
              unit: "W",
            },
          ],
          isLoading: false,
          error: null,
        }),
      },
    },
  },
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  ChevronRight: createHost("ChevronRight"),
  Timer: createHost("Timer"),
  Zap: createHost("Zap"),
}));

const ActivityEffortsList = require("../activity-efforts-list").default;

describe("activity efforts list", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("opens effort detail when tapping a list item", () => {
    renderNative(<ActivityEffortsList />);

    fireEvent.press(screen.getByTestId("activity-effort-list-item-effort-1"));

    expect(pushMock).toHaveBeenCalledWith("/activity-effort-detail?id=effort-1");
  });
});
