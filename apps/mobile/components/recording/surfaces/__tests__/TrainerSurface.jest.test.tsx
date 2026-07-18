import React, { type ComponentProps } from "react";

import { createHost, type PressableHostProps } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";
import { TrainerSurface } from "../TrainerSurface";

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, disabled, onPress, ...props }: PressableHostProps) =>
    React.createElement(
      "Pressable",
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : onPress,
        testID:
          props.testID ??
          `button-${String(
            React.isValidElement<{ children?: React.ReactNode }>(children)
              ? children.props.children
              : "",
          )
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")}`,
      },
      children,
    ),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

function buildSessionContract({
  hasTrainer,
  trainerControllable,
  consequences = [],
}: {
  hasTrainer: boolean;
  trainerControllable: boolean;
  consequences?: string[];
}): ComponentProps<typeof TrainerSurface>["sessionContract"] {
  return {
    devices: {
      hasTrainer,
      trainerControllable,
    },
    validation: {
      consequences,
    },
  } as ComponentProps<typeof TrainerSurface>["sessionContract"];
}

describe("TrainerSurface", () => {
  it("opens sensors when the trainer is controllable", () => {
    const navigateTo = jest.fn();

    renderNative(
      <TrainerSurface
        navigateTo={navigateTo}
        sensorCount={1}
        sessionContract={buildSessionContract({ hasTrainer: true, trainerControllable: true })}
      />,
    );

    fireEvent.press(screen.getByTestId("button-open-sensors"));

    expect(navigateTo).toHaveBeenCalledWith("/record/sensors");
  });

  it("shows trainer consequences when a trainer is present but not controllable", () => {
    const navigateTo = jest.fn();

    renderNative(
      <TrainerSurface
        navigateTo={navigateTo}
        sensorCount={1}
        sessionContract={buildSessionContract({
          hasTrainer: true,
          trainerControllable: false,
          consequences: ["Trainer is connected without direct control."],
        })}
      />,
    );

    expect(screen.getByText("Trainer is connected without direct control.")).toBeTruthy();

    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("opens sensors even when trainer controls are unavailable", () => {
    const navigateTo = jest.fn();

    renderNative(
      <TrainerSurface
        navigateTo={navigateTo}
        sensorCount={0}
        sessionContract={buildSessionContract({ hasTrainer: false, trainerControllable: false })}
      />,
    );

    fireEvent.press(screen.getByTestId("button-open-sensors"));

    expect(navigateTo).toHaveBeenCalledWith("/record/sensors");
  });
});
