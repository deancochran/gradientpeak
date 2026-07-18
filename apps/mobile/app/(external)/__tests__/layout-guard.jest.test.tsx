import type { HostProps } from "../../../test/mock-components";
import { renderNative, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();

const authState = {
  isAuthenticated: false,
  isEmailVerified: false,
  isFullyLoaded: true,
};

const pathnameState = {
  value: "/(external)/sign-in",
};
const runtimeGlobal = globalThis as typeof globalThis & { __DEV__?: boolean };
const originalDev = runtimeGlobal.__DEV__;
const originalE2E = process.env.EXPO_PUBLIC_MAESTRO_E2E;

jest.mock("expo-router", () => {
  const React = require("react");

  const StackComponent = ({ children, ...props }: HostProps) =>
    React.createElement("Stack", props, children);
  StackComponent.Screen = ({ children, ...props }: HostProps) =>
    React.createElement("StackScreen", props, children);

  return {
    __esModule: true,
    Stack: StackComponent,
    usePathname: () => pathnameState.value,
    useRouter: () => ({ replace: replaceMock }),
  };
});

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

const ExternalLayout = require("../_layout").default;

describe("external layout guard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authState.isAuthenticated = false;
    authState.isEmailVerified = false;
    authState.isFullyLoaded = true;
    pathnameState.value = "/(external)/sign-in";
    runtimeGlobal.__DEV__ = false;
    delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
  });

  afterAll(() => {
    if (originalDev === undefined) {
      delete runtimeGlobal.__DEV__;
    } else {
      runtimeGlobal.__DEV__ = originalDev;
    }
    if (originalE2E === undefined) {
      delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
    } else {
      process.env.EXPO_PUBLIC_MAESTRO_E2E = originalE2E;
    }
  });

  it("redirects verified users away from external auth routes", async () => {
    authState.isAuthenticated = true;
    authState.isEmailVerified = true;

    renderNative(<ExternalLayout />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });

  it("redirects authenticated unverified users back to verify from sign-in", async () => {
    authState.isAuthenticated = true;
    authState.isEmailVerified = false;
    pathnameState.value = "/(external)/sign-in";

    renderNative(<ExternalLayout />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/(external)/verify");
    });
  });

  it("allows authenticated unverified users to remain on verify", async () => {
    authState.isAuthenticated = true;
    authState.isEmailVerified = false;
    pathnameState.value = "/(external)/verify";

    renderNative(<ExternalLayout />);

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  it("allows authenticated users to open the E2E developer route in development", async () => {
    authState.isAuthenticated = true;
    authState.isEmailVerified = true;
    pathnameState.value = "/(external)/storybook";
    runtimeGlobal.__DEV__ = true;
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";

    renderNative(<ExternalLayout />);

    await waitFor(() => {
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });
});
