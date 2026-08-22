import type { HostProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const replaceMock = jest.fn();

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ isAuthenticated: false }),
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
  };
});

jest.mock("@repo/ui/components/text", () => {
  const { createHostComponent } = require("../../../test/mock-components");
  return { __esModule: true, Text: createHostComponent("Text") };
});

jest.mock("react-native", () => {
  const React = require("react");
  return {
    __esModule: true,
    View: ({ children, ...props }: HostProps) => React.createElement("View", props, children),
  };
});

const WelcomeScreen = require("../index").default;

describe("auth.open-access-options", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("lets a signed-out visitor choose sign-in or account creation", () => {
    renderNative(<WelcomeScreen />);

    fireEvent.press(screen.getByTestId("login-button"));
    expect(replaceMock).toHaveBeenCalledWith({ pathname: "/(external)/sign-in" });

    fireEvent.press(screen.getByTestId("signup-button"));
    expect(replaceMock).toHaveBeenCalledWith({ pathname: "/(external)/sign-up" });
  });
});
