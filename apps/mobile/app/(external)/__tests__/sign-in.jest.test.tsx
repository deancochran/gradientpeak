import React from "react";
import type { ZodFormSubmitProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const signInMock = jest.fn();
const refreshSessionMock = jest.fn(async () => undefined);

(globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = false;

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: replaceMock }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => jest.fn(),
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
    getState: () => ({ clearSession: jest.fn(async () => undefined) }),
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
    signInMock.mockResolvedValue({ error: null });
  });

  it("refreshes session and routes home after successful sign in", async () => {
    renderNative(<SignInScreen />);

    fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith({
        email: "athlete@example.com",
        password: "Password123",
      });
      expect(refreshSessionMock).toHaveBeenCalled();
    });
  });

  it("maps invalid credentials to the root form error", async () => {
    signInMock.mockResolvedValue({ error: { message: "Invalid login credentials" } });

    renderNative(<SignInScreen />);

    fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => {
      expect(screen.getByTestId("root-error-container")).toBeTruthy();
    });
  });

  it("routes to verify when the account email is not verified", async () => {
    signInMock.mockResolvedValue({
      error: { message: "The email of this account is not verified" },
    });

    renderNative(<SignInScreen />);

    fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    fireEvent.press(screen.getByTestId("sign-in-button"));

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith({
        pathname: "/(external)/verify",
        params: { email: "athlete@example.com" },
      });
    });
  });
});
