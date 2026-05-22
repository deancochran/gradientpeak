import { decodePolyline } from "@repo/core";
import { fireEvent } from "@testing-library/react-native";
import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import { ActivityCard } from "../ActivityCard";

const toggleLikeMutateMock = jest.fn();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: mockCreateHost("Pressable"),
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  View: mockCreateHost("View"),
}));

jest.mock("react-native-svg", () => ({
  __esModule: true,
  default: mockCreateHost("Svg"),
  Polyline: mockCreateHost("Polyline"),
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
  formatDurationSec: jest.fn(() => "60 min"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: mockCreateHost("Activity"),
  Bike: mockCreateHost("Bike"),
  ChevronRight: mockCreateHost("ChevronRight"),
  Dumbbell: mockCreateHost("Dumbbell"),
  Footprints: mockCreateHost("Footprints"),
  Heart: mockCreateHost("Heart"),
  MessageCircle: mockCreateHost("MessageCircle"),
  Route: mockCreateHost("Route"),
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
        useMutation: () => ({ mutate: toggleLikeMutateMock }),
      },
    },
  },
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
}));

describe("ActivityCard", () => {
  beforeEach(() => {
    toggleLikeMutateMock.mockReset();
    jest.mocked(decodePolyline).mockReturnValue([]);
  });

  it("shows a like action by default in list mode", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          type: "run",
          started_at: "2026-03-21T12:00:00.000Z",
          likes_count: 2,
          has_liked: false,
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Morning Run")).toBeTruthy();
    expect(screen.getByTestId("activity-card-like-button-activity-1")).toBeTruthy();
  });

  it("shows activity summary metrics in list mode", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          type: "run",
          distance_meters: 10000,
          duration_seconds: 3600,
          avg_speed_mps: 2.78,
          avg_power: 240,
          avg_heart_rate: 148,
          derived: { stress: { tss: 72, intensity_factor: 0.82 } },
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("10.00 km")).toBeTruthy();
    expect(screen.getByText("Duration")).toBeTruthy();
    expect(screen.getByText("60 min")).toBeTruthy();
    expect(screen.getByText("TSS")).toBeTruthy();
    expect(screen.getByText("~72")).toBeTruthy();
    expect(screen.getByText("IF")).toBeTruthy();
    expect(screen.getByText("~0.82")).toBeTruthy();
    expect(screen.queryByText("Avg Pace")).toBeNull();
    expect(screen.queryByText("Avg Power")).toBeNull();
    expect(screen.queryByText("Avg HR")).toBeNull();
  });

  it("keeps load metric slots visible when derived values are unavailable", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          type: "run",
          distance_meters: 1000,
          duration_seconds: 600,
          derived: null,
        }}
        variant="list"
      />,
    );

    expect(screen.getByText("TSS")).toBeTruthy();
    expect(screen.getByText("IF")).toBeTruthy();
    expect(screen.getAllByText("--")).toHaveLength(2);
  });

  it("toggles likes using the activity entity type", () => {
    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          likes_count: 2,
          has_liked: false,
        }}
        variant="list"
      />,
    );

    fireEvent.press(screen.getByTestId("activity-card-like-button-activity-1"));

    expect(toggleLikeMutateMock).toHaveBeenCalledWith({
      entity_id: "activity-1",
      entity_type: "activity",
    });
  });

  it("renders the shared static map preview for list route thumbnails", () => {
    jest.mocked(decodePolyline).mockReturnValue([
      { latitude: 35.1, longitude: -80.1 },
      { latitude: 35.2, longitude: -80.2 },
    ]);

    renderNative(
      <ActivityCard
        activity={{
          id: "activity-1",
          name: "Morning Run",
          polyline: "encoded-route",
        }}
        variant="list"
      />,
    );

    expect(screen.UNSAFE_getByType("StaticRouteMapPreview" as any)).toBeTruthy();
  });
});
