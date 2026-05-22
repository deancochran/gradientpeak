import { createHost as mockCreateHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
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

describe("RouteCard", () => {
  it("shows owner and last updated metadata in the footer", () => {
    renderNative(
      <RouteCard
        route={{
          id: "route-1",
          name: "Morning Loop",
          activity_category: "outdoor_run",
          total_distance: 5000,
          updated_at: "2026-03-21T12:00:00.000Z",
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
});
