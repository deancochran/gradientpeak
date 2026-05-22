import React from "react";
import { createHost as mockCreateHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: { Screen: mockCreateHost("StackScreen") },
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

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: mockCreateHost("Svg"),
  Circle: mockCreateHost("Circle"),
  Line: mockCreateHost("Line"),
  Path: mockCreateHost("Path"),
  Text: mockCreateHost("Text"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@/components/shared", () => ({
  __esModule: true,
  CompactInsightCard: ({ children, onPress, testID, title, value }: any) =>
    React.createElement(
      "Pressable",
      { onPress, testID },
      React.createElement("Text", null, title),
      React.createElement("Text", null, value),
      children,
    ),
  DetailChartModal: ({ children, title, visible }: any) =>
    visible
      ? React.createElement("View", null, React.createElement("Text", null, title), children("all"))
      : null,
}));

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
              duration_seconds: 15,
              value: 800,
              unit: "W",
            },
            {
              id: "effort-2",
              activity_category: "run",
              effort_type: "power",
              recorded_at: "2026-03-02T00:00:00.000Z",
              duration_seconds: 60,
              value: 500,
              unit: "W",
            },
            {
              id: "effort-3",
              activity_category: "run",
              effort_type: "power",
              recorded_at: "2026-03-03T00:00:00.000Z",
              duration_seconds: 300,
              value: 350,
              unit: "W",
            },
            {
              id: "effort-4",
              activity_category: "run",
              effort_type: "power",
              recorded_at: "2026-03-04T00:00:00.000Z",
              duration_seconds: 1200,
              value: 280,
              unit: "W",
            },
            {
              id: "effort-5",
              activity_category: "run",
              effort_type: "power",
              recorded_at: "2026-03-05T00:00:00.000Z",
              duration_seconds: 3600,
              value: 220,
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
  Activity: mockCreateHost("Activity"),
  ChevronRight: mockCreateHost("ChevronRight"),
  Timer: mockCreateHost("Timer"),
  Zap: mockCreateHost("Zap"),
}));

const ActivityEffortsList = require("../activity-efforts-list").default;

describe("activity efforts list", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("opens a power curve sheet when tapping the curve card", () => {
    renderNative(<ActivityEffortsList />);

    fireEvent.press(screen.getByTestId("activity-effort-curve-power"));

    expect(screen.getAllByText("Power curve").length).toBeGreaterThan(0);
  });

  it("shows nonlinear effort duration ticks across sprint, tempo, and endurance", () => {
    renderNative(<ActivityEffortsList />);

    fireEvent.press(screen.getByTestId("activity-effort-curve-power"));

    expect(screen.getByText("15s")).toBeTruthy();
    expect(screen.getByText("5m")).toBeTruthy();
    expect(screen.getByText("20m")).toBeTruthy();
    expect(screen.getByText("1h")).toBeTruthy();
  });
});
