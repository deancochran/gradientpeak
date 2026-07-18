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

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Bell: mockCreateHost("Bell"),
  MessageSquare: mockCreateHost("MessageSquare"),
  Search: mockCreateHost("Search"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    messaging: { getUnreadCount: { useQuery: () => ({ data: 2 }) } },
    notifications: { getUnreadCount: { useQuery: () => ({ data: 3 }) } },
  },
}));

const {
  MessagesHeaderButton,
  NotificationsHeaderButton,
  SearchHeaderButton,
} = require("../HeaderButtons");

describe("header buttons", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("navigates to messages without stacking duplicate inbox routes", () => {
    renderNative(<MessagesHeaderButton />);

    const button = screen.getByTestId("messages-header-button");

    expect(button.props).toMatchObject({
      accessibilityLabel: "Messages",
      accessibilityRole: "button",
      accessibilityValue: { text: "2 unread messages" },
      activeOpacity: 0.7,
    });
    expect(button.props.className).toContain("w-11 h-11");

    fireEvent.press(button);

    expect(navigateMock).toHaveBeenCalledWith("/messages");
  });

  it("navigates to notifications without stacking duplicate hub routes", () => {
    renderNative(<NotificationsHeaderButton />);

    const button = screen.getByTestId("notifications-header-button");

    expect(button.props).toMatchObject({
      accessibilityLabel: "Notifications",
      accessibilityRole: "button",
      accessibilityValue: { text: "3 unread notifications" },
      activeOpacity: 0.7,
    });
    expect(button.props.className).toContain("w-11 h-11");

    fireEvent.press(button);

    expect(navigateMock).toHaveBeenCalledWith("/notifications");
  });

  it("navigates to global search without using the Discover tab", () => {
    renderNative(<SearchHeaderButton />);

    const button = screen.getByTestId("search-header-button");

    expect(button.props).toMatchObject({
      accessibilityLabel: "Search",
      accessibilityRole: "button",
      activeOpacity: 0.7,
    });
    expect(button.props.className).toContain("w-11 h-11");

    fireEvent.press(button);

    expect(navigateMock).toHaveBeenCalledWith("/search");
  });
});
