import React from "react";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const signUpMock = jest.fn();
const refreshMobileAuthSessionMock = jest.fn();
const refreshStoreSessionMock = jest.fn();
const authState: { loading: boolean; user?: { id: string } } = { loading: false };

type HostProps = {
  children?: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
  testId?: string;
  [key: string]: unknown;
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: replaceMock }),
}));

jest.mock("@/components/auth/ServerUrlOverride", () => ({
  __esModule: true,
  ServerUrlOverride: () => null,
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  authClient: {
    signUp: {
      email: (...args: unknown[]) => signUpMock(...args),
    },
  },
  refreshMobileAuthSession: (...args: unknown[]) => refreshMobileAuthSessionMock(...args),
  getEmailVerificationCallbackUrl: () => "gradientpeak-dev://callback",
}));

jest.mock("@/lib/auth/request-timeout", () => ({
  __esModule: true,
  AuthRequestTimeoutError: class AuthRequestTimeoutError extends Error {},
  getAuthRequestTimeoutMessage: () => "Request timed out",
  withAuthRequestTimeout: async (promise: Promise<unknown>) => promise,
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/logging/mobile-action-log", () => ({
  __esModule: true,
  logMobileAction: jest.fn(),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getHostedApiUrl: () => "https://api.gradientpeak.test",
  isServerUrlOverrideEnabled: () => false,
  setServerUrlOverride: jest.fn(async () => ({ changed: false })),
  useServerConfig: () => ({ apiUrl: "https://api.gradientpeak.test", overrideUrl: null }),
}));

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: {
    getState: () => ({
      clearSession: jest.fn(async () => undefined),
      refreshSession: refreshStoreSessionMock,
    }),
  },
}));

jest.mock("@repo/ui/components/alert", () => {
  const React = require("react");
  const host = (type: string) => (props: HostProps) =>
    React.createElement(
      type,
      props,
      React.Children.map(props.children, (child: React.ReactNode) =>
        typeof child === "string" || typeof child === "number"
          ? React.createElement("Text", null, String(child))
          : child,
      ),
    );

  return {
    __esModule: true,
    Alert: host("Alert"),
    AlertDescription: host("AlertDescription"),
  };
});

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, disabled, onPress, ...props }: HostProps) =>
    React.createElement(
      "Pressable",
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : onPress,
        testID: props.testID ?? props.testId,
      },
      React.Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number"
          ? React.createElement("Text", null, String(child))
          : child,
      ),
    ),
}));

jest.mock("@repo/ui/components/card", () => {
  const React = require("react");
  const host = (type: string) => (props: HostProps) =>
    React.createElement(
      type,
      props,
      React.Children.map(props.children, (child: React.ReactNode) =>
        typeof child === "string" || typeof child === "number"
          ? React.createElement("Text", null, String(child))
          : child,
      ),
    );

  return {
    __esModule: true,
    Card: host("Card"),
    CardContent: host("CardContent"),
    CardHeader: host("CardHeader"),
    CardTitle: host("CardTitle"),
  };
});

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, ...props }: HostProps) => React.createElement("Text", props, children),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  AlertCircle: () => React.createElement("AlertCircle"),
}));

const SignUpScreen = require("../sign-up").default;

describe("sign-up screen", () => {
  it("locks pending fields, single-flights and retains failed credentials", async () => {
    let finish!: (value: unknown) => void;
    signUpMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderNative(<SignUpScreen />);
    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("repeat-password-input"), "Password123");
    const press = screen.getByTestId("sign-up-button").props.onPress;
    await act(async () => {
      void press();
      void press();
    });
    expect(signUpMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("email-input").props.editable).toBe(false);
    await fireEvent.press(screen.getByTestId("sign-in-link-button"));
    expect(replaceMock).not.toHaveBeenCalled();
    await act(async () => finish({ error: { message: "Request unavailable" } }));
    expect(screen.getByTestId("password-input").props.value).toBe("Password123");
    expect(screen.getByTestId("repeat-password-input").props.value).toBe("Password123");
  });
  beforeEach(() => {
    jest.clearAllMocks();
    delete authState.user;
    signUpMock.mockResolvedValue({ error: null });
    refreshMobileAuthSessionMock.mockResolvedValue(null);
    refreshStoreSessionMock.mockResolvedValue(undefined);
  });

  it("routes to verify after successful sign up", async () => {
    await renderNative(<SignUpScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("repeat-password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-up-button"));

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "athlete@example.com",
          password: "Password123",
        }),
      );
      expect(replaceMock).toHaveBeenCalledWith({
        pathname: "/(external)/verify",
        params: { email: "athlete@example.com", source: "sign-up" },
      });
    });
  });

  it("marks new password fields for credential-manager generation", async () => {
    await renderNative(<SignUpScreen />);

    expect(screen.getByTestId("password-input").props.autoComplete).toBe("new-password");
    expect(screen.getByTestId("repeat-password-input").props.autoComplete).toBe("new-password");
  });

  it("routes verified sessions into the app after sign up success", async () => {
    refreshMobileAuthSessionMock.mockResolvedValue({
      user: { id: "user-1", email: "athlete@example.com", emailVerified: true },
    });

    await renderNative(<SignUpScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("repeat-password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-up-button"));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith("/");
    });
  });

  it("maps duplicate-email errors onto the email field", async () => {
    signUpMock.mockResolvedValue({ error: { message: "User already exists. Use another email." } });

    await renderNative(<SignUpScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("repeat-password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-up-button"));

    await waitFor(() => {
      expect(screen.getByText("An account with this email already exists")).toBeTruthy();
    });
  });

  it("does not navigate or reset fields after another account takes ownership", async () => {
    let finish!: (value: unknown) => void;
    signUpMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = await renderNative(<SignUpScreen />);
    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.changeText(screen.getByTestId("repeat-password-input"), "Password123");
    await act(async () => {
      void screen.getByTestId("sign-up-button").props.onPress();
    });
    authState.user = { id: "another-account" };
    await view.rerender(<SignUpScreen />);
    await act(async () => finish({ error: null, data: { user: { id: "created-account" } } }));
    expect(replaceMock).not.toHaveBeenCalled();
    expect(refreshMobileAuthSessionMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("password-input").props.value).toBe("Password123");
  });
});
