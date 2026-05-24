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
    isOnRoute: true,
    isGpsRecordingEnabled: () => false,
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

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  Bike: createHost("Bike"),
  CalendarDays: createHost("CalendarDays"),
  ChevronLeft: createHost("ChevronLeft"),
  ChevronRight: createHost("ChevronRight"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  Gauge: createHost("Gauge"),
  MapPin: createHost("MapPin"),
  Minus: createHost("Minus"),
  Minimize2: createHost("Minimize2"),
  Navigation: createHost("Navigation"),
  Plus: createHost("Plus"),
  RotateCcw: createHost("RotateCcw"),
  Route: createHost("Route"),
  SlidersHorizontal: createHost("SlidersHorizontal"),
  Trash2: createHost("Trash2"),
  Waves: createHost("Waves"),
  Watch: createHost("Watch"),
  Zap: createHost("Zap"),
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
  useActivityRecorderLiveData: () => ({
    current: { power: 245, heartRate: 144, cadence: 88, speed: 3.2 },
    plan: {
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
    },
    stats: {
      duration: 75,
      distance: 1200,
      normalizedPower: 241,
      trainingStressScore: 12,
      intensityFactor: 0.83,
      currentHeartRateZone: 2,
      currentPowerZone: 3,
      currentGrade: 4.2,
      gradeAdjustedPaceSecondsPerKm: 315,
      verticalSpeedMetersPerHour: 640,
    },
  }),
  useCurrentReadings: () => ({ power: 245, heartRate: 144, cadence: 88, speed: 3.2 }),
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
  useSessionStats: () => ({
    duration: 75,
    distance: 1200,
    normalizedPower: 241,
    trainingStressScore: 12,
    intensityFactor: 0.83,
    currentHeartRateZone: 2,
    currentPowerZone: 3,
    currentGrade: 4.2,
    gradeAdjustedPaceSecondsPerKm: 315,
    verticalSpeedMetersPerHour: 640,
  }),
}));

const { RecordingBackdrop } = require("../RecordingBackdrop");
const { RecordingControlSheet } = require("../RecordingControlSheet");
const { RecordingFloatingPanel } = require("../RecordingFloatingPanel");
const { TrainerInsightCard } = require("../cards/TrainerInsightCard");

describe("recording cockpit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLastKnownLocationMock.mockResolvedValue(null);
  });

  it("renders a route elevation profile in the carousel without subscribing to GPS", () => {
    const result = renderNative(
      <>
        <RecordingBackdrop
          recordingState="pending"
          service={buildService()}
          sessionContract={buildContract({
            guidance: { hasRoute: true, hasRouteGeometry: true, routeMode: "virtual" },
            ui: { backdropMode: "ambient" },
          })}
        />
        <RecordingFloatingPanel
          bottomObstructionHeight={80}
          hasPlan={false}
          sensorCount={2}
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
            ui: {
              floatingPanel: {
                defaultCard: "route_progress",
                availableCards: ["route_progress", "metrics"],
                forcedExpanded: true,
                canMinimize: false,
              },
            },
          })}
        />
      </>,
    );

    expect(screen.queryByTestId("route-elevation-backdrop")).toBeNull();
    expect(screen.getByTestId("route-progress-insight-card")).toBeTruthy();
    expect(screen.getByTestId("route-profile-card-content")).toBeTruthy();
    expect(screen.getByTestId("route-elevation-chart")).toBeTruthy();
    expect(screen.getByTestId("route-profile-current-dot")).toBeTruthy();
    expect(screen.queryByTestId("route-profile-grade-cue")).toBeNull();
    expect(screen.getByText("Route profile")).toBeTruthy();
    expect(screen.getByText("3.0 km / 6.0 km")).toBeTruthy();
    expect(screen.getAllByText("+4.2%").length).toBeGreaterThan(0);
    expect(screen.queryByText("50% complete")).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
    expect(result.UNSAFE_queryByType("MapView" as any)).toBeNull();
    expect(result.UNSAFE_queryByType("Polyline" as any)).toBeNull();
    expect(addCallbackMock).not.toHaveBeenCalled();
  });

  it("clamps route progress after the route is complete", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
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
          ui: {
            floatingPanel: {
              defaultCard: "route_progress",
              availableCards: ["route_progress", "metrics"],
              forcedExpanded: true,
              canMinimize: false,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("route-profile-current-dot")).toBeTruthy();
    expect(screen.getByText("6.0 km / 6.0 km")).toBeTruthy();
    expect(screen.getAllByText("-1.8%").length).toBeGreaterThan(0);
    expect(screen.queryByText("120% complete")).toBeNull();
  });

  it("renders distance progress fallback when route elevation is unavailable", () => {
    const result = renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
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
          ui: {
            floatingPanel: {
              defaultCard: "route_progress",
              availableCards: ["route_progress", "metrics"],
              forcedExpanded: true,
              canMinimize: false,
            },
          },
        })}
      />,
    );

    expect(screen.getByTestId("route-distance-fallback")).toBeTruthy();
    expect(screen.getByTestId("route-distance-current-dot")).toBeTruthy();
    expect(screen.getByText("Route distance")).toBeTruthy();
    expect(screen.getByText("2.5 km / 10.0 km")).toBeTruthy();
    expect(screen.queryByText("Done")).toBeNull();
    expect(result.UNSAFE_queryByType("MapView" as any)).toBeNull();
  });

  it("previews route elevation without a progress marker when GPS is off course", () => {
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan={false}
        sensorCount={2}
        service={buildService({
          currentRoute: {
            elevation_profile: [
              { distance: 0, elevation: 150 },
              { distance: 3000, elevation: 360 },
              { distance: 6000, elevation: 260 },
            ],
          },
          currentRouteDistance: 3000,
          currentRouteGrade: 4.2,
          isGpsRecordingEnabled: () => true,
          isOnRoute: false,
          routeDistance: 6000,
          routeProgress: 50,
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

    expect(screen.getByTestId("route-elevation-chart")).toBeTruthy();
    expect(screen.queryByTestId("route-profile-current-dot")).toBeNull();
    expect(screen.getAllByText("Distance").length).toBeGreaterThan(0);
    expect(screen.getByText("Remaining")).toBeTruthy();
    expect(screen.getByText("Grade")).toBeTruthy();
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(3);
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

  it("renders live activity and metric context in the floating panel", () => {
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
    expect(screen.getAllByText("Tempo block").length).toBeGreaterThan(0);
    expect(screen.getByText("10m @ 220W")).toBeTruthy();
    expect(screen.getByLabelText("Previous interval")).toBeTruthy();
    expect(screen.getByLabelText("Skip interval")).toBeTruthy();
    expect(screen.getByTestId("activity-plan-interval-progress-bar")).toBeTruthy();
    expect(screen.getAllByText("245").length).toBeGreaterThan(0);
    expect(screen.getAllByText("W").length).toBeGreaterThan(0);
    expect(screen.getByText("HR Zone")).toBeTruthy();
    expect(screen.getByText("Z2")).toBeTruthy();
    expect(screen.getByText("Power Zone")).toBeTruthy();
    expect(screen.getByText("Z3")).toBeTruthy();
    expect(screen.getByTestId("trainer-insight-card")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Previous interval"));
    fireEvent.press(screen.getByLabelText("Skip interval"));

    expect(mockPlanPrevious).toHaveBeenCalledTimes(1);
    expect(mockPlanSkip).toHaveBeenCalledTimes(1);

    expect(screen.getAllByLabelText("Expand recording cards").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Minimize recording cards")).toBeNull();
  });

  it("shows every metric cell in the expanded metrics card", () => {
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
              defaultCard: "metrics",
              availableCards: ["metrics"],
              forcedExpanded: true,
              canMinimize: false,
            },
          },
        })}
      />,
    );

    expect(screen.getByText("Time")).toBeTruthy();
    expect(screen.getByText("Distance")).toBeTruthy();
    expect(screen.getByText("HR")).toBeTruthy();
    expect(screen.getByText("HR Zone")).toBeTruthy();
    expect(screen.getByText("Power")).toBeTruthy();
    expect(screen.getByText("Power Zone")).toBeTruthy();
    expect(screen.getByText("GAP")).toBeTruthy();
    expect(screen.getByText("NP")).toBeTruthy();
    expect(screen.getByText("TSS")).toBeTruthy();
    expect(screen.getByText("IF")).toBeTruthy();
    expect(screen.getByText("Grade")).toBeTruthy();
    expect(screen.getByText("VAM")).toBeTruthy();
    expect(screen.getAllByText("Z2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Z3").length).toBeGreaterThan(0);
    expect(screen.getByText("5:15")).toBeTruthy();
    expect(screen.getByText("Avg Power")).toBeTruthy();
    expect(screen.getByText("Avg Speed")).toBeTruthy();
    expect(screen.getByText("Target 220 W")).toBeTruthy();
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("recording-card-page-indicator")).toBeNull();
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
    expect(screen.getByLabelText("Skip interval")).toBeTruthy();

    fireEvent.press(screen.getByLabelText("Minimize recording cards"));

    expect(screen.queryByLabelText("Minimize recording cards")).toBeNull();
    expect(screen.getByTestId("recording-card-workout_interval-surface")).toBeTruthy();
  });

  it("renders route progress cards when route context is attached", () => {
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
    expect(screen.getByTestId("route-progress-insight-card")).toBeTruthy();
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

    expect(screen.getAllByText("Tempo block").length).toBeGreaterThan(0);
    expect(screen.getByTestId("metrics-insight-card")).toBeTruthy();
    expect(screen.getByText("Auto Target")).toBeTruthy();
    expect(screen.getByText("88%")).toBeTruthy();
    expect(screen.getByTestId("route-progress-insight-card")).toBeTruthy();
  });

  it("does not re-notify expansion when live trainer updates rebuild parent callbacks", () => {
    const firstExpandedChange = jest.fn();
    const secondExpandedChange = jest.fn();
    const result = renderNative(
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
        onExpandedChange={firstExpandedChange}
      />,
    );

    expect(firstExpandedChange).toHaveBeenCalledTimes(1);

    result.rerender(
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
        onExpandedChange={secondExpandedChange}
      />,
    );

    expect(secondExpandedChange).not.toHaveBeenCalled();
  });

  it("keeps trainer remote controls stable when BLE descriptors are rebuilt", () => {
    const service = {
      getSessionView: () => ({
        overrideState: { trainerMode: "manual" },
        trainer: {
          controlState: "controllable",
          dataFlowState: "flowing",
          recoveryState: "idle",
          lastCommandStatus: null,
          selectedMode: "erg",
          availableModes: [
            {
              id: "erg",
              label: "Target Power",
              enabled: true,
              range: { min: 80, max: 500, increment: 5, unit: "W" },
            },
            {
              id: "resistance",
              label: "Resistance",
              enabled: true,
              range: { min: 0, max: 100, increment: 5, unit: "%" },
            },
          ],
        },
      }),
      applyManualTrainerPower: jest.fn(async () => true),
      applyManualTrainerResistance: jest.fn(async () => true),
    };
    const props = {
      mode: "expanded",
      plan: { hasPlan: false, select: jest.fn(), clear: jest.fn() },
      readings: { power: 210 },
      sensorCount: 1,
      service,
      sessionContract: buildContract({ devices: { hasTrainer: true, trainerControllable: true } }),
      stats: {},
    };

    const result = renderNative(<TrainerInsightCard {...(props as any)} />);

    expect(screen.getByTestId("trainer-insight-card")).toBeTruthy();
    expect(screen.getAllByText("Power").length).toBeGreaterThan(0);

    result.rerender(<TrainerInsightCard {...(props as any)} />);

    expect(screen.getAllByText("Power").length).toBeGreaterThan(0);
  });

  it("centers expanded recording cards with interval momentum disabled", () => {
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
          ui: {
            floatingPanel: {
              defaultCard: "workout_interval",
              availableCards: ["workout_interval", "route_progress", "metrics"],
              forcedExpanded: true,
              canMinimize: false,
            },
          },
        })}
      />,
    );

    const carousel = screen.getByTestId("recording-card-carousel");

    expect(carousel.props.disableIntervalMomentum).toBe(true);
    expect(carousel.props.contentContainerStyle.paddingHorizontal).toBeGreaterThanOrEqual(28);
    expect(carousel.props.snapToInterval).toBeGreaterThan(
      screen.getByTestId("recording-card-workout_interval").props.style.width,
    );
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
    expect(screen.queryByTestId("activity-interval-insight-card")).toBeNull();
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
    expect(screen.getByTestId("route-progress-insight-card")).toBeTruthy();

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

    expect(screen.getByText("Activity")).toBeTruthy();
    expect(screen.getAllByText("Add")).toHaveLength(2);

    const disabledActions = result
      .UNSAFE_getAllByType("Pressable" as any)
      .filter((node: any) => node.props.accessibilityState?.disabled === true);

    expect(disabledActions).toHaveLength(3);
  });
});
