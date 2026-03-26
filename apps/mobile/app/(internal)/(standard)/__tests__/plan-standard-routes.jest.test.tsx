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

describe("standard layout plan detail routes", () => {
  it("declares event, goal, preferences, and training plan list screens", () => {
    renderNative(<StandardLayout />);

    expect(screen.getByTestId("stack-screen-event-detail").props.options).toMatchObject({
      title: "Event Details",
    });
    expect(screen.getByTestId("stack-screen-goal-detail").props.options).toMatchObject({
      title: "Goal Details",
    });
    expect(screen.getByTestId("stack-screen-training-preferences").props.options).toMatchObject({
      title: "Training Preferences",
    });
    expect(screen.getByTestId("stack-screen-training-plans-list").props.options).toMatchObject({
      title: "Training Plans",
    });
  });
});
