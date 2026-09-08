import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const callbacks = { pause: jest.fn(), resume: jest.fn(), finish: jest.fn() };
const Button = createButtonComponent();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  View: createHost("View"),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({ useLocalSearchParams: () => ({}) }));
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
jest.mock("@/lib/recording/useRecordScreenController", () => ({
  useRecordScreenController: () => ({
    isInitialized: true,
    serviceState: "recording",
    activityCategory: "bike",
    hasPlan: false,
    sensorCount: 0,
    disconnectedSensors: [],
    activityQuickEditVisible: false,
    resourcePickerScope: null,
    sessionContract: { editing: { canEditActivity: false } },
    service: {},
    onBack: jest.fn(),
    closeActivityQuickEdit: jest.fn(),
    handleActivityQuickEdit: jest.fn(),
    onCloseResourcePicker: jest.fn(),
    onSelectResource: jest.fn(),
    onOpenActivity: jest.fn(),
    onOpenFtms: jest.fn(),
    onOpenPlan: jest.fn(),
    onOpenRoute: jest.fn(),
    onOpenSensors: jest.fn(),
    onRemovePlan: jest.fn(),
    onRemoveRoute: jest.fn(),
    handleStart: jest.fn(),
    onPause: callbacks.pause,
    onResume: callbacks.resume,
    handleLap: jest.fn(),
    handleFinish: callbacks.finish,
  }),
}));
jest.mock("@/components/recording/cockpit", () => ({
  RecordingLiveCockpit: ({
    onPause,
    onResume,
    onFinish,
  }: {
    onPause: () => void;
    onResume: () => void;
    onFinish: () => void;
  }) =>
    React.createElement(
      "View",
      null,
      React.createElement(Button, { onPress: onPause, testID: "pause" }, "Pause"),
      React.createElement(Button, { onPress: onResume, testID: "resume" }, "Resume"),
      React.createElement(Button, { onPress: onFinish, testID: "finish" }, "Finish"),
    ),
}));
jest.mock("@repo/ui/components/icon", () => ({ Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({
  AlertTriangle: createHost("AlertTriangle"),
  ChevronLeft: createHost("ChevronLeft"),
  Upload: createHost("Upload"),
}));

import RecordScreen from "../index";

describe("record screen lifecycle capability", () => {
  beforeEach(() => jest.clearAllMocks());

  it("exposes pause, resume, and finish as public recording actions", async () => {
    await renderNative(<RecordScreen />);
    await fireEvent.press(screen.getByTestId("pause"));
    await fireEvent.press(screen.getByTestId("resume"));
    await fireEvent.press(screen.getByTestId("finish"));
    expect(callbacks.pause).toHaveBeenCalledTimes(1);
    expect(callbacks.resume).toHaveBeenCalledTimes(1);
    expect(callbacks.finish).toHaveBeenCalledTimes(1);
  });
});
