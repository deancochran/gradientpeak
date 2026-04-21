import React from "react";
import { renderNative, screen } from "../../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  Stack: {
    Screen: (props: any) =>
      React.createElement(
        "StackScreen",
        props,
        typeof props.options?.headerRight === "function" ? props.options.headerRight() : null,
      ),
  },
  useLocalSearchParams: () => ({ id: "effort-1" }),
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
  CardTitle: createHost("CardTitle"),
}));
jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("@/components/activity/maps/ActivityRouteMap", () => ({
  __esModule: true,
  ActivityRouteMap: createHost("ActivityRouteMap"),
}));
jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ activityEfforts: { getForProfile: { invalidate: jest.fn() } } }),
    activityEfforts: {
      getById: {
        useQuery: () => ({
          data: {
            id: "effort-1",
            activity_id: "activity-1",
            activity_category: "run",
            effort_type: "power",
            recorded_at: "2026-03-01T00:00:00.000Z",
            duration_seconds: 60,
            start_offset: 120,
            value: 400,
            unit: "W",
          },
          isLoading: false,
        }),
      },
      delete: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
    activities: {
      getById: {
        useQuery: () => ({
          data: {
            activity: {
              id: "activity-1",
              name: "Hill Repeats",
              started_at: "2026-03-01T08:00:00.000Z",
              distance_meters: 9000,
              duration_seconds: 3200,
              polyline: "encoded",
            },
            derived: { stress: { tss: 75 } },
          },
        }),
      },
    },
  },
}));

jest.mock("@tanstack/react-query", () => ({
  __esModule: true,
  skipToken: Symbol("skipToken"),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  decodePolyline: () => [
    { latitude: 40.0, longitude: -75.0 },
    { latitude: 40.1, longitude: -75.1 },
  ],
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Clock3: createHost("Clock3"),
  Ellipsis: createHost("Ellipsis"),
  Timer: createHost("Timer"),
  Trash2: createHost("Trash2"),
  Zap: createHost("Zap"),
}));

const ActivityEffortDetailScreen = require("../activity-effort-detail").default;

describe("activity effort detail screen", () => {
  it("shows linked activity and segment context", () => {
    const rendered = renderNative(<ActivityEffortDetailScreen />);

    expect(screen.getByText("run power")).toBeTruthy();
    expect(screen.getByText("Value: 400 W")).toBeTruthy();
    expect(screen.getByText("Performed on activity")).toBeTruthy();
    expect(screen.getByText("Hill Repeats")).toBeTruthy();
    expect(screen.getByText("Segment duration")).toBeTruthy();
    expect((rendered as any).UNSAFE_getByType("ActivityRouteMap")).toBeTruthy();
  });
});
