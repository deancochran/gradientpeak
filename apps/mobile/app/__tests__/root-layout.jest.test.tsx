import React from "react";
import { createHost } from "../../test/mock-components";
import { renderNative, screen } from "../../test/render-native";

const replaceMock = jest.fn();

const authState = {
  userStatus: "verified",
  onboardingStatus: true,
  isAuthenticated: true,
  isFullyLoaded: true,
  user: { id: "user-1", email: "athlete@example.com" },
  profileLoading: false,
  profileError: null,
  refreshProfile: jest.fn(async () => undefined),
};

const themeState = {
  theme: "light",
  resolvedTheme: "light",
  isLoaded: true,
};

let segmentsValue: string[] = ["(internal)", "(tabs)"];

jest.mock("@/global.css", () => ({}), { virtual: true });

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ActivityIndicator: createHost("ActivityIndicator"),
  View: createHost("View"),
}));

jest.mock("react-native-gesture-handler", () => ({
  __esModule: true,
  GestureHandlerRootView: createHost("GestureHandlerRootView"),
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  SafeAreaProvider: createHost("SafeAreaProvider"),
  SafeAreaView: createHost("SafeAreaView"),
}));

jest.mock("@rn-primitives/portal", () => ({
  __esModule: true,
  PortalHost: createHost("PortalHost"),
}));

jest.mock("expo-status-bar", () => ({
  __esModule: true,
  StatusBar: createHost("StatusBar"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  Redirect: ({ href }: any) =>
    React.createElement("Text", { testID: "redirect-target" }, JSON.stringify(href)),
  Slot: () => React.createElement("Text", null, "Internal app content"),
  router: { replace: replaceMock },
  useSegments: () => segmentsValue,
}));

jest.mock("nativewind", () => ({
  __esModule: true,
  vars: (value: any) => value,
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock(
  "@repo/tailwindcss/native",
  () => ({
    __esModule: true,
    NATIVE_THEME_VARIABLES: { light: {}, dark: {} },
  }),
  { virtual: true },
);

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/providers/QueryProvider", () => ({
  __esModule: true,
  QueryProvider: ({ children }: any) => children,
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  initializeServerConfig: jest.fn(async () => undefined),
  useServerConfig: () => ({ initialized: true }),
}));

jest.mock("@/lib/services/ActivityRecorder/StreamBuffer", () => ({
  __esModule: true,
  StreamBuffer: { cleanupOrphanedRecordings: jest.fn(async () => undefined) },
}));

jest.mock("@/lib/services/fit/GarminFitEncoder", () => ({
  __esModule: true,
  GarminFitEncoder: { cleanupOrphanedRecordings: jest.fn(async () => undefined) },
}));

jest.mock("@/lib/services/sentry", () => ({
  __esModule: true,
  initSentry: jest.fn(),
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: (selector: any) =>
    selector({
      clearSession: jest.fn(async () => undefined),
      initialize: jest.fn(async () => undefined),
      ready: true,
    }),
}));

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => themeState,
}));

const RootLayout = require("../_layout").default;

describe("root layout auth guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(authState, {
      userStatus: "verified",
      onboardingStatus: true,
      isAuthenticated: true,
      isFullyLoaded: true,
      user: { id: "user-1", email: "athlete@example.com" },
      profileLoading: false,
      profileError: null,
    });
    segmentsValue = ["(internal)", "(tabs)"];
  });

  it("redirects unauthenticated users to sign in", () => {
    authState.isAuthenticated = false;
    segmentsValue = ["(internal)", "(tabs)"];

    renderNative(<RootLayout />);

    expect(screen.getByTestId("redirect-target").props.children).toContain("sign-in");
  });

  it("redirects unverified users to verify with their email", () => {
    authState.userStatus = "pending";
    segmentsValue = ["(internal)", "(tabs)"];

    renderNative(<RootLayout />);

    expect(screen.getByTestId("redirect-target").props.children).toContain("verify");
    expect(screen.getByTestId("redirect-target").props.children).toContain("athlete@example.com");
  });

  it("redirects signed-in users away from sign-up and into verify until confirmed", () => {
    authState.userStatus = "unverified" as any;
    segmentsValue = ["(external)", "sign-up"];

    renderNative(<RootLayout />);

    expect(screen.getByTestId("redirect-target").props.children).toContain("verify");
    expect(screen.getByTestId("redirect-target").props.children).toContain("athlete@example.com");
  });

  it("redirects verified users without onboarding to onboarding", () => {
    authState.onboardingStatus = false;
    segmentsValue = ["(internal)", "(tabs)"];

    renderNative(<RootLayout />);

    expect(screen.getByTestId("redirect-target").props.children).toContain("onboarding");
  });

  it("renders the internal app slot for fully eligible users", () => {
    renderNative(<RootLayout />);

    expect(screen.getByText("Internal app content")).toBeTruthy();
  });
});
