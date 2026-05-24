import { createHost as mockCreateHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const navigateMock = jest.fn();
const pushMock = jest.fn();
const authState = {
  user: { id: "11111111-1111-4111-8111-111111111111", email: "own@test.com" },
  profile: {
    username: "Owner",
    avatar_url: null,
  },
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ navigate: navigateMock, push: pushMock }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  NativeModules: { BlobModule: {} },
  Platform: {
    OS: "ios",
    Version: "17",
    select: (values: Record<string, unknown>) => values.ios ?? values.default,
  },
  TouchableOpacity: mockCreateHost("TouchableOpacity"),
  Pressable: mockCreateHost("Pressable"),
  View: mockCreateHost("View"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: mockCreateHost("Card"),
  CardContent: mockCreateHost("CardContent"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/input", () => ({
  __esModule: true,
  Input: mockCreateHost("Input"),
}));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: mockCreateHost("Textarea"),
}));

jest.mock("lucide-react-native", () => {
  const Icon = mockCreateHost("LucideIcon");
  return {
    __esModule: true,
    Activity: Icon,
    Bike: Icon,
    Dumbbell: Icon,
    Footprints: Icon,
    Waves: Icon,
  };
});

describe.skip("avatar profile navigation", () => {
  it("routes app header avatar to canonical own user route", async () => {
    const { AppHeader } = await import("../AppHeader");
    navigateMock.mockReset();
    pushMock.mockReset();

    renderNative(<AppHeader />);

    fireEvent.press(screen.getByTestId("app-header-avatar-button"));

    expect(navigateMock).toHaveBeenCalledWith("/profile");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("routes activity avatar taps to target user route", async () => {
    const { ActivityHeader } = await import("@/components/activity/shared/ActivityHeader");
    pushMock.mockReset();

    renderNative(
      <ActivityHeader
        user={{
          id: "22222222-2222-4222-8222-222222222222",
          username: "Other",
          avatarUrl: null,
        }}
        activity={{
          type: "run",
          name: "Morning Run",
          startedAt: "2026-01-01T10:00:00.000Z",
        }}
      />,
    );

    fireEvent.press(screen.getByTestId("activity-header-user-button"));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/user/[userId]",
      params: { userId: "22222222-2222-4222-8222-222222222222" },
    });
  });
});
