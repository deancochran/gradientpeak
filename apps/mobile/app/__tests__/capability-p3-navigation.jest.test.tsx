import React from "react";
import { createButtonComponent, createHost } from "../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../test/render-native";

const replaceMock = jest.fn();
const navigateToMock = jest.fn();
const guardNavigationMock = jest.fn((navigate: () => void) => navigate());
const setSelectionMock = jest.fn();
const tabPressMocks = new Map<string, jest.Mock>();
let authenticated = true;

const ButtonHost = createButtonComponent();

type PressableProps = React.PropsWithChildren<{ onPress?: () => void } & Record<string, unknown>>;

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: ({ children, onPress, ...props }: PressableProps) =>
    React.createElement("Pressable", { onPress, ...props }, children),
  View: createHost("View"),
}));

jest.mock("expo-router", () => {
  const React = require("react");

  function Tabs({ children }: React.PropsWithChildren) {
    return React.createElement(React.Fragment, null, children);
  }

  Tabs.Screen = ({ name, options }: { name: string; options?: Record<string, unknown> }) => {
    if (options?.href === null) {
      return null;
    }

    const onPress = jest.fn();
    tabPressMocks.set(name, onPress);
    const tabButton = options?.tabBarButton
      ? (options.tabBarButton as (props: Record<string, unknown>) => React.ReactNode)({
          onPress,
          testID: `tab-button-${name}`,
        })
      : React.createElement("View", { testID: `tab-button-${name}`, onPress });

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
    router: { replace: replaceMock },
  };
});

jest.mock("@repo/ui/components/avatar", () => ({
  __esModule: true,
  Avatar: createHost("Avatar"),
  AvatarFallback: createHost("AvatarFallback"),
  AvatarImage: createHost("AvatarImage"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  CalendarDays: createHost("CalendarDays"),
  Circle: createHost("Circle"),
  Home: createHost("Home"),
  Route: createHost("Route"),
  Search: createHost("Search"),
  Users: createHost("Users"),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({
    isAuthenticated: authenticated,
    user: { id: "user-1", email: "athlete@example.com" },
    profile: { username: "Athlete", avatar_url: null },
  }),
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useSessionView: () => ({ lifecycle: "idle" }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/navigation/useNavigationActionGuard", () => ({
  __esModule: true,
  useNavigationActionGuard: () => guardNavigationMock,
}));

jest.mock("@/lib/performance", () => ({
  __esModule: true,
  markNavigationStart: jest.fn(),
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useActivityRecorderService: () => ({ service: {} }),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getReachableSupabaseStorageUrl: (path: string) => path,
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: { setSelection: setSelectionMock },
  defaultRecordLaunchPayload: () => ({}),
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("@/lib/stores/trainingPreferencesSheetStore", () => ({
  __esModule: true,
  useTrainingPreferencesSheetStore: () => false,
}));

jest.mock("@/lib/theme", () => ({
  __esModule: true,
  getNavigationTheme: () => ({ colors: { card: "#fff", border: "#ddd", primary: "#000" } }),
  getResolvedThemeScale: () => ({ mutedForeground: "#666" }),
}));

jest.mock("@/components/settings/training-preferences/TrainingPreferencesEditor", () => ({
  __esModule: true,
  TrainingPreferencesEditor: createHost("TrainingPreferencesEditor"),
}));

const NotFoundScreen = require("../+not-found").default;
const TabsLayout = require("../(internal)/(tabs)/_layout").default;

describe("navigation capabilities", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tabPressMocks.clear();
    authenticated = true;
    navigateToMock.mockReset();
    guardNavigationMock.mockClear();
    setSelectionMock.mockReset();
  });

  it("keeps every primary destination reachable from its tab button", async () => {
    await renderNative(<TabsLayout />);

    for (const [routeName, testID] of [
      ["index", "tab-button-home"],
      ["plan", "tab-button-plan"],
      ["record-launcher", "tab-button-record"],
      ["discover", "tab-button-discover"],
      ["groups", "tab-button-community"],
    ] as const) {
      await fireEvent.press(screen.getByTestId(testID));
      if (routeName !== "record-launcher") {
        expect(tabPressMocks.get(routeName)).toHaveBeenCalledTimes(1);
      }
    }

    expect(guardNavigationMock).toHaveBeenCalledTimes(1);
    expect(setSelectionMock).toHaveBeenCalledTimes(1);
    expect(navigateToMock).toHaveBeenCalledWith("/record");
  });

  it("recovers an authenticated missing route to the internal home", async () => {
    await renderNative(<NotFoundScreen />);

    await fireEvent.press(screen.getByText("Go Home"));

    expect(replaceMock).toHaveBeenCalledWith("/(internal)/(tabs)");
  });

  it("recovers an unauthenticated missing route to the public home", async () => {
    authenticated = false;
    await renderNative(<NotFoundScreen />);

    await fireEvent.press(screen.getByText("Go Home"));

    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});
