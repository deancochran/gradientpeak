import React from "react";
import { renderNative, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const parseMobileAuthCallbackMock = jest.fn();
const refreshSessionMock = jest.fn(async () => undefined);

const paramsState: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => paramsState,
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  parseMobileAuthCallback: (...args: any[]) => parseMobileAuthCallbackMock(...args),
  refreshMobileAuthSession: () => refreshSessionMock(),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, ...props }: any) => React.createElement("Text", props, children),
}));

const AuthCallbackScreen = require("../callback").default;

describe("auth callback screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(paramsState).forEach((key) => delete paramsState[key]);
  });

  it("routes password-reset callbacks into reset-password", async () => {
    paramsState.intent = "password-reset";
    paramsState.token = "reset-token";
    parseMobileAuthCallbackMock.mockReturnValue({
      success: true,
      data: { intent: "password-reset", token: "reset-token", error: null },
    });

    renderNative(<AuthCallbackScreen />);

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith({
        pathname: "/(external)/reset-password",
        params: { token: "reset-token" },
      });
    });
  });

  it("refreshes session and routes home after post-sign-in callbacks", async () => {
    paramsState.intent = "post-sign-in";
    paramsState.code = "auth-code";
    parseMobileAuthCallbackMock.mockReturnValue({
      success: true,
      data: { intent: "post-sign-in", token: null, error: null },
    });

    renderNative(<AuthCallbackScreen />);

    await waitFor(() => {
      expect(refreshSessionMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });
});
