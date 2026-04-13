import React from "react";
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

jest.mock("expo-router", () => {
  const React = require("react");

  const StackComponent = ({ children, ...props }: any) =>
    React.createElement("Stack", props, children);
  StackComponent.Screen = ({ children, ...props }: any) =>
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
});
