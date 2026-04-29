import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const pushMock = jest.fn();
const guardNavigationMock = jest.fn((navigate: () => void) => navigate());
const navigateToMock = jest.fn();
const setSelectionMock = jest.fn();
let mockRecordingLifecycle: "idle" | "setup" | "active" = "idle";

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

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Calendar: createHost("Calendar"),
  Circle: createHost("Circle"),
  Home: createHost("Home"),
  Target: createHost("Target"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    user: { id: "user-1", email: "athlete@example.com" },
    profile: { username: "Athlete", avatar_url: null },
  }),
}));

jest.mock("@/lib/navigation/useNavigationActionGuard", () => ({
  __esModule: true,
  useNavigationActionGuard: () => guardNavigationMock,
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useRecordingLifecycle: () => mockRecordingLifecycle,
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useSharedActivityRecorder: () => ({}),
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: setSelectionMock },
  defaultRecordLaunchPayload: () => ({
    launchSource: "record_tab",
    category: "run",
    gpsRecordingEnabled: true,
  }),
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
    setSelectionMock.mockReset();
    mockRecordingLifecycle = "idle";
  });

  it("configures all primary tabs", () => {
    renderNative(<TabsLayout />);

    expect(screen.getByText("Home")).toBeTruthy();
    expect(screen.getByText("Plan")).toBeTruthy();
    expect(screen.getByText("Record")).toBeTruthy();
    expect(screen.getByText("Calendar")).toBeTruthy();
    expect(screen.getByText("Profile")).toBeTruthy();
  });

  it("routes the record tab through the navigation guard", () => {
    renderNative(<TabsLayout />);

    fireEvent.press(screen.getByTestId("tab-button-record"));

    expect(guardNavigationMock).toHaveBeenCalledTimes(1);
    expect(setSelectionMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith("/record");
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("does not reset recording setup from the record tab", () => {
    mockRecordingLifecycle = "setup";
    renderNative(<TabsLayout />);

    fireEvent.press(screen.getByTestId("tab-button-record"));

    expect(setSelectionMock).not.toHaveBeenCalled();
    expect(navigateToMock).toHaveBeenCalledWith("/record");
  });

  it("does not reset active recording from the record tab", () => {
    mockRecordingLifecycle = "active";
    renderNative(<TabsLayout />);

    fireEvent.press(screen.getByTestId("tab-button-record"));

    expect(setSelectionMock).not.toHaveBeenCalled();
    expect(navigateToMock).toHaveBeenCalledWith("/record");
  });
});
