import React from "react";

import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Modal: ({ visible, children, ...props }: any) =>
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

jest.mock("@repo/ui/components/toggle-group", () => ({
  __esModule: true,
  ToggleGroup: ({ children, ...props }: any) => React.createElement("ToggleGroup", props, children),
  ToggleGroupIcon: createHost("ToggleGroupIcon"),
  ToggleGroupItem: ({ children, ...props }: any) =>
    React.createElement("Pressable", props, children),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Bike: createHost("Bike"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  MapPin: createHost("MapPin"),
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
        currentGpsRecordingEnabled={false}
        canEditActivity={false}
        canEditGps={true}
      />,
    );

    fireEvent.press(screen.getByTestId("activity-select-run"));

    expect(onActivitySelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("marks GPS options disabled when GPS editing is locked", () => {
    renderNative(
      <RecordingActivityQuickEdit
        visible
        onClose={jest.fn()}
        onActivitySelect={jest.fn()}
        currentCategory="bike"
        currentGpsRecordingEnabled={false}
        canEditActivity={true}
        canEditGps={false}
      />,
    );

    expect(screen.getByTestId("gps-on-option").props.disabled).toBe(true);
    expect(screen.getByTestId("gps-off-option").props.disabled).toBe(true);
  });
});
