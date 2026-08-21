import { buildPerformanceTargetFactsFixture } from "@repo/core/testing/performance-model";
import React from "react";
import { Alert } from "react-native";
import { createActivityPlanDetail } from "../../../../test/activity-plan-projection-fixture";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const pushMock = jest.fn();
const startMock = jest.fn(async () => undefined);
const pauseMock = jest.fn();
const resumeMock = jest.fn();
const finishMock = jest.fn(async () => undefined);
const requestPermissionMock = jest.fn(async () => true);
const mockPerformanceTargets = buildPerformanceTargetFactsFixture({
  asOf: "2026-06-01T00:00:00.000Z",
});
const mockPublishedState = {
  status: { freshness: "fresh" as const, rebuildStatus: "fresh" as const },
  publishedState: {
    publishedAt: mockPerformanceTargets.asOf,
    performanceTargets: mockPerformanceTargets,
  },
  currentBaseline: {
    planningContext: { body: { weightKg: { value: 72 } } },
  },
};
const mockGetPublishedStateQuery = jest.fn(() => ({ data: mockPublishedState }));
const mockFetchPublishedState = jest.fn(
  async (_input: { profileId: string; sections: Record<string, boolean> }) => mockPublishedState,
);
const mockGetProfileQuery = jest.fn(() => ({ data: { weight_kg: 72 } }));
let mockRecordingLifecycle: "idle" | "setup" | "active" = "idle";
let mockActivityPlanQueryData: { detail: ReturnType<typeof createActivityPlanDetail> } | null =
  null;

type PlanValidation = {
  isValid: boolean;
  missingMetrics?: Array<{ name: string; description: string }>;
  warnings: string[];
};
type ActivitySelection = {
  activity_category: string;
  gpsRecordingEnabled: boolean;
  eventId?: string;
  launchSource?: "route";
  routeId?: string;
};
type CockpitProps = {
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onLap: () => void;
  onFinish: () => void;
  onOpenPlan: () => void;
};
type ResourcePickerNode = {
  props: { onSelect: (item: { id: string }) => void };
};
type UnsafeTypeQuery = {
  UNSAFE_getByType: (type: "ResourcePickerModal") => ResourcePickerNode;
};
type AlertButtonFixture = { text?: string; onPress?: () => void | Promise<void> };

const service = {
  currentRoute: null,
  plan: null,
  attachRoute: jest.fn(async () => undefined),
  prepareRouteAttachment: jest.fn(),
  selectActivityFromPayload: jest.fn(),
  selectPlan: jest.fn(),
  updateMetrics: jest.fn(),
  updatePerformanceTargets: jest.fn(),
  refreshAndCheckAllPermissions: jest.fn(async () => true),
  refreshAndCheckRecordingPermissions: jest.fn(async () => true),
  validatePlanRequirements: jest.fn<PlanValidation, []>(() => ({ isValid: true, warnings: [] })),
  recordLap: jest.fn(() => 42),
};

const activitySelectionStoreMock = {
  peekSelection: jest.fn<ActivitySelection | null, []>(() => ({
    activity_category: "bike",
    gpsRecordingEnabled: false,
    eventId: "event-9",
  })),
  consumeSelection: jest.fn(),
};

const ButtonHost = createButtonComponent();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Alert: { alert: jest.fn() },
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  useRouter: () => ({ back: backMock, push: pushMock }),
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/components/recording/RecordingActivityQuickEdit", () => ({
  __esModule: true,
  RecordingActivityQuickEdit: createHost("RecordingActivityQuickEdit"),
}));

jest.mock("@/components/shared/resource-picker", () => ({
  __esModule: true,
  ResourcePickerModal: createHost("ResourcePickerModal"),
}));

jest.mock("@/lib/hooks/useRouteUpload", () => ({
  __esModule: true,
  useRouteUpload: () => ({
    isUploadingRoute: false,
    pickGpxFile: jest.fn(),
  }),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/recording/cockpit", () => ({
  __esModule: true,
  RecordingLiveCockpit: ({
    onStart,
    onPause,
    onResume,
    onLap,
    onFinish,
    onOpenPlan,
  }: CockpitProps) =>
    React.createElement(
      "View",
      null,
      React.createElement(
        ButtonHost,
        { onPress: onStart },
        React.createElement("Text", null, "Start"),
      ),
      React.createElement(
        ButtonHost,
        { onPress: onPause },
        React.createElement("Text", null, "Pause"),
      ),
      React.createElement(
        ButtonHost,
        { onPress: onResume },
        React.createElement("Text", null, "Resume"),
      ),
      React.createElement(ButtonHost, { onPress: onLap }, React.createElement("Text", null, "Lap")),
      React.createElement(
        ButtonHost,
        { onPress: onFinish },
        React.createElement("Text", null, "Finish"),
      ),
      React.createElement(
        ButtonHost,
        { onPress: onOpenPlan },
        React.createElement("Text", null, "Open plan"),
      ),
    ),
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useRecordingCommands: () => ({
    start: startMock,
    pause: pauseMock,
    resume: resumeMock,
    finish: finishMock,
  }),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: "user-1" } }),
}));

jest.mock("@/lib/auth/auth-headers", () => ({
  __esModule: true,
  hasSessionAuthCredentials: () => true,
}));

jest.mock("@/lib/performance", () => ({
  __esModule: true,
  markNavigationStart: jest.fn(),
  toPerformanceRouteKey: () => "mock-route",
  usePerformanceScreenReady: jest.fn(),
}));

jest.mock("@/lib/hooks/useRecordingConfig", () => ({
  __esModule: true,
  useRecordingConfig: () => ({
    sessionView: {
      lifecycle: mockRecordingLifecycle,
      plan: { hasPlan: true },
      recordingConfiguration: { input: { activityCategory: "bike", gpsRecordingEnabled: false } },
    },
    sessionContract: {
      guidance: { hasPlan: true, hasRoute: false, routeMode: "none" },
      devices: { hasTrainer: false, trainerControllable: false },
      editing: { canEditActivity: false, canEditGps: true, canEditPlan: true, canEditRoute: true },
      ui: {
        backdropMode: "ambient",
        floatingPanel: {
          defaultCard: "activity_interval",
          availableCards: ["activity_interval", "metrics"],
          forcedExpanded: true,
          canMinimize: false,
        },
        controls: { quickActions: ["plan", "sensors"] },
      },
      surfaces: {
        defaultPrimarySurface: "activity",
        availablePrimarySurfaces: ["activity", "metrics"],
        quickActions: ["plan", "sensors"],
      },
      validation: { consequences: [] },
    },
  }),
}));

jest.mock("@/lib/hooks/useStandalonePermissions", () => ({
  __esModule: true,
  useAllPermissionsGranted: jest.fn(() => ({ allGranted: true, isLoading: false })),
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useActivityRecorderService: () => ({ service }),
}));

jest.mock("@/lib/services/permissions-check", () => ({
  __esModule: true,
  requestPermission: requestPermissionMock,
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: activitySelectionStoreMock,
  defaultRecordLaunchPayload: jest.fn(() => ({
    launchSource: "record_tab",
    activity_category: "run",
    gpsRecordingEnabled: true,
  })),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    useUtils: () => ({
      athleteIntelligence: { getReadModel: { fetch: mockFetchPublishedState } },
      routes: { invalidate: jest.fn() },
    }),
    activityPlans: {
      getById: {
        useQuery: () => ({ data: mockActivityPlanQueryData, error: null }),
      },
    },
    athleteIntelligence: {
      getReadModel: {
        useQuery: mockGetPublishedStateQuery,
      },
    },
    profiles: {
      get: {
        useQuery: mockGetProfileQuery,
      },
    },
    routes: {
      upload: {
        useMutation: () => ({ mutate: jest.fn() }),
      },
    },
  },
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

jest.mock("@repo/ui/components/icon", () => ({
  __esModule: true,
  Icon: createHost("Icon"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  Activity: createHost("Activity"),
  AlertTriangle: createHost("AlertTriangle"),
  Bike: createHost("Bike"),
  ChevronLeft: createHost("ChevronLeft"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  Waves: createHost("Waves"),
}));

const { useAllPermissionsGranted } = require("@/lib/hooks/useStandalonePermissions");
const RecordScreen = require("../index").default;

describe("record screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecordingLifecycle = "idle";
    mockActivityPlanQueryData = null;
    service.attachRoute.mockResolvedValue(undefined);
    service.refreshAndCheckAllPermissions.mockResolvedValue(true);
    service.refreshAndCheckRecordingPermissions.mockResolvedValue(true);
    service.validatePlanRequirements.mockReturnValue({ isValid: true, warnings: [] });
    mockFetchPublishedState.mockResolvedValue(mockPublishedState);
    activitySelectionStoreMock.peekSelection.mockReturnValue({
      activity_category: "bike",
      gpsRecordingEnabled: false,
      eventId: "event-9",
    });
    useAllPermissionsGranted.mockReturnValue({ allGranted: true, isLoading: false });
  });

  it("initializes from the shared activity selection store", async () => {
    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(service.selectActivityFromPayload).toHaveBeenCalledWith(
        expect.objectContaining({ activity_category: "bike", eventId: "event-9" }),
      );
    });
    expect(activitySelectionStoreMock.consumeSelection).toHaveBeenCalled();
  });

  it("does not attach preview-only shared plans to a recording", async () => {
    mockActivityPlanQueryData = {
      detail: createActivityPlanDetail({
        id: "shared-plan-1",
        name: "Shared plan",
        visibility: "public",
        capabilities: {
          canLike: true,
          canEdit: false,
          canDelete: false,
          canDuplicate: true,
          canSchedule: true,
          canRecord: false,
        },
      }),
    };
    const rendered = renderNative(<RecordScreen />);

    fireEvent.press(screen.getByText("Open plan"));
    const picker = (rendered as unknown as UnsafeTypeQuery).UNSAFE_getByType("ResourcePickerModal");
    fireEvent(picker as never, "select", { id: "shared-plan-1" });

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Plan Attachment Failed",
        "Duplicate this plan into your library before attaching it to a recording.",
      );
    });
    expect(service.selectPlan).not.toHaveBeenCalled();
  });

  it("hydrates owner-only performance targets at one explicit recording operation timestamp", async () => {
    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(service.updatePerformanceTargets).toHaveBeenCalledWith(mockPerformanceTargets);
    });
    expect(mockGetPublishedStateQuery).toHaveBeenCalledWith(
      {
        profileId: "user-1",
        sections: {
          publishedState: true,
          status: true,
          currentBaseline: { includePlanningContext: true },
        },
      },
      expect.objectContaining({ enabled: true }),
    );
  });

  it("hydrates only non-target recording profile data from the profile projection", async () => {
    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(service.updateMetrics).toHaveBeenCalledWith({ weightKg: 72 });
    });
    expect(service.updateMetrics).not.toHaveBeenCalledWith(
      expect.objectContaining({ bikeThresholdWatts: expect.any(Number) }),
    );
    expect(service.updateMetrics).not.toHaveBeenCalledWith(
      expect.objectContaining({ lthrBpm: expect.any(Number) }),
    );
  });

  it("refreshes performance targets at the start operation before recording", async () => {
    renderNative(<RecordScreen />);
    fireEvent.press(await screen.findByText("Start"));

    await waitFor(() => {
      expect(startMock).toHaveBeenCalled();
    });
    expect(mockFetchPublishedState).toHaveBeenCalledWith({
      profileId: "user-1",
      sections: { publishedState: true, status: true },
    });
    expect(service.updatePerformanceTargets).toHaveBeenLastCalledWith(mockPerformanceTargets);
    expect(startMock).toHaveBeenCalledWith(mockPerformanceTargets);
    expect(service.updatePerformanceTargets.mock.invocationCallOrder.at(-1)).toBeLessThan(
      startMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it("stages explicit unavailable targets when the start-time query fails", async () => {
    mockFetchPublishedState.mockRejectedValueOnce(new Error("offline"));
    renderNative(<RecordScreen />);
    fireEvent.press(await screen.findByText("Start"));

    await waitFor(() => {
      expect(startMock).toHaveBeenCalled();
    });
    expect(service.updatePerformanceTargets).toHaveBeenLastCalledWith(
      expect.objectContaining({
        asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        thresholds: expect.objectContaining({
          bike: expect.objectContaining({ status: "unavailable", value: null }),
        }),
      }),
    );
    expect(startMock).toHaveBeenCalledWith(
      expect.objectContaining({
        thresholds: expect.objectContaining({
          bike: expect.objectContaining({ status: "unavailable" }),
        }),
      }),
    );
  });

  it("uses the validated start targets unchanged when continuing after a validation dialog", async () => {
    const initialTargets = buildPerformanceTargetFactsFixture({
      asOf: "2026-07-31T01:00:00.000Z",
      thresholdEffectiveAt: "2025-01-01T00:00:00.000Z",
      bikeThresholdWatts: 275,
    });
    mockFetchPublishedState.mockResolvedValueOnce({
      ...mockPublishedState,
      publishedState: {
        publishedAt: initialTargets.asOf,
        performanceTargets: initialTargets,
      },
    });
    service.validatePlanRequirements.mockReturnValue({
      isValid: false,
      missingMetrics: [{ name: "FTP", description: "Needed for ERG targets." }],
      warnings: [],
    });
    renderNative(<RecordScreen />);
    fireEvent.press(await screen.findByText("Start"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Profile Setup Required",
        expect.any(String),
        expect.any(Array),
      );
    });
    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as AlertButtonFixture[];
    await alertButtons.find((button) => button.text === "Continue Anyway")?.onPress?.();

    expect(mockFetchPublishedState).toHaveBeenCalledTimes(1);
    expect(service.updatePerformanceTargets).toHaveBeenLastCalledWith(initialTargets);
    expect(startMock).toHaveBeenCalledWith(initialTargets);
  });

  it("initializes explicit route launches without waiting for route geometry", async () => {
    activitySelectionStoreMock.peekSelection.mockReturnValue({
      launchSource: "route",
      activity_category: "bike",
      gpsRecordingEnabled: false,
      routeId: "route-1",
    });

    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(service.selectActivityFromPayload).toHaveBeenCalledWith(
        expect.objectContaining({ activity_category: "bike", routeId: "route-1" }),
      );
      expect(activitySelectionStoreMock.consumeSelection).toHaveBeenCalled();
      expect(service.prepareRouteAttachment).toHaveBeenCalledWith("route-1");
      expect(screen.getByText("Start")).toBeTruthy();
    });

    expect(service.attachRoute).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith("Route Not Attached", expect.any(String));
    expect(backMock).not.toHaveBeenCalled();
  });

  it("does not apply default payload over existing setup", async () => {
    mockRecordingLifecycle = "setup";
    activitySelectionStoreMock.peekSelection.mockReturnValue(null);

    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText("Start")).toBeTruthy();
    });

    expect(service.selectActivityFromPayload).not.toHaveBeenCalled();
    expect(activitySelectionStoreMock.consumeSelection).not.toHaveBeenCalled();
  });

  it("does not apply launch payload over active recording", async () => {
    mockRecordingLifecycle = "active";

    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText("Start")).toBeTruthy();
    });

    expect(service.selectActivityFromPayload).not.toHaveBeenCalled();
    expect(activitySelectionStoreMock.consumeSelection).toHaveBeenCalled();
  });

  it("keeps the close button available during active recording", async () => {
    mockRecordingLifecycle = "active";

    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByTestId("record-close-button")).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId("record-close-button"));

    expect(backMock).toHaveBeenCalled();
  });

  it("requests missing permissions before starting the recorder", async () => {
    useAllPermissionsGranted.mockReturnValue({ allGranted: false, isLoading: false });
    service.refreshAndCheckRecordingPermissions
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText("Start")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Start"));

    await waitFor(() => {
      expect(requestPermissionMock).toHaveBeenNthCalledWith(1, "bluetooth");
      expect(startMock).toHaveBeenCalled();
    });
  });

  it("offers a profile redirect when required plan metrics are missing", async () => {
    service.validatePlanRequirements.mockReturnValue({
      isValid: false,
      missingMetrics: [{ name: "FTP", description: "Needed for ERG targets." }],
      warnings: [],
    });

    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText("Start")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Start"));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        "Profile Setup Required",
        expect.stringContaining("FTP"),
        expect.any(Array),
      );
    });

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as AlertButtonFixture[];
    const goToProfile = alertButtons.find((button) => button.text === "Go to Profile");
    goToProfile?.onPress?.();

    expect(pushMock).toHaveBeenCalledWith("/profile");
    expect(startMock).not.toHaveBeenCalled();
  });

  it("finalizes the recording and opens the submit screen", async () => {
    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText("Finish")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Finish"));

    await waitFor(() => {
      expect(finishMock).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith("/record/submit");
    });
  });
});
