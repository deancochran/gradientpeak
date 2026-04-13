import React from "react";

import { fireEvent, renderNative, screen } from "../../../test/render-native";

const navigateMock = jest.fn();

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ navigate: navigateMock, push: jest.fn() }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Bell: createHost("Bell"),
  MessageSquare: createHost("MessageSquare"),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    messaging: { getUnreadCount: { useQuery: () => ({ data: 2 }) } },
    notifications: { getUnreadCount: { useQuery: () => ({ data: 3 }) } },
  },
}));

const { MessagesHeaderButton, NotificationsHeaderButton } = require("../HeaderButtons");

describe("header buttons", () => {
  beforeEach(() => {
    navigateMock.mockReset();
  });

  it("navigates to messages without stacking duplicate inbox routes", () => {
    renderNative(<MessagesHeaderButton />);

    fireEvent.press(screen.getByTestId("messages-header-button"));

    expect(navigateMock).toHaveBeenCalledWith("/messages");
  });

  it("navigates to notifications without stacking duplicate hub routes", () => {
    renderNative(<NotificationsHeaderButton />);

    fireEvent.press(screen.getByTestId("notifications-header-button"));

    expect(navigateMock).toHaveBeenCalledWith("/notifications");
  });
});
