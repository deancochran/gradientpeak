import React from "react";
import { fireEvent, renderNative, screen, waitFor } from "../../../test/render-native";

const replaceMock = jest.fn();
const getSessionMock = jest.fn();
const sendVerificationEmailMock = jest.fn();

jest.mock("expo-linking", () => ({
  __esModule: true,
  createURL: jest.fn(() => "gradientpeak://verification-success"),
}));

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

jest.mock("@/lib/stores/auth-store", () => ({
  __esModule: true,
  useAuthStore: {
    getState: () => ({ refreshSession: jest.fn(async () => undefined) }),
  },
}));

jest.mock("@/lib/auth/auth-client", () => ({
  __esModule: true,
  getAuthClient: () => ({
    getSession: (...args: any[]) => getSessionMock(...args),
    sendVerificationEmail: (...args: any[]) => sendVerificationEmailMock(...args),
  }),
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

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, ...props }: any) => React.createElement("Text", props, children),
}));

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
    getSessionMock.mockResolvedValue({ data: { user: { emailVerified: false } }, error: null });
    sendVerificationEmailMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
  });

  it("shows a resend confirmation message", async () => {
    renderNative(<VerifyScreen />);

    fireEvent.press(screen.getByTestId("resend-code-button"));

    await waitFor(() => {
      expect(sendVerificationEmailMock).toHaveBeenCalledWith({
        email: "athlete@example.com",
        callbackURL: "gradientpeak://verification-success",
      });
      expect(screen.getByTestId("resend-message").props.children).toBe("Verification email sent!");
    });
  });

  it("redirects verified users back into the app", () => {
    authState.isEmailVerified = true;

    renderNative(<VerifyScreen />);

    expect(replaceMock).toHaveBeenCalledWith("/");
  });
});
