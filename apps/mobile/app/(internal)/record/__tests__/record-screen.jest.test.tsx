import React from "react";
import { Alert } from "react-native";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const backMock = jest.fn();
const pushMock = jest.fn();
const startMock = jest.fn(async () => undefined);
const pauseMock = jest.fn();
const resumeMock = jest.fn();
const finishMock = jest.fn(async () => undefined);
const requestPermissionMock = jest.fn(async () => true);

const service = {
  currentRoute: null,
  plan: null,
  selectActivityFromPayload: jest.fn(),
  updateMetrics: jest.fn(),
  refreshAndCheckAllPermissions: jest.fn(async () => true),
  validatePlanRequirements: jest.fn<any, any>(() => ({ isValid: true, warnings: [] })),
  recordLap: jest.fn(() => 42),
};

const activitySelectionStoreMock = {
  peekSelection: jest.fn(() => ({
    category: "bike",
    gpsRecordingEnabled: false,
    eventId: "event-9",
  })),
  consumeSelection: jest.fn(),
};

const ButtonHost = createButtonComponent();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("../../../../../../packages/ui/src/test/react-native"),
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

jest.mock("@/components/ActivitySelectionModal", () => ({
  __esModule: true,
  ActivitySelectionModal: createHost("ActivitySelectionModal"),
}));

jest.mock("@/components/ErrorBoundary", () => ({
  __esModule: true,
  ErrorBoundary: ({ children }: any) => children,
  ScreenErrorFallback: createHost("ScreenErrorFallback"),
}));

jest.mock("@/components/recording/footer", () => ({
  __esModule: true,
  RecordingFooter: ({ onStart, onPause, onResume, onLap, onFinish }: any) =>
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
    ),
}));

jest.mock("@/components/recording/zones", () => ({
  __esModule: true,
  RecordingZones: createHost("RecordingZones"),
  ZoneFocusOverlay: createHost("ZoneFocusOverlay"),
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useActivityStatus: () => ({ gpsRecordingEnabled: false, activityCategory: "bike" }),
  useIntensityScale: () => "power",
  usePlan: () => ({ hasPlan: true }),
  useRecorderActions: () => ({
    start: startMock,
    pause: pauseMock,
    resume: resumeMock,
    finish: finishMock,
  }),
  useRecordingState: () => "pending",
  useSensors: () => ({ count: 1, sensors: [] }),
}));

jest.mock("@/lib/hooks/useAuth", () => ({
  __esModule: true,
  useAuth: () => ({ user: { id: "user-1" } }),
}));

jest.mock("@/lib/hooks/useRecordingConfig", () => ({
  __esModule: true,
  useRecordingCapabilities: () => ({ canUseTrainerControl: true }),
}));

jest.mock("@/lib/hooks/useStandalonePermissions", () => ({
  __esModule: true,
  useAllPermissionsGranted: jest.fn(() => ({ allGranted: true, isLoading: false })),
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useSharedActivityRecorder: () => service,
}));

jest.mock("@/lib/services/permissions-check", () => ({
  __esModule: true,
  requestPermission: requestPermissionMock,
}));

jest.mock("@/lib/stores/activitySelectionStore", () => ({
  __esModule: true,
  activitySelectionStore: activitySelectionStoreMock,
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  api: {
    profiles: {
      getZones: {
        useQuery: () => ({ data: { profile: null } }),
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
    service.refreshAndCheckAllPermissions.mockResolvedValue(true);
    service.validatePlanRequirements.mockReturnValue({ isValid: true, warnings: [] });
    activitySelectionStoreMock.peekSelection.mockReturnValue({
      category: "bike",
      gpsRecordingEnabled: false,
      eventId: "event-9",
    });
    useAllPermissionsGranted.mockReturnValue({ allGranted: true, isLoading: false });
  });

  it("initializes from the shared activity selection store", async () => {
    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(service.selectActivityFromPayload).toHaveBeenCalledWith(
        expect.objectContaining({ category: "bike", eventId: "event-9" }),
      );
    });
    expect(activitySelectionStoreMock.consumeSelection).toHaveBeenCalled();
  });

  it("requests missing permissions before starting the recorder", async () => {
    useAllPermissionsGranted.mockReturnValue({ allGranted: false, isLoading: false });
    service.refreshAndCheckAllPermissions.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    renderNative(<RecordScreen />);

    await waitFor(() => {
      expect(screen.getByText("Start")).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Start"));

    await waitFor(() => {
      expect(requestPermissionMock).toHaveBeenNthCalledWith(1, "bluetooth");
      expect(requestPermissionMock).toHaveBeenNthCalledWith(2, "location");
      expect(requestPermissionMock).toHaveBeenNthCalledWith(3, "location-background");
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

    expect(Alert.alert).toHaveBeenCalledWith(
      "Profile Setup Required",
      expect.stringContaining("FTP"),
      expect.any(Array),
    );

    const alertButtons = (Alert.alert as jest.Mock).mock.calls[0]?.[2] as Array<any>;
    const goToProfile = alertButtons.find((button) => button.text === "Go to Profile");
    goToProfile?.onPress?.();

    expect(pushMock).toHaveBeenCalledWith({
      pathname: "/user/[userId]",
      params: { userId: "user-1" },
    });
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
