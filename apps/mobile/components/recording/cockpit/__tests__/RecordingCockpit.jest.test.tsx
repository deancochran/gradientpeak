import type { RecordingSessionContract } from "@repo/core";
import { THEME } from "@repo/tailwindcss/native";
import React, { type ComponentProps } from "react";
import type { ReactTestInstance } from "react-test-renderer";
import { ActivityRecorderService } from "@/lib/services/ActivityRecorder";
import { createHost, type HostProps } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";
import type { TrainerInsightCard as TrainerInsightCardComponent } from "../cards/TrainerInsightCard";

jest.mock("@/lib/services/ActivityRecorder", () => ({
  __esModule: true,
  ActivityRecorderService: class ActivityRecorderService {},
}));

const addCallbackMock = jest.fn();
const removeCallbackMock = jest.fn();
const getLastKnownLocationMock = jest.fn<Promise<unknown>, []>(async () => null);

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
} satisfies Omit<RecordingSessionContract, "ui">;

const mockPlanPrevious = jest.fn();
const mockPlanSkip = jest.fn();
const mockPlanAdvance = jest.fn();
let mockManualAdvance = false;

type DeepPartial<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [Key in keyof T]?: DeepPartial<T[Key]> }
    : T;

function buildContract(
  overrides: DeepPartial<RecordingSessionContract> = {},
): RecordingSessionContract {
  const uiOverrides = overrides.ui ?? {};

  return {
    ...baseContract,
    ...overrides,
    authority: { ...baseContract.authority, ...overrides.authority },
    guidance: { ...baseContract.guidance, ...overrides.guidance },
    devices: { ...baseContract.devices, ...overrides.devices },
    editing: { ...baseContract.editing, ...overrides.editing },
    metrics: { ...baseContract.metrics, ...overrides.metrics },
    surfaces: { ...baseContract.surfaces, ...overrides.surfaces },
    validation: { ...baseContract.validation, ...overrides.validation },
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
  } satisfies RecordingSessionContract;
}

type RecordingServiceOverrides = Omit<Partial<ActivityRecorderService>, "currentRoute"> & {
  currentRoute?: Partial<NonNullable<ActivityRecorderService["currentRoute"]>> | null;
};

function buildService(overrides: RecordingServiceOverrides = {}): ActivityRecorderService {
  const service: ActivityRecorderService = Object.create(ActivityRecorderService.prototype);
  const { currentRoute, ...serviceOverrides } = overrides;
  Object.assign(service, {
    currentRoute:
      currentRoute === undefined || currentRoute === null
        ? null
        : { id: "route-1", name: "Test route", coordinates: [], ...currentRoute },
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
    ...serviceOverrides,
  });
  return service;
}

jest.mock("react-native-maps", () => {
  const React = require("react");
  const MapView = React.forwardRef((props: HostProps, ref: React.ForwardedRef<unknown>) => {
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

jest.mock("@/lib/stores/theme-store", () => ({
  __esModule: true,
  useTheme: () => ({ resolvedTheme: "light" }),
}));

jest.mock("@gorhom/bottom-sheet", () => {
  const React = require("react");
  const BottomSheet = React.forwardRef(
    (
      props: HostProps & { onChange?: (index: number) => void },
      ref: React.ForwardedRef<unknown>,
    ) => {
      React.useImperativeHandle(ref, () => ({
        snapToIndex: (index: number) => props.onChange?.(index),
      }));

      return React.createElement("BottomSheet", props, props.children);
    },
  );

  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetScrollView: createHost("BottomSheetScrollView"),
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
  CartesianChart: ({
    children,
    data,
  }: {
    children: (context: {
      points: { elevation: unknown[] };
      chartBounds: HostProps;
    }) => React.ReactNode;
    data: unknown[];
  }) =>
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
        occurrenceId: "activity:segment-1:interval-1:0:step-1",
        globalOrdinal: 1,
        segmentId: "00000000-0000-4000-8000-000000000010",
        segmentIndex: 0,
        role: "activity",
        category: "bike",
        intervalId: "00000000-0000-4000-8000-000000000011",
        intervalIndex: 0,
        stepId: "00000000-0000-4000-8000-000000000002",
        stepIndex: 1,
        repeatIteration: 0,
        completionPolicy: "time",
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
        requiresManualAdvance: mockManualAdvance,
        canAutoAdvance: false,
        canManualAdvance: mockManualAdvance,
        canAdvance: mockManualAdvance,
      },
      canGoBack: true,
      canSkip: !mockManualAdvance,
      previous: mockPlanPrevious,
      skip: mockPlanSkip,
      advance: mockPlanAdvance,
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
      occurrenceId: "activity:segment-1:interval-1:0:step-1",
      globalOrdinal: 1,
      segmentId: "00000000-0000-4000-8000-000000000010",
      segmentIndex: 0,
      role: "activity",
      category: "bike",
      intervalId: "00000000-0000-4000-8000-000000000011",
      intervalIndex: 0,
      stepId: "00000000-0000-4000-8000-000000000002",
      stepIndex: 1,
      repeatIteration: 0,
      completionPolicy: "time",
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
      requiresManualAdvance: mockManualAdvance,
      canAutoAdvance: false,
      canManualAdvance: mockManualAdvance,
      canAdvance: mockManualAdvance,
    },
    canGoBack: true,
    canSkip: !mockManualAdvance,
    previous: mockPlanPrevious,
    skip: mockPlanSkip,
    advance: mockPlanAdvance,
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

function findHostNodes(rendered: ReturnType<typeof renderNative>, type: string) {
  return rendered.UNSAFE_root.findAll((node: ReactTestInstance) => node.type === type);
}

function buildSessionStats(): ComponentProps<typeof TrainerInsightCardComponent>["stats"] {
  return {
    duration: 0,
    movingTime: 0,
    pausedTime: 0,
    distance: 0,
    calories: 0,
    work: 0,
    ascent: 0,
    descent: 0,
    avgHeartRate: 0,
    avgPower: 0,
    avgSpeed: 0,
    avgCadence: 0,
    maxHeartRate: 0,
    maxPower: 0,
    maxSpeed: 0,
    maxCadence: 0,
    hrZones: [0, 0, 0, 0, 0],
    powerZones: [0, 0, 0, 0, 0, 0, 0],
  };
}

describe("recording cockpit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockManualAdvance = false;
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
    expect(findHostNodes(result, "MapView")[0] ?? null).toBeNull();
    expect(findHostNodes(result, "Polyline")[0] ?? null).toBeNull();
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
    expect(findHostNodes(result, "MapView")[0] ?? null).toBeNull();
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

    expect(findHostNodes(result, "MapView")[0] ?? null).toBeNull();
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
      expect(findHostNodes(result, "MapView")[0] ?? null).toBeTruthy();
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

    expect(findHostNodes(result, "MapView")[0] ?? null).toBeNull();
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
    expect(screen.getByText("PWR 245W")).toBeTruthy();
    expect(screen.getByLabelText("Previous interval")).toBeTruthy();
    expect(screen.getByLabelText("Skip interval")).toBeTruthy();
    expect(screen.getByLabelText("Previous interval").props).toMatchObject({
      accessibilityHint: "Moves to the previous interval.",
      accessibilityState: { disabled: false },
      style: { height: 44 },
    });
    expect(screen.getByLabelText("Skip interval").props).toMatchObject({
      accessibilityHint: "Skips the current interval and moves to the next interval.",
      accessibilityState: { disabled: false },
      style: { height: 44 },
    });
    expect(screen.getByLabelText("Skip interval").props.className).toContain("active:opacity-80");
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

  it("uses the normal advance action for a manual completion occurrence", () => {
    mockManualAdvance = true;
    renderNative(
      <RecordingFloatingPanel
        bottomObstructionHeight={80}
        hasPlan
        sensorCount={0}
        service={buildService()}
        sessionContract={buildContract({
          guidance: { hasPlan: true, hasStructuredSteps: true },
          ui: {
            floatingPanel: {
              defaultCard: "workout_interval",
              availableCards: ["workout_interval"],
              forcedExpanded: false,
              canMinimize: true,
            },
          },
        })}
      />,
    );

    const advance = screen.getByLabelText("Advance interval");
    expect(advance.props.accessibilityState).toEqual({ disabled: false });
    expect(screen.queryByLabelText("Skip interval")).toBeNull();
    fireEvent.press(advance);
    expect(mockPlanAdvance).toHaveBeenCalledTimes(1);
    expect(mockPlanSkip).not.toHaveBeenCalled();
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

  it("exposes accessible 44-point panel controls with expansion state and pressed feedback", () => {
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

    const expandSurface = screen.getByTestId("recording-card-workout_interval-surface");

    expect(expandSurface.props.accessibilityHint).toBe("Shows the full recording cards view");
    expect(expandSurface.props.accessibilityState).toEqual({ expanded: false });
    expect(expandSurface.props.className).toContain("active:opacity-80");

    fireEvent.press(expandSurface);

    const minimizeButton = screen.getByTestId("recording-card-minimize-button");

    expect(minimizeButton.props.accessibilityHint).toBe(
      "Returns to the compact recording cards view",
    );
    expect(minimizeButton.props.accessibilityState).toEqual({ expanded: true });
    expect(minimizeButton.props.className).toContain("h-11");
    expect(minimizeButton.props.className).toContain("w-11");
    expect(minimizeButton.props.className).toContain("active:opacity-80");
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
    const service = buildService();
    Object.assign(service, {
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
    });
    const props: ComponentProps<typeof TrainerInsightCardComponent> = {
      mode: "expanded",
      plan: { hasPlan: false, select: jest.fn(), clear: jest.fn() },
      readings: { power: 210 },
      sensorCount: 1,
      service,
      sessionContract: buildContract({ devices: { hasTrainer: true, trainerControllable: true } }),
      stats: buildSessionStats(),
    };

    const result = renderNative(<TrainerInsightCard {...props} />);

    expect(screen.getByTestId("trainer-insight-card")).toBeTruthy();
    expect(screen.getAllByText("Power").length).toBeGreaterThan(0);

    result.rerender(<TrainerInsightCard {...props} />);

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

    const disabledActions = findHostNodes(result, "Pressable").filter(
      (node: ReactTestInstance) => node.props.accessibilityState?.disabled === true,
    );

    expect(disabledActions).toHaveLength(3);
  });

  it("resolves native control-sheet colors from semantic theme tokens", () => {
    const result = renderNative(
      <RecordingControlSheet
        activityCategory="bike"
        gpsRecordingEnabled
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
          guidance: { hasPlan: true },
          ui: { controls: { quickActions: ["gps", "plan"] } },
        })}
      />,
    );

    const getHostProps = (
      type: string,
    ): { backgroundStyle?: { backgroundColor?: string }; color?: string } => {
      const node = findHostNodes(result, type)[0];
      if (!node) throw new Error(`Expected ${type} host node`);
      return node.props;
    };

    expect(getHostProps("BottomSheet").backgroundStyle).toEqual({
      backgroundColor: THEME.light.popover,
    });
    expect(getHostProps("Activity").color).toBe(THEME.light.foreground);
    expect(getHostProps("MapPin").color).toBe(THEME.light.foreground);
    expect(getHostProps("CalendarDays").color).toBe(THEME.light.chart2);
    expect(getHostProps("Trash2").color).toBe(THEME.light.destructive);
  });
});
