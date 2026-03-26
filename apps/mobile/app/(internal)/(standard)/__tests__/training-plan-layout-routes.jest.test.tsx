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

describe("standard layout training-plan route declarations", () => {
  it("keeps canonical routes and excludes deprecated legacy entries", () => {
    renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-training-plan-detail")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-training-plans-list")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-training-plan-create")).toBeTruthy();
    expect(screen.getByTestId("stack-screen-training-plan-edit").props.options).toMatchObject({
      title: "Edit Training Plan",
    });

    expect(screen.queryByTestId("stack-screen-training-plan-adjust")).toBeNull();
    expect(screen.queryByTestId("stack-screen-training-plan-method-selector")).toBeNull();
    expect(screen.queryByTestId("stack-screen-training-plan-wizard")).toBeNull();
    expect(screen.queryByTestId("stack-screen-training-plan-review")).toBeNull();
  });
});
