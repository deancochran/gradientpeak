import React from "react";

import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, disabled, onPress, ...props }: any) =>
    React.createElement(
      "Pressable",
      {
        ...props,
        disabled,
        onPress: disabled ? undefined : onPress,
        testID:
          props.testID ??
          `button-${String(children?.props?.children ?? "")
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

const { TrainerSurface } = require("../TrainerSurface");

function buildSessionContract({
  hasTrainer,
  trainerControllable,
  consequences = [],
}: {
  hasTrainer: boolean;
  trainerControllable: boolean;
  consequences?: string[];
}) {
  return {
    devices: {
      hasTrainer,
      trainerControllable,
    },
    validation: {
      consequences,
    },
  };
}

describe("TrainerSurface", () => {
  it("opens trainer controls when the trainer is controllable", () => {
    const navigateTo = jest.fn();

    renderNative(
      <TrainerSurface
        navigateTo={navigateTo}
        sensorCount={1}
        sessionContract={
          buildSessionContract({ hasTrainer: true, trainerControllable: true }) as any
        }
      />,
    );

    fireEvent.press(screen.getByTestId("button-open-trainer-controls"));

    expect(navigateTo).toHaveBeenCalledWith("/record/ftms");
  });

  it("keeps trainer controls disabled when a trainer is present but not controllable", () => {
    const navigateTo = jest.fn();

    renderNative(
      <TrainerSurface
        navigateTo={navigateTo}
        sensorCount={1}
        sessionContract={
          buildSessionContract({
            hasTrainer: true,
            trainerControllable: false,
            consequences: ["Trainer is connected without direct control."],
          }) as any
        }
      />,
    );

    expect(screen.getByTestId("button-open-trainer-controls").props.disabled).toBe(true);
    expect(screen.getByText("Trainer is connected without direct control.")).toBeTruthy();

    expect(navigateTo).not.toHaveBeenCalled();
  });

  it("opens sensors even when trainer controls are unavailable", () => {
    const navigateTo = jest.fn();

    renderNative(
      <TrainerSurface
        navigateTo={navigateTo}
        sensorCount={0}
        sessionContract={
          buildSessionContract({ hasTrainer: false, trainerControllable: false }) as any
        }
      />,
    );

    fireEvent.press(screen.getByTestId("button-open-sensors"));

    expect(navigateTo).toHaveBeenCalledWith("/record/sensors");
  });
});
