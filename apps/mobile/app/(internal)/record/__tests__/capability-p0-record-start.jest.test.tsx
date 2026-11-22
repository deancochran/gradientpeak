import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen, waitFor } from "../../../../test/render-native";

const start = jest.fn(async () => undefined);
const recordLap = jest.fn(() => 12_000);
const selectActivityFromPayload = jest.fn();
const mockButtonComponent = createButtonComponent();
const mockButtonHost = createHost("Button");
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
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
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
jest.mock("@repo/ui/components/button", () => ({ Button: mockButtonComponent }));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock(
  "lucide-react-native",
  () => new Proxy({}, { get: (_target, name) => createHost(String(name)) }),
);
jest.mock("@/components/recording/cockpit", () => ({
  RecordingLiveCockpit: ({ onStart }: { onStart: () => void }) =>
    React.createElement(
      "View",
      null,
      React.createElement(mockButtonHost, { onPress: onStart }, "Start"),
    ),
}));

const RecordScreen = require("../index").default;

describe("record screen start controls", () => {
  beforeEach(() => jest.clearAllMocks());

  it("record.start exposes the manual start action to the live recording surface", async () => {
    await renderNative(<RecordScreen />);

    await waitFor(() =>
      expect(screen.container.queryAll((node) => node.type === "Button")).toHaveLength(1),
    );
    const [startButton] = screen.container.queryAll((node) => node.type === "Button");
    if (!startButton) throw new Error("Recording cockpit must expose a start button");
    await fireEvent.press(startButton);

    await waitFor(() => expect(start).toHaveBeenCalled());
  });
});
