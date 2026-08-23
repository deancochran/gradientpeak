import type React from "react";
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

type RecordingControlsMockProps = {
  onStart?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onLap?: () => void;
  onFinish?: () => void;
};

jest.mock("@/components/recording/footer", () => ({
  __esModule: true,
  RecordingControls: ({
    onStart,
    onPause,
    onResume,
    onLap,
    onFinish,
  }: RecordingControlsMockProps) => (
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
    locationCapture: "none",
    trainerExecution: "trainer",
  },
  guidance: {
    hasPlan: true,
    hasStructuredSteps: true,
    hasRoute: true,
    routeMode: "virtual",
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
    canEditGps: false,
    locksIdentityAfterStart: true,
  },
  metrics: {
    primaryMetric: "distance",
    emphasizedMetrics: ["distance", "power"],
  },
  surfaces: {
    defaultPrimarySurface: "route",
    availablePrimarySurfaces: ["route", "activity", "trainer", "metrics"],
    quickActions: ["activity", "plan", "route", "trainer", "sensors"],
  },
  validation: {
    consequences: [],
  },
};

async function renderDock(overrides: Partial<React.ComponentProps<typeof RecordControlDock>> = {}) {
  return await renderNative(
    <RecordControlDock
      activeSurface="route"
      onChangeSurface={jest.fn()}
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
  it("renders contract quick actions and routes presses to the matching handlers", async () => {
    const onOpenActivity = jest.fn();
    const onOpenPlan = jest.fn();
    const onOpenRoute = jest.fn();
    const onOpenFtms = jest.fn();
    const onOpenSensors = jest.fn();

    await renderDock({
      onOpenActivity,
      onOpenPlan,
      onOpenRoute,
      onOpenFtms,
      onOpenSensors,
    });

    await fireEvent.press(screen.getByTestId("record-dock-quick-action-activity"));
    await fireEvent.press(screen.getByTestId("record-dock-quick-action-plan"));
    await fireEvent.press(screen.getByTestId("record-dock-quick-action-route"));
    await fireEvent.press(screen.getByTestId("record-dock-quick-action-trainer"));
    await fireEvent.press(screen.getByTestId("record-dock-quick-action-sensors"));

    expect(onOpenActivity).toHaveBeenCalledTimes(1);
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    expect(onOpenRoute).toHaveBeenCalledTimes(1);
    expect(onOpenFtms).toHaveBeenCalledTimes(1);
    expect(onOpenSensors).toHaveBeenCalledTimes(1);
  });

  it("switches available primary surfaces from the dock", async () => {
    const onChangeSurface = jest.fn();

    await renderDock({ onChangeSurface });

    await fireEvent.press(screen.getByTestId("record-dock-surface-activity"));
    await fireEvent.press(screen.getByTestId("record-dock-surface-metrics"));

    expect(onChangeSurface).toHaveBeenNthCalledWith(1, "activity");
    expect(onChangeSurface).toHaveBeenNthCalledWith(2, "metrics");
  });

  it("exposes descriptive, touch-friendly accessible dock controls", async () => {
    await renderDock();

    const activity = screen.getByTestId("record-dock-quick-action-activity");
    const route = screen.getByTestId("record-dock-surface-route");
    const metrics = screen.getByTestId("record-dock-surface-metrics");

    expect(activity.props).toMatchObject({
      accessibilityLabel: "View locked activity settings",
      accessibilityRole: "button",
    });
    expect(screen.queryByTestId("record-dock-quick-action-gps")).toBeNull();
    expect(activity.props.className).toContain("h-11");
    expect(activity.props.className).toContain("active:opacity-80");
    expect(route.props).toMatchObject({
      accessibilityHint: "Currently selected",
      accessibilityLabel: "Show route recording surface",
      accessibilityRole: "button",
      accessibilityState: { selected: true },
    });
    expect(metrics.props).toMatchObject({
      accessibilityHint: "Switches the recording view",
      accessibilityLabel: "Show metrics recording surface",
      accessibilityRole: "button",
      accessibilityState: { selected: false },
    });
    expect(route.props.className).toContain("min-h-11");
    expect(route.props.className).toContain("min-w-11");
    expect(route.props.className).toContain("active:opacity-80");
  });

  it("forwards primary recording control actions", async () => {
    const onStart = jest.fn();
    const onPause = jest.fn();
    const onResume = jest.fn();
    const onLap = jest.fn();
    const onFinish = jest.fn();

    await renderDock({ onStart, onPause, onResume, onLap, onFinish });

    await fireEvent.press(screen.getByTestId("controls-start"));
    await fireEvent.press(screen.getByTestId("controls-pause"));
    await fireEvent.press(screen.getByTestId("controls-resume"));
    await fireEvent.press(screen.getByTestId("controls-lap"));
    await fireEvent.press(screen.getByTestId("controls-finish"));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onLap).toHaveBeenCalledTimes(1);
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});
