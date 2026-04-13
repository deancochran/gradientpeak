import React from "react";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const replaceMock = jest.fn();
const paramsState: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => paramsState,
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, onPress, ...props }: any) =>
    React.createElement("Pressable", { onPress, ...props }, children),
}));

jest.mock("@repo/ui/components/card", () => ({
  __esModule: true,
  Card: ({ children, ...props }: any) => React.createElement("Card", props, children),
  CardContent: ({ children, ...props }: any) => React.createElement("CardContent", props, children),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: ({ children, ...props }: any) => React.createElement("Text", props, children),
}));

const AuthErrorScreen = require("../auth-error").default;

describe("auth error screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(paramsState).forEach((key) => delete paramsState[key]);
  });

  it("replaces to sign-in when retry is pressed", () => {
    renderNative(<AuthErrorScreen />);

    fireEvent.press(screen.getByTestId("try-again-button"));

    expect(replaceMock).toHaveBeenCalledWith("/(external)/sign-in");
  });

  it("replaces to welcome when go back is pressed", () => {
    renderNative(<AuthErrorScreen />);

    fireEvent.press(screen.getByTestId("go-back-button"));

    expect(replaceMock).toHaveBeenCalledWith("/(external)/");
  });
});
