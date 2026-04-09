import React from "react";

import { fireEvent, renderNative, screen } from "../../../test/render-native";

const pushMock = jest.fn();
const authState = {
  user: { id: "11111111-1111-4111-8111-111111111111", email: "own@test.com" },
  profile: {
    username: "Owner",
    avatar_url: null,
  },
};

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: pushMock }),
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
  TouchableOpacity: createHost("TouchableOpacity"),
  Pressable: createHost("Pressable"),
  View: createHost("View"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: createHost("Card"),
  CardContent: createHost("CardContent"),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/input", () => ({ __esModule: true, Input: createHost("Input") }));
jest.mock("@repo/ui/components/textarea", () => ({
  __esModule: true,
  Textarea: createHost("Textarea"),
}));

jest.mock("lucide-react-native", () => {
  const Icon = createHost("LucideIcon");
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
    pushMock.mockReset();

    renderNative(<AppHeader />);

    fireEvent.press(screen.getByTestId("app-header-avatar-button"));

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/user/[userId]",
      params: { userId: authState.user.id },
    });
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
