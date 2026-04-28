import React from "react";
import { Pressable } from "react-native";

import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ bottom: 12, left: 0, right: 0, top: 0 }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createButtonComponent(),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/components/recording/footer", () => ({
  __esModule: true,
  RecordingControls: ({ onStart, onPause, onResume, onLap, onFinish }: any) => (
    <>
      <Pressable testID="controls-start" onPress={onStart} />
      <Pressable testID="controls-pause" onPress={onPause} />
      <Pressable testID="controls-resume" onPress={onResume} />
      <Pressable testID="controls-lap" onPress={onLap} />
      <Pressable testID="controls-finish" onPress={onFinish} />
    </>
  ),
}));

const { RecordControlDock } = require("../RecordControlDock");

const sessionContract = {
  authority: {
    category: "plan",
    structure: "plan",
    spatial: "route",
    locationCapture: "gps",
    trainerExecution: "trainer",
  },
  guidance: {
    hasPlan: true,
    hasStructuredSteps: true,
    hasRoute: true,
    routeMode: "live_navigation",
  },
  devices: {
    hasTrainer: true,
    trainerControllable: true,
    hasPower: true,
    hasHeartRate: false,
    hasCadence: false,
    gpsAvailable: true,
  },
  editing: {
    canEditActivity: false,
    canEditPlan: true,
    canEditRoute: true,
    canEditGps: true,
    locksIdentityAfterStart: true,
  },
  metrics: {
    primaryMetric: "distance",
    emphasizedMetrics: ["distance", "power"],
  },
  surfaces: {
    defaultPrimarySurface: "route",
    availablePrimarySurfaces: ["route", "workout", "trainer", "metrics"],
    quickActions: ["activity", "gps", "plan", "route", "trainer", "sensors"],
  },
  validation: {
    consequences: [],
  },
};

function renderDock(overrides: Partial<React.ComponentProps<typeof RecordControlDock>> = {}) {
  return renderNative(
    <RecordControlDock
      activeSurface="route"
      onChangeSurface={jest.fn()}
      onGpsPress={jest.fn()}
      onOpenActivity={jest.fn()}
      onOpenFtms={jest.fn()}
      onOpenPlan={jest.fn()}
      onOpenRoute={jest.fn()}
      onOpenSensors={jest.fn()}
      onStart={jest.fn()}
      onPause={jest.fn()}
      onResume={jest.fn()}
      onLap={jest.fn()}
      onFinish={jest.fn()}
      recordingState="idle"
      sessionContract={sessionContract}
      {...overrides}
    />,
  );
}

describe("RecordControlDock", () => {
  it("renders contract quick actions and routes presses to the matching handlers", () => {
    const onOpenActivity = jest.fn();
    const onGpsPress = jest.fn();
    const onOpenPlan = jest.fn();
    const onOpenRoute = jest.fn();
    const onOpenFtms = jest.fn();
    const onOpenSensors = jest.fn();

    renderDock({
      onOpenActivity,
      onGpsPress,
      onOpenPlan,
      onOpenRoute,
      onOpenFtms,
      onOpenSensors,
    });

    fireEvent.press(screen.getByTestId("button-activity-locked"));
    fireEvent.press(screen.getByTestId("button-gps-on"));
    fireEvent.press(screen.getByTestId("button-plan-attached"));
    fireEvent.press(screen.getByTestId("button-route-attached"));
    fireEvent.press(screen.getByTestId("button-trainer"));
    fireEvent.press(screen.getByTestId("button-sensors"));

    expect(onOpenActivity).toHaveBeenCalledTimes(1);
    expect(onGpsPress).toHaveBeenCalledTimes(1);
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    expect(onOpenRoute).toHaveBeenCalledTimes(1);
    expect(onOpenFtms).toHaveBeenCalledTimes(1);
    expect(onOpenSensors).toHaveBeenCalledTimes(1);
  });

  it("switches available primary surfaces from the dock", () => {
    const onChangeSurface = jest.fn();

    renderDock({ onChangeSurface });

    fireEvent.press(screen.getByTestId("record-dock-surface-workout"));
    fireEvent.press(screen.getByTestId("record-dock-surface-metrics"));

    expect(onChangeSurface).toHaveBeenNthCalledWith(1, "workout");
    expect(onChangeSurface).toHaveBeenNthCalledWith(2, "metrics");
  });

  it("forwards primary recording control actions", () => {
    const onStart = jest.fn();
    const onPause = jest.fn();
    const onResume = jest.fn();
    const onLap = jest.fn();
    const onFinish = jest.fn();

    renderDock({ onStart, onPause, onResume, onLap, onFinish });

    fireEvent.press(screen.getByTestId("controls-start"));
    fireEvent.press(screen.getByTestId("controls-pause"));
    fireEvent.press(screen.getByTestId("controls-resume"));
    fireEvent.press(screen.getByTestId("controls-lap"));
    fireEvent.press(screen.getByTestId("controls-finish"));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onLap).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
