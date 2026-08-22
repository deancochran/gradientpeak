import React from "react";
import { Pressable } from "react-native";

import { createHost, type HostProps } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Modal: ({ visible, children, ...props }: HostProps & { visible?: boolean }) =>
    visible ? React.createElement("Modal", props, children) : null,
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/core", () => ({
  __esModule: true,
  getActivityDisplayName: (category: string) => category,
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Bike: createHost("Bike"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  Waves: createHost("Waves"),
  X: createHost("X"),
}));

const { RecordingActivityQuickEdit } = require("../RecordingActivityQuickEdit");

describe("RecordingActivityQuickEdit", () => {
  it("does not emit activity changes when activity editing is locked", () => {
    const onClose = jest.fn();
    const onActivitySelect = jest.fn();

    renderNative(
      <RecordingActivityQuickEdit
        visible
        onClose={onClose}
        onActivitySelect={onActivitySelect}
        currentCategory="bike"
        canEditActivity={false}
      />,
    );

    fireEvent.press(screen.getByTestId("activity-select-run"));

    expect(onActivitySelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not render GPS controls", () => {
    renderNative(
      <RecordingActivityQuickEdit
        visible
        onClose={jest.fn()}
        onActivitySelect={jest.fn()}
        currentCategory="bike"
        canEditActivity={true}
      />,
    );

    expect(screen.queryByTestId("gps-on-option")).toBeNull();
    expect(screen.queryByTestId("gps-off-option")).toBeNull();
    expect(screen.queryByText(/GPS/i)).toBeNull();
  });

  it("provides accessible controls and hides the visual dismissal backdrop", () => {
    renderNative(
      <RecordingActivityQuickEdit
        visible
        onClose={jest.fn()}
        onActivitySelect={jest.fn()}
        currentCategory="bike"
        canEditActivity={true}
      />,
    );

    expect(screen.getByLabelText("Close activity quick edit").props).toMatchObject({
      accessibilityRole: "button",
      accessibilityHint: "Dismisses this quick edit panel.",
    });
    expect(screen.getByTestId("activity-select-bike").props).toMatchObject({
      accessibilityRole: "button",
      accessibilityState: { disabled: false, selected: true },
    });
    const [backdrop] = screen.UNSAFE_getAllByType(Pressable);
    expect(backdrop?.props).toMatchObject({
      accessible: false,
      importantForAccessibility: "no-hide-descendants",
    });
  });
});
