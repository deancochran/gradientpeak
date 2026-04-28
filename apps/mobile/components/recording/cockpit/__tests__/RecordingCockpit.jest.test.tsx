import React from "react";
import { createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const addCallbackMock = jest.fn();
const removeCallbackMock = jest.fn();
const getLastKnownLocationMock = jest.fn<Promise<any>, []>(async () => null);

const baseContract = {
  authority: {
    category: "user",
    structure: "none",
    spatial: "none",
    locationCapture: "gps",
    trainerExecution: "none",
  },
  guidance: {
    hasPlan: false,
    hasStructuredSteps: false,
    hasRoute: false,
    hasRouteGeometry: false,
    routeMode: "none",
  },
  devices: {
    hasTrainer: false,
    trainerControllable: false,
    hasPower: false,
    hasHeartRate: false,
    hasCadence: false,
    gpsIntent: "off",
    gpsAvailable: false,
  },
  degraded: {},
  editing: {
    canEditActivity: true,
    canEditPlan: true,
    canEditRoute: true,
    canEditGps: true,
    locksIdentityAfterStart: true,
  },
  metrics: { primaryMetric: "time", emphasizedMetrics: ["time"] },
  surfaces: {
    defaultPrimarySurface: "metrics",
    availablePrimarySurfaces: ["metrics"],
    quickActions: [],
  },
  validation: { consequences: [] },
};

const mockPlanPrevious = jest.fn();
const mockPlanSkip = jest.fn();

function buildContract(overrides: any = {}) {
  const uiOverrides = overrides.ui ?? {};

  return {
    ...baseContract,
    ...overrides,
    guidance: { ...baseContract.guidance, ...overrides.guidance },
    devices: { ...baseContract.devices, ...overrides.devices },
    editing: { ...baseContract.editing, ...overrides.editing },
    ui: {
      backdropMode: "ambient",
      ...uiOverrides,
      floatingPanel: {
        defaultCard: "metrics",
        availableCards: ["metrics"],
        forcedExpanded: true,
        canMinimize: false,
        ...uiOverrides.floatingPanel,
      },
      controls: {
        quickActions: ["gps", "plan", "route", "sensors"],
        ...uiOverrides.controls,
      },
    },
  };
}

function buildService(overrides: any = {}) {
  return {
    currentRoute: null,
    routeDistance: 0,
    currentRouteDistance: 0,
    routeProgress: 0,
    currentRouteGrade: 0,
    allSteps: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Warmup",
        duration: { type: "time", seconds: 300 },
        targets: [{ type: "%FTP", intensity: 55 }],
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        name: "Tempo block",
        duration: { type: "time", seconds: 600 },
        targets: [{ type: "%FTP", intensity: 88 }],
      },
    ],
    locationManager: {
      addCallback: addCallbackMock,
      removeCallback: removeCallbackMock,
      getLastKnownLocation: getLastKnownLocationMock,
    },
    getBaseFtp: () => 250,
    getBaseThresholdHr: () => 170,
    getSessionView: () => ({
      overrideState: { trainerMode: "auto", preferredSources: {}, intensityScale: 1 },
      runtimeSourceState: {
        degradedState: { isDegraded: false, metrics: [] },
      },
      trainer: {
        controlState: "controllable",
        dataFlowState: "flowing",
        recoveryState: "idle",
        lastCommandStatus: null,
      },
    }),
    ...overrides,
  };
}

jest.mock("react-native-maps", () => {
  const React = require("react");
  const MapView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ animateCamera: jest.fn() }));
    return React.createElement("MapView", props, props.children);
  });

  return {
    __esModule: true,
    default: MapView,
    Polyline: createHost("Polyline"),
    PROVIDER_DEFAULT: "default",
  };
});

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const BottomSheet = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      snapToIndex: (index: number) => props.onChange?.(index),
    }));

    return React.createElement("BottomSheet", props, props.children);
  });

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetView: createHost("BottomSheetView"),
  };
});

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Bike: createHost("Bike"),
  CalendarDays: createHost("CalendarDays"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  MapPin: createHost("MapPin"),
  Minimize2: createHost("Minimize2"),
  Route: createHost("Route"),
  Trash2: createHost("Trash2"),
  Waves: createHost("Waves"),
  Watch: createHost("Watch"),
}));

jest.mock("@shopify/react-native-skia", () => ({
  __esModule: true,
  Circle: createHost("Circle"),
  DashPathEffect: createHost("DashPathEffect"),
  Line: createHost("SkiaLine"),
  LinearGradient: createHost("LinearGradient"),
  useFont: () => ({}),
  vec: (x: number, y: number) => ({ x, y }),
}));

jest.mock("victory-native", () => ({
  __esModule: true,
  Area: createHost("Area"),
  CartesianChart: ({ children, data }: any) =>
    React.createElement(
      "CartesianChart",
      { data },
      children({
        points: { elevation: data },
        chartBounds: { bottom: 100, left: 0, right: 100, top: 0 },
      }),
    ),
  Line: createHost("Line"),
}));

jest.mock("@/assets/fonts/SpaceMono-Regular.ttf", () => ({
  __esModule: true,
  default: "mock-font",
}));

jest.mock("@/components/recording/footer", () => ({
  __esModule: true,
  RecordingControls: createHost("RecordingControls"),
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useCurrentReadings: () => ({ power: 245, heartRate: 144, cadence: 88 }),
  usePlan: () => ({
    hasPlan: true,
    currentStep: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "Tempo block",
      duration: { type: "time", seconds: 600 },
      targets: [{ type: "%FTP", intensity: 88 }],
    },
    stepIndex: 1,
    stepCount: 2,
    progress: {
      movingTime: 120000,
      duration: 600000,
      progress: 0.2,
      requiresManualAdvance: false,
      canAdvance: false,
    },
    canGoBack: true,
    canSkip: true,
    previous: mockPlanPrevious,
    skip: mockPlanSkip,
  }),
  useSessionStats: () => ({ duration: 75, distance: 1200 }),
}));

const { RecordingBackdrop } = require("../RecordingBackdrop");
const { RecordingControlSheet } = require("../RecordingControlSheet");
const { RecordingFloatingPanel } = require("../RecordingFloatingPanel");

describe("recording cockpit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLastKnownLocationMock.mockResolvedValue(null);
  });

  it("renders an indoor route profile without subscribing to GPS for virtual routes", () => {
    const result = renderNative(
      <RecordingBackdrop
        recordingState="pending"
        service={buildService({
          currentRoute: {
            coordinates: [
              { latitude: 40.1, longitude: -105.1 },
              { latitude: 40.2, longitude: -105.2 },
            ],
            elevation_profile: [
              { distance: 0, elevation: 150 },
              { distance: 3000, elevation: 360 },
              { distance: 6000, elevation: 260 },
            ],
          },
          currentRouteDistance: 3000,
          currentRouteGrade: 4.2,
          routeDistance: 6000,
          routeProgress: 50,
        })}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
          ui: { backdropMode: "virtual_route" },
        })}
      />,
    );

    expect(screen.getByTestId("route-elevation-backdrop")).toBeTruthy();
    expect(screen.getByTestId("route-profile-stage")).toBeTruthy();
    expect(screen.getByTestId("route-elevation-chart")).toBeTruthy();
    expect(screen.getByTestId("route-profile-current-dot")).toBeTruthy();
    expect(screen.getByTestId("route-profile-grade-cue")).toBeTruthy();
    expect(screen.getByText("Indoor route")).toBeTruthy();
    expect(screen.getByText("3.0 km / 6.0 km")).toBeTruthy();
    expect(screen.getByText("+4.2%")).toBeTruthy();
    expect(screen.queryByText("50% complete")).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText("Remaining")).toBeNull();
    expect(screen.queryByText("Route")).toBeNull();
    expect(result.UNSAFE_queryByType("MapView" as any)).toBeNull();
    expect(result.UNSAFE_queryByType("Polyline" as any)).toBeNull();
    expect(addCallbackMock).not.toHaveBeenCalled();
  });

  it("clamps virtual route progress after the route is complete", () => {
    renderNative(
      <RecordingBackdrop
        recordingState="recording"
        service={buildService({
          currentRoute: {
            elevation_profile: [
              { distance: 0, elevation: 150 },
              { distance: 6000, elevation: 260 },
            ],
          },
          currentRouteDistance: 7200,
          currentRouteGrade: -1.8,
          routeDistance: 6000,
          routeProgress: 120,
        })}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
          ui: { backdropMode: "virtual_route" },
        })}
      />,
    );

    expect(screen.getByTestId("route-profile-current-dot")).toBeTruthy();
    expect(screen.getByText("6.0 km / 6.0 km")).toBeTruthy();
    expect(screen.getByText("-1.8%")).toBeTruthy();
    expect(screen.queryByText("120% complete")).toBeNull();
  });

  it("renders distance progress fallback when virtual route elevation is unavailable", () => {
    const result = renderNative(
      <RecordingBackdrop
        recordingState="pending"
        service={buildService({
          currentRoute: {
            coordinates: [
              { latitude: 40.1, longitude: -105.1 },
              { latitude: 40.2, longitude: -105.2 },
            ],
          },
          currentRouteDistance: 2500,
          routeDistance: 10000,
          routeProgress: 25,
        })}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
          ui: { backdropMode: "virtual_route" },
        })}
      />,
    );

    expect(screen.getByTestId("route-distance-fallback")).toBeTruthy();
    expect(screen.getByTestId("route-distance-current-dot")).toBeTruthy();
    expect(screen.getByText("Distance route")).toBeTruthy();
    expect(screen.getByText("2.5 km / 10.0 km")).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
    expect(screen.queryByText("Remaining")).toBeNull();
    expect(screen.queryByText("Route")).toBeNull();
    expect(result.UNSAFE_queryByType("MapView" as any)).toBeNull();
  });

  it("does not show a fake map when GPS mode has no live location yet", () => {
    const result = renderNative(
      <RecordingBackdrop
        recordingState="pending"
        service={buildService()}
        sessionContract={buildContract({ ui: { backdropMode: "gps_map" } })}
      />,
    );

    expect(result.UNSAFE_queryByType("MapView" as any)).toBeNull();
    expect(screen.queryByText("GPS map")).toBeNull();
    expect(screen.getByTestId("recording-map-pending-backdrop")).toBeTruthy();
    expect(screen.getByText("Acquiring GPS")).toBeTruthy();
    expect(addCallbackMock).toHaveBeenCalledTimes(1);
  });

  it("uses a valid last-known location to render the GPS map immediately", async () => {
    getLastKnownLocationMock.mockResolvedValueOnce({
      coords: { latitude: 39.75, longitude: -104.99 },
      timestamp: Date.now(),
    });

    const result = renderNative(
      <RecordingBackdrop
        recordingState="pending"
        service={buildService()}
        sessionContract={buildContract({ ui: { backdropMode: "gps_map" } })}
      />,
    );

    await waitFor(() => {
      expect(result.UNSAFE_queryByType("MapView" as any)).toBeTruthy();
    });

    expect(screen.queryByTestId("recording-map-pending-backdrop")).toBeNull();
  });

  it("renders route unavailable copy without a map when route geometry is missing", () => {
    const result = renderNative(
      <RecordingBackdrop
        recordingState="pending"
        service={buildService()}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: false, routeMode: "unavailable" },
          ui: { backdropMode: "route_unavailable" },
        })}
      />,
    );

    expect(result.UNSAFE_queryByType("MapView" as any)).toBeNull();
    expect(screen.getByText("Route unavailable")).toBeTruthy();
    expect(
      screen.getByText("The route is attached, but there is no map geometry to preview."),
    ).toBeTruthy();
  });

  it("renders live workout and metric context in the floating panel", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan
        sensorCount={2}
        service={buildService()}
        sessionContract={buildContract({
          guidance: { hasPlan: true, hasStructuredSteps: true },
          devices: { hasTrainer: true, trainerControllable: true },
          ui: {
            floatingPanel: {
              defaultCard: "workout_interval",
              availableCards: ["workout_interval", "metrics", "trainer"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("recording-card-carousel")).toBeTruthy();
    expect(screen.getByText("Tempo block")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-intensity-chart")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-current-interval")).toBeTruthy();
    expect(screen.getByText("Back")).toBeTruthy();
    expect(screen.getByText("Skip")).toBeTruthy();
    expect(screen.getAllByText("245 W").length).toBeGreaterThan(0);
    expect(screen.getByTestId("trainer-insight-card")).toBeTruthy();

    fireEvent.press(screen.getByText("Back"));
    fireEvent.press(screen.getByText("Skip"));

    expect(mockPlanPrevious).toHaveBeenCalledTimes(1);
    expect(mockPlanSkip).toHaveBeenCalledTimes(1);

    expect(screen.getAllByLabelText("Expand recording cards").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Minimize recording cards")).toBeNull();
  });

  it("expands the floating panel when the card surface is pressed and minimizes from the corner", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan
        sensorCount={2}
        service={buildService()}
        sessionContract={buildContract({
          guidance: { hasPlan: true, hasStructuredSteps: true },
          ui: {
            floatingPanel: {
              defaultCard: "workout_interval",
              availableCards: ["workout_interval", "metrics"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.queryByLabelText("Minimize recording cards")).toBeNull();

    fireEvent.press(screen.getByTestId("recording-card-workout_interval-surface"));

    expect(screen.getByLabelText("Minimize recording cards")).toBeTruthy();
    expect(screen.getByText("Skip interval")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Minimize recording cards"));

    expect(screen.queryByLabelText("Minimize recording cards")).toBeNull();
    expect(screen.getByTestId("recording-card-workout_interval-surface")).toBeTruthy();
  });

  it("hides route progress cards when route context is already on the backdrop", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
        service={buildService({
          routeDistance: 10000,
          currentRouteDistance: 3750,
          routeProgress: 37.5,
        })}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
          ui: {
            floatingPanel: {
              defaultCard: "route_progress",
              availableCards: ["route_progress", "metrics"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.queryByTestId("route-progress-insight-card")).toBeNull();
  });

  it("renders a stable plan metrics trainer carousel with optional route cards", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan
        sensorCount={2}
        service={buildService({
          routeDistance: 10000,
          currentRouteDistance: 3750,
          routeProgress: 37.5,
        })}
        sessionContract={buildContract({
          guidance: {
            hasPlan: true,
            hasStructuredSteps: true,
            hasRoute: true,
            hasRouteGeometry: true,
            routeMode: "virtual",
          },
          devices: { hasTrainer: true, trainerControllable: true },
          ui: {
            floatingPanel: {
              defaultCard: "workout_interval",
              availableCards: ["workout_interval", "route_progress", "metrics", "trainer"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Tempo block")).toBeTruthy();
    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.getByText("Auto control follows 88% FTP.")).toBeTruthy();
    expect(screen.queryByTestId("route-progress-insight-card")).toBeNull();
  });

  it("hides unavailable plan and trainer cards from the carousel", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={0}
        service={buildService()}
        sessionContract={buildContract({
          guidance: { hasPlan: false, hasStructuredSteps: false },
          devices: { hasTrainer: false, trainerControllable: false },
          ui: {
            floatingPanel: {
              defaultCard: "workout_interval",
              availableCards: ["workout_interval", "trainer", "metrics"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("recording-card-carousel")).toBeTruthy();
    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.queryByTestId("workout-interval-insight-card")).toBeNull();
    expect(screen.queryByTestId("trainer-insight-card")).toBeNull();
  });

  it("hides data-only trainer and route-without-geometry cards from the carousel", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={1}
        service={buildService({ routeDistance: 10000, routeProgress: 20 })}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: false, routeMode: "unavailable" },
          devices: { hasTrainer: true, trainerControllable: false },
          ui: {
            floatingPanel: {
              defaultCard: "route_progress",
              availableCards: ["route_progress", "trainer", "metrics"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.queryByTestId("route-progress-insight-card")).toBeNull();
    expect(screen.queryByTestId("trainer-insight-card")).toBeNull();
  });

  it("forces expanded metrics when no route is attached and GPS is off", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={0}
        service={buildService()}
        sessionContract={buildContract({
          devices: { gpsIntent: "off", gpsAvailable: false },
          guidance: { hasRoute: false, hasRouteGeometry: false, routeMode: "none" },
          ui: {
            backdropMode: "ambient",
            floatingPanel: {
              defaultCard: "metrics",
              availableCards: ["metrics"],
              forcedExpanded: true,
              canMinimize: false,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.queryByText("Compact")).toBeNull();
    expect(screen.queryByText("Expand")).toBeNull();
  });

  it("resets selected contextual card to metrics when route capability disappears", () => {
    const routeService = buildService({
      routeDistance: 10000,
      currentRouteDistance: 3750,
      routeProgress: 37.5,
    });
    const result = renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
        service={routeService}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
          ui: {
            floatingPanel: {
              defaultCard: "route_progress",
              availableCards: ["route_progress", "metrics"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.queryByTestId("route-progress-insight-card")).toBeNull();

    result.rerender(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
        service={buildService()}
        sessionContract={buildContract({
          guidance: { hasRoute: false, hasRouteGeometry: false, routeMode: "none" },
          ui: {
            floatingPanel: {
              defaultCard: "metrics",
              availableCards: ["metrics"],
              forcedExpanded: true,
              canMinimize: false,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.queryByTestId("route-progress-insight-card")).toBeNull();
  });

  it("renders current climb values from the recorder service", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
        service={buildService({
          currentRoute: {
            elevation_profile: [
              { distance: 0, elevation: 100 },
              { distance: 8000, elevation: 440 },
            ],
          },
          routeDistance: 8000,
          currentRouteDistance: 2000,
          currentRouteGrade: 4.25,
        })}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
          ui: {
            floatingPanel: {
              defaultCard: "climb",
              availableCards: ["climb", "metrics"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByText("+4.3%")).toBeTruthy();
    expect(screen.getByText("Climbing")).toBeTruthy();
    expect(screen.getByText("6.0 km")).toBeTruthy();
  });

  it("hides climb cards when route elevation data is unavailable", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
        service={buildService({
          routeDistance: 8000,
          currentRouteDistance: 2000,
          currentRouteGrade: 4.25,
        })}
        sessionContract={buildContract({
          guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
          ui: {
            floatingPanel: {
              defaultCard: "climb",
              availableCards: ["climb", "metrics"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.queryByTestId("climb-insight-card")).toBeNull();
  });

  it("disables locked secondary actions in the control sheet", () => {
    const result = renderNative(
      <RecordingControlSheet
        activityCategory="bike"
        gpsRecordingEnabled={false}
        onGpsPress={jest.fn()}
        onOpenActivity={jest.fn()}
        onOpenFtms={jest.fn()}
        onOpenPlan={jest.fn()}
        onOpenRoute={jest.fn()}
        onOpenSensors={jest.fn()}
        onRemovePlan={jest.fn()}
        onRemoveRoute={jest.fn()}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onLap={jest.fn()}
        onFinish={jest.fn()}
        recordingState="not_started"
        sensorCount={0}
        sessionContract={buildContract({
          editing: { canEditGps: false, canEditPlan: false, canEditRoute: false },
          ui: { controls: { quickActions: ["gps", "plan", "route", "sensors"] } },
        })}
      />,
    );

    expect(screen.getByTestId("recording-activity-control-button")).toBeTruthy();
    expect(screen.getByTestId("recording-setup-action-rail")).toBeTruthy();
    expect(screen.getByTestId("recording-gps-toggle")).toBeTruthy();
    expect(screen.getByText("GPS")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    expect(screen.queryByTestId("recording-session-mode-button")).toBeNull();
    expect(screen.queryByText("Guidance")).toBeNull();

    expect(screen.getByText("Workout")).toBeTruthy();
    expect(screen.getAllByText("Add")).toHaveLength(2);

    const disabledActions = result
      .UNSAFE_getAllByType("Pressable" as any)
      .filter((node: any) => node.props.accessibilityState?.disabled === true);

    expect(disabledActions).toHaveLength(3);
  });
});
