import React from "react";
import type { ZodFormSubmitProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const navigateToMock = jest.fn();
const signInMock = jest.fn();
const refreshSessionMock = jest.fn(async () => undefined);
let searchParamsValue: { returnTo?: string | string[] } = {};

(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => searchParamsValue,
  useRouter: () => ({ push: jest.fn(), replace: replaceMock }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/components/auth/ServerUrlOverride", () => ({
  __esModule: true,
  ServerUrlOverride: () => null,
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  authClient: {
    signIn: {
      email: (...args: unknown[]) => signInMock(...args),
    },
  },
  refreshMobileAuthSession: () => refreshSessionMock(),
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
    getState: () => ({
      clearSession: jest.fn(async () => undefined),
      refreshSession: refreshSessionMock,
    }),
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

jest.mock("@repo/ui/components/form", () => {
  const { createFormTextField } = require("../../../test/mock-components");
  return {
    __esModule: true,
    Form: ({ children }: { children?: React.ReactNode }) => children,
    FormTextField: createFormTextField(),
  };
});

jest.mock("@repo/ui/components/text", () => {
  const { createHostComponent } = require("../../../test/mock-components");
  return { __esModule: true, Text: createHostComponent("Text") };
});

jest.mock("@repo/ui/hooks", () => {
  const React = require("react");
  return {
    __esModule: true,
    useZodForm: () => {
      const [values, setValues] = React.useState({ email: "", password: "" });
      const [errors, setErrors] = React.useState({} as Record<string, { message: string }>);
      return {
        control: {
          errors,
          values,
          setValue: (name: string, value: string) =>
            setValues((current: typeof values) => ({ ...current, [name]: value })),
        },
        formState: { errors },
        clearErrors: jest.fn(),
        setError: (name: string, error: { message: string }) => {
          setErrors((current: Record<string, { message: string }>) => ({
            ...current,
            [name]: error,
          }));
        },
        handleSubmit: (onSubmit: (data: typeof values) => unknown) => () => onSubmit(values),
      };
    },
    useZodFormSubmit: ({
      form,
      onSubmit,
    }: ZodFormSubmitProps<{ email: string; password: string }>) => ({
      handleSubmit: form.handleSubmit(onSubmit),
      isSubmitting: false,
    }),
  };
});

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  AlertCircle: () => React.createElement("AlertCircle"),
}));

const SignInScreen = require("../sign-in").default;

describe("sign-in screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    searchParamsValue = {};
    signInMock.mockResolvedValue({ error: null });
  });

  it("refreshes session and routes home after successful sign in", async () => {
    await renderNative(<SignInScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({
        email: "athlete@example.com",
        password: "Password123",
      });
      expect(refreshSessionMock).toHaveBeenCalled();
      expect(replaceMock).toHaveBeenCalledWith("/(internal)/(tabs)");
    });
  });

  it.each([
    "/integrations",
    "/training-preferences",
  ])("returns to the allowlisted %s destination after successful sign in", async (returnTo) => {
    searchParamsValue = { returnTo };
    await renderNative(<SignInScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith(returnTo));
  });

  it.each([
    ["external callback", "https://attacker.example/callback"],
    ["nested return URL", "/integrations?returnTo=https://attacker.example"],
    ["duplicate return target", ["/integrations", "/profile"]],
  ])("falls back home for a hostile or stale %s", async (_label, returnTo) => {
    searchParamsValue = { returnTo };
    await renderNative(<SignInScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith("/(internal)/(tabs)"));
  });

  it("marks the password field for credential-manager autofill", async () => {
    await renderNative(<SignInScreen />);

    expect(screen.getByTestId("password-input").props.autoComplete).toBe("current-password");
  });

  it("keeps credential fields in normal focus mode during Maestro entry", async () => {
    const original = process.env.EXPO_PUBLIC_MAESTRO_E2E;
    process.env.EXPO_PUBLIC_MAESTRO_E2E = "1";
    try {
      await renderNative(<SignInScreen />);

      expect(screen.getByTestId("email-input").props.selectTextOnFocus).not.toBe(true);
      expect(screen.getByTestId("password-input").props.selectTextOnFocus).not.toBe(true);
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_MAESTRO_E2E;
      else process.env.EXPO_PUBLIC_MAESTRO_E2E = original;
    }
  });

  it("navigates to the real forgot-password screen", async () => {
    await renderNative(<SignInScreen />);

    await fireEvent.press(screen.getByTestId("forgot-password-button"));

    expect(navigateToMock).toHaveBeenCalledWith("/(external)/forgot-password");
  });

  it("maps invalid credentials to the root form error", async () => {
    signInMock.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    await renderNative(<SignInScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => {
      expect(screen.getByTestId("root-error-container")).toBeTruthy();
    });
  });

  it("routes to verify when the account email is not verified", async () => {
    signInMock.mockResolvedValue({
      error: { message: "The email of this account is not verified" },
    });

    await renderNative(<SignInScreen />);

    await fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    await fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    await fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith({
        pathname: "/(external)/verify",
        params: { email: "athlete@example.com" },
      });
    });
  });
});
