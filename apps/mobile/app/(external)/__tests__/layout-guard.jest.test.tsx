import type { HostProps } from "../../../test/mock-components";
import { renderNative, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
let pathname = "/verify";
let auth = {
  isAuthenticated: true,
  isEmailVerified: false,
  isFullyLoaded: true,
};

jest.mock("expo-router", () => {
  const React = require("react");
  const Stack = ({ children, ...props }: HostProps) =>
    React.createElement("Stack", props, children);
  Stack.Screen = ({ children, ...props }: HostProps) =>
    React.createElement("StackScreen", props, children);

  return {
    __esModule: true,
    Stack,
    usePathname: () => pathname,
    useRouter: () => ({ replace: replaceMock }),
  };
});

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => auth,
}));

const ExternalLayout = require("../_layout").default;

describe("external layout navigation ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pathname = "/verify";
    auth = {
      isAuthenticated: true,
      isEmailVerified: false,
      isFullyLoaded: true,
    };
  });

  it.each([
    ["a verified account at sign-in", "/sign-in", true],
    ["an unverified account at sign-in", "/sign-in", false],
    ["an unverified account at verification", "/verify", false],
    ["an unverified account at callback", "/callback", false],
  ])("does not imperatively redirect %s", async (_scenario, nextPathname, isEmailVerified) => {
    pathname = `/(external)${nextPathname}`;
    auth = { isAuthenticated: true, isEmailVerified, isFullyLoaded: true };

    await renderNative(<ExternalLayout />);

    await waitFor(() => expect(replaceMock).not.toHaveBeenCalled());
  });
});
