import React from "react";
import { createButtonComponent } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const routeData = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "River Loop",
  total_distance: 10200,
  total_ascent: 180,
  total_descent: 175,
  created_at: "2026-03-01T00:00:00.000Z",
  description: "Flat start, climb home.",
  polyline: "encoded",
  has_liked: false,
};

const backMock = jest.fn();
const deleteMutateMock = jest.fn();
const toggleLikeMutateMock = jest.fn();
const authState = { user: { id: "profile-1" } };

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
  useLocalSearchParams: () => ({ id: routeData.id }),
  useRouter: () => ({ back: backMock }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
}));

jest.mock("react-native-maps", () => ({
  __esModule: true,
  default: createHost("MapView"),
  Marker: createHost("Marker"),
  Polyline: createHost("Polyline"),
  PROVIDER_DEFAULT: "default",
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));

jest.mock("@repo/ui/components/dropdown-menu", () => ({
  __esModule: true,
  DropdownMenu: createHost("DropdownMenu"),
  DropdownMenuContent: createHost("DropdownMenuContent"),
  DropdownMenuItem: createHost("DropdownMenuItem"),
  DropdownMenuTrigger: createHost("DropdownMenuTrigger"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("@/lib/hooks/useReliableMutation", () => ({
  __esModule: true,
  useReliableMutation: () => ({
    mutate: deleteMutateMock,
    isPending: false,
  }),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({ routes: {} }),
    routes: {
      get: {
        useQuery: () => ({ data: { ...routeData, profile_id: "profile-1" }, isLoading: false }),
      },
      loadFull: {
        useQuery: () => ({
          data: {
            coordinates: [
              { latitude: 40.0, longitude: -75.0, altitude: 120 },
              { latitude: 40.1, longitude: -75.1, altitude: 180 },
            ],
          },
        }),
      },
      delete: {},
    },
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: toggleLikeMutateMock }),
      },
      getComments: {
        useInfiniteQuery: () => ({
          data: { pages: [{ comments: [], total: 0, hasMore: false, nextCursor: undefined }] },
          refetch: jest.fn(),
          hasNextPage: false,
          isFetchingNextPage: false,
          fetchNextPage: jest.fn(),
        }),
      },
      addComment: {
        useMutation: () => ({ mutate: jest.fn(), isPending: false }),
      },
    },
  },
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
}));

jest.mock("@/components/activity/charts/ElevationProfileChart", () => ({
  __esModule: true,
  ElevationProfileChart: createHost("ElevationProfileChart"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Ellipsis: createHost("Ellipsis"),
  Heart: createHost("Heart"),
}));

const RouteDetailScreen = require("../route-detail").default;

describe("route detail screen", () => {
  beforeEach(() => {
    backMock.mockReset();
    deleteMutateMock.mockReset();
    toggleLikeMutateMock.mockReset();
    authState.user.id = "profile-1";
  });

  it("shows the new identity-first route layout", () => {
    renderNative(<RouteDetailScreen />);

    expect(screen.getByText("River Loop")).toBeTruthy();
    expect(screen.getByText("Flat start, climb home.")).toBeTruthy();
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("10.20 km")).toBeTruthy();
    expect(screen.getByText("Climb")).toBeTruthy();
    expect(screen.getByText("180m")).toBeTruthy();
    expect(screen.getByText("Descent")).toBeTruthy();
    expect(screen.getByText("175m")).toBeTruthy();
    expect(screen.getByText("System Template")).toBeTruthy();
    expect(screen.getByText("Comments (0)")).toBeTruthy();
  });

  it("moves delete into the header overflow menu", () => {
    renderNative(<RouteDetailScreen />);

    expect(screen.getByTestId("route-detail-options-trigger")).toBeTruthy();
    expect(screen.getByTestId("route-detail-options-delete")).toBeTruthy();
  });

  it("hides route overflow actions for non-owners", () => {
    authState.user.id = "profile-2";

    renderNative(<RouteDetailScreen />);

    expect(screen.queryByTestId("route-detail-options-trigger")).toBeNull();
  });

  it("uses a confirm modal before deleting a route", () => {
    renderNative(<RouteDetailScreen />);

    fireEvent.press(screen.getByTestId("route-detail-options-delete"));

    expect(screen.getByTestId("route-detail-delete-modal")).toBeTruthy();
    expect(deleteMutateMock).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId("route-detail-delete-confirm"));

    expect(deleteMutateMock).toHaveBeenCalledWith({ id: "11111111-1111-4111-8111-111111111111" });
  });
});
