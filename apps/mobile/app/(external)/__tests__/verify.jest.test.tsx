import React from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const resendMock = jest.fn();

const authState = {
  isEmailVerified: false,
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => ({ email: "athlete@example.com" }),
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/supabase/client", () => ({
  __esModule: true,
  supabase: {
    auth: {
      getUser: jest.fn(async () => ({ data: { user: null } })),
      refreshSession: jest.fn(async () => undefined),
      resend: (...args: any[]) => resendMock(...args),
      verifyOtp: jest.fn(async () => ({ error: null })),
    },
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
    React.createElement("TextInput", {
      placeholder,
      testID: testId ?? name,
      value: control.values[name] ?? "",
      onChangeText: (nextValue: string) => control.setValue(name, nextValue),
    }),
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
      const [values, setValues] = React.useState({ token: "" });
      const [errors, setErrors] = React.useState({} as Record<string, { message: string }>);

      return {
        control: {
          values,
          setValue: (name: string, value: string) => {
            setValues((current: typeof values) => ({ ...current, [name]: value }));
          },
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
    }),
  };
});

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  AlertCircle: () => React.createElement("AlertCircle"),
}));

const VerifyScreen = require("../verify").default;

describe("verify screen", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    authState.isEmailVerified = false;
    resendMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  it("shows a resend confirmation message", async () => {
    renderNative(<VerifyScreen />);

    fireEvent.press(screen.getByTestId("resend-code-button"));

    await waitFor(() => {
      expect(resendMock).toHaveBeenCalledWith({ type: "signup", email: "athlete@example.com" });
      expect(screen.getByTestId("resend-message").props.children).toBe("Verification code sent!");
    });
  });

  it("redirects verified users back into the app", () => {
    authState.isEmailVerified = true;

    renderNative(<VerifyScreen />);

    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});
