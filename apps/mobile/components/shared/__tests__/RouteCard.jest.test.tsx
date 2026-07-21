import { usePreferredUnitSystem } from "@/lib/hooks/usePreferredUnitSystem";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { ResourceCardActionButton } from "../ResourceCardPrimitives";
import { RouteCard } from "../RouteCard";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: mockCreateHost("Pressable"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));

jest.mock("@repo/core", () => ({
  __esModule: true,
  decodePolyline: jest.fn(() => []),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: mockCreateHost("Activity"),
  Bike: mockCreateHost("Bike"),
  Dumbbell: mockCreateHost("Dumbbell"),
  Footprints: mockCreateHost("Footprints"),
  Heart: mockCreateHost("Heart"),
  Waves: mockCreateHost("Waves"),
}));

jest.mock("@/components/shared/StaticRouteMapPreview", () => ({
  __esModule: true,
  StaticRouteMapPreview: mockCreateHost("StaticRouteMapPreview"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    social: {
      toggleLike: {
        useMutation: () => ({ mutate: jest.fn() }),
      },
    },
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

jest.mock("@/lib/hooks/usePreferredUnitSystem", () => ({
  __esModule: true,
  usePreferredUnitSystem: jest.fn(() => "metric"),
}));

const mockUsePreferredUnitSystem = jest.mocked(usePreferredUnitSystem);

describe("RouteCard", () => {
  beforeEach(() => {
    mockUsePreferredUnitSystem.mockReturnValue("metric");
  });

  it("shows owner and last updated metadata in the footer", () => {
    renderNative(
      <RouteCard
        route={{
          id: "route-1",
          name: "Morning Loop",
          activity_category: "outdoor_run",
          total_distance: 5000,
          updated_at: "2026-03-21T08:00:00.000",
          owner: {
            id: "owner-1",
            username: "Coach Kim",
            avatar_url: null,
          },
        }}
        variant="compact"
      />,
    );

    expect(screen.getByText("Morning Loop")).toBeTruthy();
    expect(screen.queryByText("By")).toBeNull();
    expect(screen.getByText("Coach Kim")).toBeTruthy();
    expect(screen.getByText("Mar 21, 2026 • 8:00 AM")).toBeTruthy();
  });

  it("renders a dense list card without preview, social, or attribution metadata", () => {
    renderNative(
      <RouteCard
        route={{
          id: "route-2",
          name: "Lunch Climb",
          description: "A scenic route",
          activity_category: "outdoor_ride",
          total_distance: 42000,
          total_ascent: 850,
          total_descent: 850,
          created_at: "2026-03-21T08:00:00.000",
          likes_count: 12,
          owner: {
            id: "owner-2",
            username: "Coach Lee",
          },
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Lunch Climb")).toBeTruthy();
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("Climb")).toBeTruthy();
    expect(screen.getByText("Descent")).toBeTruthy();
    expect(screen.getByText("42.0 km")).toBeTruthy();
    expect(screen.getAllByText("850.0 m")).toHaveLength(2);
    expect(screen.queryByText("A scenic route")).toBeNull();
    expect(screen.queryByText("Coach Lee")).toBeNull();
    expect(screen.queryByText("12")).toBeNull();
    expect(screen.queryByTestId("route-card-like-button-route-2")).toBeNull();
    expect(screen.queryByTestId("route-card-map-preview-route-2")).toBeNull();
  });

  it("formats route distance and elevation in the viewer's imperial units", () => {
    mockUsePreferredUnitSystem.mockReturnValue("imperial");

    renderNative(
      <RouteCard
        route={{
          id: "route-2",
          name: "Lunch Climb",
          activity_category: "outdoor_ride",
          total_distance: 5000,
          total_ascent: 100,
          total_descent: 100,
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("3.1 mi")).toBeTruthy();
    expect(screen.getAllByText("328.1 ft")).toHaveLength(2);
  });

  it("allows list attribution and likes when explicitly requested", () => {
    renderNative(
      <RouteCard
        route={{
          id: "route-3",
          name: "City Run",
          activity_category: "outdoor_run",
          total_distance: 5000,
          created_at: "2026-03-21T08:00:00.000",
          likes_count: 3,
          owner: {
            id: "owner-3",
            username: "Coach Ari",
          },
        }}
        showAttribution
        showLike
        variant="list"
      />,
    );

    expect(screen.getByText("Coach Ari")).toBeTruthy();
    expect(screen.getByText("Mar 21, 2026 • 8:00 AM")).toBeTruthy();
    expect(screen.getByTestId("route-card-like-button-route-3")).toBeTruthy();
  });

  it("allows likes without adding attribution to a list card", () => {
    renderNative(
      <RouteCard
        route={{
          id: "route-4",
          name: "Track Session",
          activity_category: "outdoor_run",
          total_distance: 5000,
          likes_count: 3,
          owner: {
            id: "owner-4",
            username: "Coach Rey",
          },
        }}
        showLike
        variant="list"
      />,
    );

    expect(screen.getByTestId("route-card-like-button-route-4")).toBeTruthy();
    expect(screen.queryByText("Coach Rey")).toBeNull();
  });

  it("keeps list likes and standalone accessories independent from navigation", () => {
    const onAccessoryPress = jest.fn();
    const onLikePress = jest.fn();
    const onPress = jest.fn();

    renderNative(
      <RouteCard
        headerAccessory={
          <ResourceCardActionButton accessibilityLabel="Route options" onPress={onAccessoryPress}>
            {null}
          </ResourceCardActionButton>
        }
        isLiked={false}
        likeCount={3}
        onLikePress={onLikePress}
        onPress={onPress}
        route={{
          id: "route-boundaries",
          name: "City Run",
          activity_category: "outdoor_run",
          total_distance: 5000,
        }}
        showLike
        variant="list"
      />,
    );

    fireEvent.press(screen.getByLabelText("Route options"));
    expect(onAccessoryPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(onLikePress).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Like, 3 likes"));
    expect(onLikePress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
    expect(onAccessoryPress).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText("Open route City Run"));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLikePress).toHaveBeenCalledTimes(1);
    expect(onAccessoryPress).toHaveBeenCalledTimes(1);
  });
});
