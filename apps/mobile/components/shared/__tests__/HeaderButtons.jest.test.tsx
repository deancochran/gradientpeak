import React from "react";

import {
  createHost as mockCreateHost,
  type PressableHostProps,
} from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const navigateMock = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ navigate: navigateMock, push: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: ({ children, onPress, ...props }: PressableHostProps) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: mockCreateHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: mockCreateHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: mockCreateHost("Text") }));
jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: mockCreateHost("Avatar"),
  AvatarFallback: mockCreateHost("AvatarFallback"),
  AvatarImage: mockCreateHost("AvatarImage"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Bell: mockCreateHost("Bell"),
  Inbox: mockCreateHost("Inbox"),
  MessageSquare: mockCreateHost("MessageSquare"),
  Search: mockCreateHost("Search"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    profile: { avatar_url: null, username: "Athlete" },
    user: { email: "athlete@example.com" },
  }),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (path: string) => path,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    messaging: { getUnreadCount: { useQuery: () => ({ data: 2 }) } },
    notifications: { getUnreadCount: { useQuery: () => ({ data: 3 }) } },
  },
}));

const {
  InboxHeaderButton,
  MeHeaderButton,
  MessagesHeaderButton,
  NotificationsHeaderButton,
  SearchHeaderButton,
} = require("../HeaderButtons");

describe("header buttons", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("opens Me from the avatar", async () => {
    await renderNative(<MeHeaderButton />);

    const button = screen.getByTestId("app-header-avatar-button");
    expect(button.props).toMatchObject({
      accessibilityLabel: "Open Me",
      accessibilityRole: "button",
    });

    await fireEvent.press(button);
    expect(navigateMock).toHaveBeenCalledWith("/me");
  });

  it("combines unread messages and notifications in Inbox", async () => {
    await renderNative(<InboxHeaderButton />);

    const button = screen.getByTestId("inbox-header-button");
    expect(button.props).toMatchObject({
      accessibilityLabel: "Inbox",
      accessibilityValue: { text: "5 unread items" },
    });
    expect(screen.getByText("5")).toBeTruthy();

    await fireEvent.press(button);
    expect(navigateMock).toHaveBeenCalledWith("/inbox");
  });

  it("navigates to messages without stacking duplicate inbox routes", async () => {
    await renderNative(<MessagesHeaderButton />);

    const button = screen.getByTestId("messages-header-button");

    expect(button.props).toMatchObject({
      accessibilityLabel: "Messages",
      accessibilityRole: "button",
      accessibilityValue: { text: "2 unread messages" },
      activeOpacity: 0.7,
    });
    expect(button.props.className).toContain("w-11 h-11");

    await fireEvent.press(button);

    expect(navigateMock).toHaveBeenCalledWith("/messages");
  });

  it("navigates to notifications without stacking duplicate hub routes", async () => {
    await renderNative(<NotificationsHeaderButton />);

    const button = screen.getByTestId("notifications-header-button");

    expect(button.props).toMatchObject({
      accessibilityLabel: "Notifications",
      accessibilityRole: "button",
      accessibilityValue: { text: "3 unread notifications" },
      activeOpacity: 0.7,
    });
    expect(button.props.className).toContain("w-11 h-11");

    await fireEvent.press(button);

    expect(navigateMock).toHaveBeenCalledWith("/notifications");
  });

  it("navigates legacy search controls to the Discover tab", async () => {
    await renderNative(<SearchHeaderButton />);

    const button = screen.getByTestId("search-header-button");

    expect(button.props).toMatchObject({
      accessibilityLabel: "Search",
      accessibilityRole: "button",
      activeOpacity: 0.7,
    });
    expect(button.props.className).toContain("w-11 h-11");

    await fireEvent.press(button);

    expect(navigateMock).toHaveBeenCalledWith("/(internal)/(tabs)/discover");
  });
});
