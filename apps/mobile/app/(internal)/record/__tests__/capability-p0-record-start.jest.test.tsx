import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const start = jest.fn(async () => undefined);
const recordLap = jest.fn(() => 12_000);
const selectActivityFromPayload = jest.fn();
const service = {
  state: "pending",
  plan: null,
  currentRoute: null,
  selectActivityFromPayload,
  validatePlanRequirements: jest.fn(() => ({ isValid: true, warnings: [] })),
  updatePerformanceTargets: jest.fn(),
  updateMetrics: jest.fn(),
  recordLap,
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
  Alert: { alert: jest.fn() },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock("@/components/ErrorBoundary", () => ({
  ErrorBoundary: ({ children }: React.PropsWithChildren) => children,
  ScreenErrorFallback: createHost("Fallback"),
}));
jest.mock("@/components/recording/RecordingActivityQuickEdit", () => ({
  RecordingActivityQuickEdit: createHost("QuickEdit"),
}));
jest.mock("@/components/shared/resource-picker", () => ({
  ResourcePickerModal: createHost("Picker"),
}));
jest.mock("@/lib/hooks/useRouteUpload", () => ({
  useRouteUpload: () => ({ isUploadingRoute: false, pickGpxFile: jest.fn() }),
}));
jest.mock("@/lib/performance", () => ({ usePerformanceScreenReady: jest.fn() }));
jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  useActivityRecorderService: () => ({ service }),
}));
jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  useRecordingCommands: () => ({ start, pause: jest.fn(), resume: jest.fn(), finish: jest.fn() }),
}));
jest.mock("@/lib/hooks/useRecordingConfig", () => ({
  useRecordingConfig: () => ({
    isInitialized: true,
    sessionView: {
      lifecycle: "idle",
      plan: { hasPlan: false },
      recordingConfiguration: { input: { activityCategory: "bike" } },
    },
    sessionContract: { editing: { canEditActivity: true }, guidance: { hasPlan: false } },
  }),
}));
jest.mock("@/lib/stores/activitySelectionStore", () => ({
  activitySelectionStore: { peekSelection: () => null, consumeSelection: jest.fn() },
  defaultRecordLaunchPayload: () => ({ activity_category: "bike", gpsRecordingEnabled: false }),
}));
jest.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
jest.mock("@/lib/api", () => ({
  api: {
    useUtils: () => ({
      athleteIntelligence: {
        getReadModel: { fetch: jest.fn(async () => ({ publishedState: null })) },
      },
    }),
    athleteIntelligence: { getReadModel: { useQuery: () => ({ data: null }) } },
    profiles: { get: { useQuery: () => ({ data: null }) } },
    activityPlans: { getById: { useQuery: () => ({ data: null, error: null }) } },
  },
}));
jest.mock("@repo/ui/components/button", () => ({ Button: createButtonComponent() }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock(
  "lucide-react-native",
  () => new Proxy({}, { get: (_target, name) => createHost(String(name)) }),
);
jest.mock("@/components/recording/cockpit", () => ({
  RecordingLiveCockpit: ({ onStart, onLap }: { onStart: () => void; onLap: () => void }) =>
    React.createElement(
      "View",
      null,
      React.createElement("Button", { onPress: onStart }, "Start"),
      React.createElement("Button", { onPress: onLap }, "Lap"),
    ),
}));

const RecordScreen = require("../index").default;

describe("record screen start controls", () => {
  beforeEach(() => jest.clearAllMocks());

  it("exposes manual start and lap actions to the live recording surface", async () => {
    renderNative(<RecordScreen />);

    await waitFor(() => expect(screen.UNSAFE_getAllByType("Button")).toHaveLength(2));
    const [startButton, lapButton] = screen.UNSAFE_getAllByType("Button");
    fireEvent.press(startButton);
    fireEvent.press(lapButton);

    await waitFor(() => expect(start).toHaveBeenCalled());
    expect(recordLap).toHaveBeenCalledTimes(1);
  });
});
