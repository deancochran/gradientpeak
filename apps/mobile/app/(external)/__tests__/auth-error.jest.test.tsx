import { clearRecord } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

const replaceMock = jest.fn();
const paramsState: Record<string, string | undefined> = {};

jest.mock("expo-router", () => ({
  __esModule: true,
  useLocalSearchParams: () => paramsState,
  useRouter: () => ({ replace: replaceMock }),
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

const AuthErrorScreen = require("../auth-error").default;

describe("auth error screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearRecord(paramsState);
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
