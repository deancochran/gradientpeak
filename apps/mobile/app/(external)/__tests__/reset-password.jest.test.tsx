import React from "react";
import { act, fireEvent, renderNative, screen } from "../../../test/render-native";

const replaceMock = jest.fn();
const resetPasswordMock = jest.fn();
const alertMock = jest.fn();
const signOutMobileAuthMock = jest.fn(async () => undefined);
const paramsState: { token?: string } = { token: "reset-token" };

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => paramsState,
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("react-native", () => {
  const actual = jest.requireActual("../../../test/react-native");
  return {
    __esModule: true,
    ...actual,
    Alert: { alert: (...args: unknown[]) => alertMock(...args) },
  };
});

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  authClient: {
    resetPassword: (...args: unknown[]) => resetPasswordMock(...args),
  },
  signOutMobileAuth: () => signOutMobileAuthMock(),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getHostedApiUrl: () => "https://api.gradientpeak.test",
  setServerUrlOverride: jest.fn(async () => ({ changed: false })),
  useServerConfig: () => ({ apiUrl: "https://api.gradientpeak.test", overrideUrl: null }),
}));

jest.mock("@/lib/auth/request-timeout", () => ({
  __esModule: true,
  AuthRequestTimeoutError: class AuthRequestTimeoutError extends Error {},
  getAuthRequestTimeoutMessage: () => "Request timed out",
  withAuthRequestTimeout: async (promise: Promise<unknown>) => promise,
}));

jest.mock("@/lib/logging/mobile-action-log", () => ({
  __esModule: true,
  logMobileAction: jest.fn(),
}));

const clearSessionMock = jest.fn(async () => undefined);
jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: {
    getState: () => ({ clearSession: clearSessionMock }),
  },
}));

jest.mock("@repo/ui/components/alert", () => {
  const { createHostComponent } = require("../../../test/mock-components");
  return {
    __esModule: true,
    Alert: createHostComponent("Alert"),
    AlertDescription: createHostComponent("AlertDescription"),
  };
});

jest.mock("@repo/ui/components/button", () => {
  const { createPressableHost } = require("../../../test/mock-components");
  return { __esModule: true, Button: createPressableHost() };
});

jest.mock("@repo/ui/components/card", () => {
  const { createHostComponent } = require("../../../test/mock-components");
  return {
    __esModule: true,
    Card: createHostComponent("Card"),
    CardContent: createHostComponent("CardContent"),
    CardHeader: createHostComponent("CardHeader"),
    CardTitle: createHostComponent("CardTitle"),
  };
});

jest.mock("@repo/ui/components/text", () => {
  const { createHostComponent } = require("../../../test/mock-components");
  return { __esModule: true, Text: createHostComponent("Text") };
});

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  AlertCircle: () => React.createElement("AlertCircle"),
}));

const ResetPasswordScreen = require("../reset-password").default;

describe("reset-password screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    paramsState.token = "reset-token";
    resetPasswordMock.mockResolvedValue({ error: null });
  });

  it("explains a missing token inline and offers recovery with Save disabled", async () => {
    paramsState.token = undefined;

    await renderNative(<ResetPasswordScreen />);

    expect(screen.getByTestId("update-password-button").props.disabled).toBe(true);
    expect(
      screen.getByText(/This password reset link is missing or invalid/).props.accessibilityRole,
    ).toBe("alert");
    await fireEvent.press(screen.getByTestId("request-reset-link-button"));
    expect(replaceMock).toHaveBeenCalledWith("/(external)/forgot-password");
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it("ignores an old token completion after a new reset link opens", async () => {
    let finish!: (value: unknown) => void;
    resetPasswordMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = await renderNative(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("confirm-password-input"), "Password123");
    const press = screen.getByTestId("update-password-button").props.onPress;
    await act(async () => {
      void press();
      void press();
    });
    expect(resetPasswordMock).toHaveBeenCalledTimes(1);
    paramsState.token = "next-token";
    await view.rerender(<ResetPasswordScreen />);
    expect(screen.getByTestId("password-input").props.value).toBe("");
    await act(async () => finish({ error: null }));
    expect(signOutMobileAuthMock).not.toHaveBeenCalled();
    expect(alertMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it("marks new password fields for credential-manager generation", async () => {
    await renderNative(<ResetPasswordScreen />);

    expect(screen.getByTestId("password-input").props.autoComplete).toBe("new-password");
    expect(screen.getByTestId("confirm-password-input").props.autoComplete).toBe("new-password");
  });

  it("retains rejected credentials and explains an expired token with disabled Save", async () => {
    resetPasswordMock.mockResolvedValueOnce({ error: { message: "Invalid token" } });
    await renderNative(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("confirm-password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("update-password-button"));
    expect(screen.getByTestId("password-input").props.value).toBe("Password123");
    expect(screen.getByTestId("update-password-button").props.disabled).toBe(true);
    expect(screen.getByTestId("request-reset-link-button")).toBeTruthy();
    expect(signOutMobileAuthMock).not.toHaveBeenCalled();
  });

  it("clears credentials only after confirmed success", async () => {
    await renderNative(<ResetPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("confirm-password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("update-password-button"));
    expect(screen.getByTestId("password-input").props.value).toBe("");
    expect(screen.getByTestId("confirm-password-input").props.value).toBe("");
    expect(signOutMobileAuthMock).toHaveBeenCalledTimes(1);
  });
});
