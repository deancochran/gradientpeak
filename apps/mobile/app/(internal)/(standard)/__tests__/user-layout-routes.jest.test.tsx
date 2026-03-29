import React from "react";

import { renderNative, screen } from "../../../../test/render-native";

function createHost(type: string) {
  return function MockComponent(props: any) {
    return React.createElement(type, props, props.children);
  };
}

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({
    back: jest.fn(),
  }),
  Stack: Object.assign(createHost("Stack"), {
    Screen: (props: any) =>
      React.createElement("StackScreen", { testID: `stack-screen-${props.name}`, ...props }),
  }),
}));

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
  TouchableOpacity: createHost("TouchableOpacity"),
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ChevronLeft: createHost("ChevronLeft"),
}));

const StandardLayout = require("../_layout").default;

describe("standard layout user route declarations", () => {
  it("registers canonical user route and excludes settings route", () => {
    renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-user/[userId]")).toBeTruthy();
    expect(screen.queryByTestId("stack-screen-settings")).toBeNull();
    expect(screen.queryByTestId("stack-screen-me")).toBeNull();
  });
});
