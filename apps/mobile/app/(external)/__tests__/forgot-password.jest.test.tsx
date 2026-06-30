import type React from "react";
import type { ZodFormSubmitProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

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
      const [values, setValues] = React.useState({ email: "" });
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
        getValues: (name: string) => values[name as keyof typeof values],
        setError: (name: string, error: { message: string }) => {
          setErrors((current: Record<string, { message: string }>) => ({
            ...current,
            [name]: error,
          }));
        },
        handleSubmit: (onSubmit: (data: typeof values) => unknown) => () => onSubmit(values),
      };
    },
    useZodFormSubmit: ({ form, onSubmit }: ZodFormSubmitProps<{ email: string }>) => ({
      handleSubmit: form.handleSubmit(onSubmit),
      isSubmitting: false,
    }),
  };
});

const ForgotPasswordScreen = require("../forgot-password").default;

describe("forgot-password screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMock.mockResolvedValue({ error: null });
  });

  it("shows the success state after requesting a reset email", async () => {
    renderNative(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    fireEvent.press(screen.getByTestId("send-reset-button"));

    await waitFor(() => {
      expect(resetMock).toHaveBeenCalledWith({
        email: "athlete@example.com",
        redirectTo: "gradientpeak-dev://reset",
      });
      expect(screen.getByText("Check your email")).toBeTruthy();
    });
  });

  it("maps missing-user errors onto the email field", async () => {
    resetMock.mockResolvedValue({ error: { message: "User not found" } });

    renderNative(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    fireEvent.press(screen.getByTestId("send-reset-button"));

    await waitFor(() => {
      expect(screen.getByText("No account found with this email address")).toBeTruthy();
    });
  });
});
