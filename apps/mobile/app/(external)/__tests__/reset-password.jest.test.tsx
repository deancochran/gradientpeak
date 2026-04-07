import React from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

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
    Alert: { alert: (...args: any[]) => alertMock(...args) },
  };
});

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  authClient: {
    resetPassword: (...args: any[]) => resetPasswordMock(...args),
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
  const React = require("react");
  const host = (type: string) => (props: any) => React.createElement(type, props, props.children);
  return { __esModule: true, Alert: host("Alert"), AlertDescription: host("AlertDescription") };
});

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, disabled, onPress, ...props }: any) =>
    React.createElement(
      "Pressable",
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : onPress,
        testID: props.testID ?? props.testId,
      },
      children,
    ),
}));

jest.mock("@repo/ui/components/card", () => {
  const React = require("react");
  const host = (type: string) => (props: any) => React.createElement(type, props, props.children);
  return {
    __esModule: true,
    Card: host("Card"),
    CardContent: host("CardContent"),
    CardHeader: host("CardHeader"),
    CardTitle: host("CardTitle"),
  };
});

jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: any) => children,
  FormTextField: ({ control, name, placeholder, testId }: any) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement("TextInput", {
        placeholder,
        testID: testId ?? name,
        value: control.values[name] ?? "",
        onChangeText: (nextValue: string) => control.setValue(name, nextValue),
      }),
      control.errors[name] ? React.createElement("Text", null, control.errors[name].message) : null,
    ),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, ...props }: any) => React.createElement("Text", props, children),
}));

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
    useZodFormSubmit: ({ form, onSubmit }: any) => ({
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
