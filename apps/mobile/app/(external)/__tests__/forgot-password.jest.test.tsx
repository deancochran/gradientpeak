import { act, fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const resetMock = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@/components/auth/ServerUrlOverride", () => ({
  __esModule: true,
  ServerUrlOverride: () => null,
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  authClient: {
    requestPasswordReset: (...args: unknown[]) => resetMock(...args),
  },
  getPasswordResetCallbackUrl: () => "gradientpeak-dev://reset",
}));

jest.mock("@/lib/auth/request-timeout", () => ({
  __esModule: true,
  AuthRequestTimeoutError: class AuthRequestTimeoutError extends Error {},
  getAuthRequestTimeoutMessage: () => "Request timed out",
  withAuthRequestTimeout: async (promise: Promise<unknown>) => promise,
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ loading: false }),
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
    getState: () => ({ clearSession: jest.fn(async () => undefined) }),
  },
}));

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

const ForgotPasswordScreen = require("../forgot-password").default;

describe("forgot-password screen", () => {
  it("single-flights recovery and ignores late completion after recipient changes", async () => {
    let finish!: (value: unknown) => void;
    resetMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await renderNative(<ForgotPasswordScreen />);
    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    const change = screen.getByTestId("email-input").props.onChangeText;
    const press = screen.getByTestId("send-reset-button").props.onPress;
    await act(async () => {
      void press();
      void press();
    });
    expect(resetMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("email-input").props.editable).toBe(false);
    await act(async () => change("other@example.com"));
    await act(async () => finish({ error: null }));
    expect(screen.queryByText("Check your email")).toBeNull();
    expect(screen.getByTestId("email-input").props.value).toBe("other@example.com");
  });
  beforeEach(() => {
    jest.clearAllMocks();
    resetMock.mockResolvedValue({ error: null });
  });

  it("shows the success state after requesting a reset email", async () => {
    await renderNative(<ForgotPasswordScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.press(screen.getByTestId("send-reset-button"));

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledWith({
        email: "athlete@example.com",
        redirectTo: "gradientpeak-dev://reset",
      });
      expect(screen.getByText("Check your email")).toBeTruthy();
    });
  });

  it("acknowledges unknown identities exactly like existing identities", async () => {
    resetMock.mockResolvedValue({ error: { message: "User not found" } });

    await renderNative(<ForgotPasswordScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.press(screen.getByTestId("send-reset-button"));

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeTruthy();
      expect(
        screen.getByText(
          "If an account matches that email address, password reset instructions will arrive shortly.",
        ),
      ).toBeTruthy();
      expect(screen.queryByText(/No account found/i)).toBeNull();
    });
  });

  it("acknowledges thrown transport failures exactly like existing identities", async () => {
    resetMock.mockRejectedValue(new Error("provider unavailable: athlete@example.com"));

    await renderNative(<ForgotPasswordScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.press(screen.getByTestId("send-reset-button"));

    await waitFor(() => {
      expect(screen.getByText("Check your email")).toBeTruthy();
      expect(
        screen.getByText(
          "If an account matches that email address, password reset instructions will arrive shortly.",
        ),
      ).toBeTruthy();
    });
  });
});
