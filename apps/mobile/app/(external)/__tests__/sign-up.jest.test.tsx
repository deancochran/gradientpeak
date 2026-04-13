import React from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const signUpMock = jest.fn();

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
      email: (...args: any[]) => signUpMock(...args),
    },
  },
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
  useAuth: () => ({ loading: false }),
}));

jest.mock("@/lib/logging/mobile-action-log", () => ({
  __esModule: true,
  logMobileAction: jest.fn(),
}));

jest.mock("@/lib/server-config", () => ({
  __esModule: true,
  getHostedApiUrl: () => "https://api.gradientpeak.test",
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
  const React = require("react");
  const host = (type: string) => (props: any) => React.createElement(type, props, props.children);

  return {
    __esModule: true,
    Alert: host("Alert"),
    AlertDescription: host("AlertDescription"),
  };
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
      const [values, setValues] = React.useState({
        email: "",
        password: "",
        repeatPassword: "",
      });
      const [errors, setErrors] = React.useState({} as Record<string, { message: string }>);

      return {
        control: {
          errors,
          values,
          setValue: (name: string, value: string) => {
            setValues((current: typeof values) => ({ ...current, [name]: value }));
          },
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

const SignUpScreen = require("../sign-up").default;

describe("sign-up screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    signUpMock.mockResolvedValue({ error: null });
  });

  it("routes to verify after successful sign up", async () => {
    renderNative(<SignUpScreen />);

    fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    fireEvent.changeText(screen.getByTestId("repeat-password-input"), "Password123");
    fireEvent.press(screen.getByTestId("sign-up-button"));

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "athlete@example.com",
          password: "Password123",
        }),
      );
      expect(replaceMock).toHaveBeenCalledWith({
        pathname: "/(external)/verify",
        params: { email: "athlete@example.com" },
      });
    });
  });

  it("maps duplicate-email errors onto the email field", async () => {
    signUpMock.mockResolvedValue({ error: { message: "User already registered" } });

    renderNative(<SignUpScreen />);

    fireEvent.changeText(screen.getByTestId("email-input"), "athlete@example.com");
    fireEvent.changeText(screen.getByTestId("password-input"), "Password123");
    fireEvent.changeText(screen.getByTestId("repeat-password-input"), "Password123");
    fireEvent.press(screen.getByTestId("sign-up-button"));

    await waitFor(() => {
      expect(screen.getByText("An account with this email already exists")).toBeTruthy();
    });
  });
});
