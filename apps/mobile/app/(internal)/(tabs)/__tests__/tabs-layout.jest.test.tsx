import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const guardNavigationMock = jest.fn((navigate: () => void) => navigate());
const navigateToMock = jest.fn();

const ButtonHost = createButtonComponent();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("expo-router", () => {
  const React = require("react");

  function Tabs({ children }: any) {
    return React.createElement(React.Fragment, null, children);
  }

  Tabs.Screen = ({ name, options }: any) => {
    const tabButton = options?.tabBarButton
      ? options.tabBarButton({ testID: `tab-button-${name}` })
      : React.createElement("View", { testID: `tab-screen-${name}` });

    return React.createElement(
      "View",
      { testID: `tab-config-${name}` },
      React.createElement("Text", null, options?.title ?? name),
      tabButton,
    );
  };

  return {
    __esModule: true,
    Tabs,
    useRouter: () => ({ push: pushMock }),
  };
});

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Calendar: createHost("Calendar"),
  Circle: createHost("Circle"),
  Home: createHost("Home"),
  Search: createHost("Search"),
  Target: createHost("Target"),
}));

jest.mock("@/lib/navigation/useNavigationActionGuard", () => ({
  __esModule: true,
  useNavigationActionGuard: () => guardNavigationMock,
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("@/lib/theme", () => ({
  __esModule: true,
  getNavigationTheme: () => ({ colors: { primary: "#000" } }),
  getResolvedThemeScale: () => ({ mutedForeground: "#666" }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

const TabsLayout = require("../_layout").default;

describe("tabs layout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    navigateToMock.mockReset();
  });

  it("configures all primary tabs", () => {
    renderNative(<TabsLayout />);

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Discover")).toBeTruthy();
    expect(screen.getByText("Record")).toBeTruthy();
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
  });

  it("routes the record tab through the navigation guard", () => {
    renderNative(<TabsLayout />);

    fireEvent.press(screen.getByTestId("tab-button-record"));

    expect(guardNavigationMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith("/record");
    expect(pushMock).not.toHaveBeenCalled();
  });
});
