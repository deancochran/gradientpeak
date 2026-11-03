import React from "react";
import { act, fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const resendMock = jest.fn();
const params = { email: "athlete@example.com", source: undefined };
const acknowledgement =
  "If this email can be verified, a verification link will be sent. Check your inbox, or try again shortly.";

const authState = {
  isEmailVerified: false,
  user: { id: "account-a" },
};

type HostProps = {
  children?: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
  testId?: string;
  [key: string]: unknown;
};

type FormControl = {
  values: Record<string, string>;
  setValue: (name: string, value: string) => void;
};

type ZodFormSubmitArgs = {
  form: { handleSubmit: (onSubmit: (data: Record<string, string>) => unknown) => () => unknown };
  onSubmit: (data: Record<string, string>) => unknown;
};

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => params,
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => authState,
}));

jest.mock("@/lib/auth/client", () => ({
  __esModule: true,
  authClient: {
    sendVerificationEmail: (...args: unknown[]) => resendMock(...args),
  },
  getEmailVerificationCallbackUrl: jest.fn(() => "gradientpeak://callback"),
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
      children,
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

jest.mock("@repo/ui/components/form", () => ({
  __esModule: true,
  Form: ({ children }: { children?: React.ReactNode }) => children,
  FormTextField: ({
    control,
    name,
    placeholder,
    testId,
  }: {
    control: FormControl;
    name: string;
    placeholder?: string;
    testId?: string;
  }) =>
    React.createElement("TextInput", {
      placeholder,
      testID: testId ?? name,
      value: control.values[name] ?? "",
      onChangeText: (nextValue: string) => control.setValue(name, nextValue),
    }),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, ...props }: HostProps) => React.createElement("Text", props, children),
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
    useZodFormSubmit: ({ form, onSubmit }: ZodFormSubmitArgs) => ({
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
    authState.user = { id: "account-a" };
    params.email = "athlete@example.com";
    resendMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  it("shows a resend confirmation message", async () => {
    await renderNative(<VerifyScreen />);

    await fireEvent.press(screen.getByTestId("resend-code-button"));

    await waitFor(() => {
      expect(resendMock).toHaveBeenCalledWith({
        email: "athlete@example.com",
        callbackURL: "gradientpeak://callback",
      });
      expect(screen.getByTestId("resend-message").props.children).toBe(acknowledgement);
    });
  });

  it("keeps delivery failures generic and announces the acknowledgement", async () => {
    resendMock.mockResolvedValue({ error: { message: "SMTP connection refused" } });

    await renderNative(<VerifyScreen />);

    await fireEvent.press(screen.getByTestId("resend-code-button"));

    await waitFor(() => {
      expect(screen.getByTestId("resend-message").props.children).toBe(acknowledgement);
      expect(screen.getByTestId("resend-message").props.accessibilityRole).toBe("alert");
    });
  });

  it("does not reveal whether the email was already verified", async () => {
    resendMock.mockResolvedValue({
      error: { message: "Email already verified. Sign in instead." },
    });

    await renderNative(<VerifyScreen />);

    await fireEvent.press(screen.getByTestId("resend-code-button"));

    await waitFor(() => {
      expect(screen.getByTestId("resend-message").props.children).toBe(acknowledgement);
    });
  });

  it.each([
    "email",
    "account",
  ])("ignores late completion after %s changes and single-flights each context", async (change) => {
    let finish!: (value: unknown) => void;
    resendMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = await renderNative(<VerifyScreen />);
    const press = screen.getByTestId("resend-code-button").props.onPress;
    await act(async () => {
      void press();
      void press();
    });
    expect(resendMock).toHaveBeenCalledTimes(1);
    if (change === "email") params.email = "next@example.com";
    else authState.user = { id: "account-b" };
    await view.rerender(<VerifyScreen />);
    await act(async () => finish({ error: null }));
    expect(screen.queryByTestId("resend-message")).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId("resend-code-button"));
    expect(resendMock).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("resend-message").props.children).toBe(acknowledgement);
  });

  it("keeps thrown transport failures generic", async () => {
    resendMock.mockRejectedValueOnce(new Error("private delivery detail"));
    await renderNative(<VerifyScreen />);
    await fireEvent.press(screen.getByTestId("resend-code-button"));
    expect(screen.getByTestId("resend-message").props.children).toBe(acknowledgement);
  });

  it("offers a way back to sign in", async () => {
    await renderNative(<VerifyScreen />);

    await fireEvent.press(screen.getByTestId("back-to-sign-in-button"));

    expect(replaceMock).toHaveBeenCalledWith("/(external)/sign-in");
  });

  it("redirects verified users back into the app", async () => {
    authState.isEmailVerified = true;

    await renderNative(<VerifyScreen />);

    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});
