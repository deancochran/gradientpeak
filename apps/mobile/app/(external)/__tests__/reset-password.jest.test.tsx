import React from "react";
import type { ZodFormSubmitProps } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

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
      const [values, setValues] = React.useState({ password: "", confirmPassword: "" });
      const [errors, setErrors] = React.useState({} as Record<string, { message: string }>);
      return {
        control: {
          errors,
          values,
          setValue: (name: string, value: string) =>
            setValues((current: typeof values) => ({ ...current, [name]: value })),
        },
        formState: { errors },
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
    }: ZodFormSubmitProps<{ confirmPassword: string; password: string }>) => ({
      handleSubmit: form.handleSubmit(onSubmit),
      isSubmitting: false,
    }),
  };
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

  it("shows an invalid-link alert when the reset token is missing", async () => {
    paramsState.token = undefined;

    renderNative(<ResetPasswordScreen />);

    expect(screen.getByTestId("update-password-button").props.disabled).toBe(true);
  });
});
