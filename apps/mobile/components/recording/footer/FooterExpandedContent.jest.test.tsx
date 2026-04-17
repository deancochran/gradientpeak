import React from "react";
import { createButtonComponent, createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";

const navigateToMock = jest.fn();
const toggleGpsMock = jest.fn();

const ButtonHost = createButtonComponent();

let bleState = "PoweredOn";
let sensors: Array<any> = [];
let sessionView: any = null;
let currentReadings: any = { lastUpdated: {} };

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("react-native-safe-area-context", () => ({
  __esModule: true,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useBleState: () => bleState,
  useCurrentReadings: () => currentReadings,
  useGpsTracking: () => ({ toggleGps: toggleGpsMock }),
  useSensors: () => ({ sensors }),
  useSessionView: () => sessionView,
}));

jest.mock("./IntensityScaling", () => ({
  __esModule: true,
  IntensityScaling: createHost("IntensityScaling"),
}));

jest.mock("./RecordingControls", () => ({
  __esModule: true,
  RecordingControls: createHost("RecordingControls"),
}));

jest.mock("@repo/ui/components/badge", () => ({
  __esModule: true,
  Badge: createHost("Badge"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("lucide-react-native", () => ({
  __esModule: true,
  ArrowUpRight: createHost("ArrowUpRight"),
  Bluetooth: createHost("Bluetooth"),
  Gauge: createHost("Gauge"),
  MapPin: createHost("MapPin"),
  MapPinOff: createHost("MapPinOff"),
  Route: createHost("Route"),
  Settings2: createHost("Settings2"),
  WifiOff: createHost("WifiOff"),
}));

const { FooterExpandedContent } = require("./FooterExpandedContent");

describe("FooterExpandedContent trainer summary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bleState = "PoweredOn";
    sensors = [];
    currentReadings = { lastUpdated: {} };
    sessionView = {
      snapshot: null,
      runtimeSourceState: { degradedState: { metrics: [] }, selectedSources: [] },
      overrideState: { preferredSources: {}, trainerMode: "auto" },
      trainer: {
        machineType: null,
        recoveryState: "idle",
        lastCommandStatus: null,
      },
    };
  });

  function renderFooter() {
    return renderNative(
      <FooterExpandedContent
        service={null}
        recordingState="not_started"
        category="bike"
        gpsRecordingEnabled={false}
        hasPlan={false}
        hasRoute={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onLap={jest.fn()}
        onFinish={jest.fn()}
      />,
    );
  }

  it("distinguishes connected, data-flowing, and control-ready trainer states", () => {
    sessionView.trainer.machineType = "bike";

    const rendered = renderFooter();
    expect(screen.getByText("Trainer connected")).toBeTruthy();
    expect(screen.getByText("Open Sensors")).toBeTruthy();

    currentReadings = { lastUpdated: { power: Date.now() } };
    rendered.rerender(
      <FooterExpandedContent
        service={null}
        recordingState="not_started"
        category="bike"
        gpsRecordingEnabled={false}
        hasPlan={false}
        hasRoute={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onLap={jest.fn()}
        onFinish={jest.fn()}
      />,
    );
    expect(screen.getByText("Receiving trainer data")).toBeTruthy();

    sensors = [
      {
        id: "trainer-1",
        name: "Trainer 1",
        isControllable: true,
        ftmsFeatures: { powerTargetSettingSupported: true },
      },
    ];
    rendered.rerender(
      <FooterExpandedContent
        service={null}
        recordingState="not_started"
        category="bike"
        gpsRecordingEnabled={false}
        hasPlan={false}
        hasRoute={false}
        onStart={jest.fn()}
        onPause={jest.fn()}
        onResume={jest.fn()}
        onLap={jest.fn()}
        onFinish={jest.fn()}
      />,
    );
    expect(screen.getByText("Trainer control ready")).toBeTruthy();
    expect(screen.getByText("Open Controls")).toBeTruthy();
  });
});
