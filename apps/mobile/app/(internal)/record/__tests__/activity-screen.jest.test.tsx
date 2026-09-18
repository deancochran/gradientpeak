import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const backMock = jest.fn();

const service = {
  state: "ready",
  hasPlan: false,
  selectActivityFromPayload: jest.fn(),
};

let activityStatusMock = { activityCategory: "run", gpsRecordingEnabled: false };
let sessionContractMock: {
  editing: { canEditActivity: boolean; canEditGps: boolean };
  guidance: { hasPlan: boolean };
} = {
  editing: { canEditActivity: true, canEditGps: true },
  guidance: { hasPlan: false },
};

const ButtonHost = createButtonComponent();

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  Pressable: createHost("Pressable"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("expo-router", () => ({
  __esModule: true,
  router: { back: backMock },
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useRecordingCommands: () => ({ selectActivityFromPayload: service.selectActivityFromPayload }),
}));

jest.mock("@/lib/hooks/useRecordingConfig", () => ({
  __esModule: true,
  useRecordingConfig: () => ({
    sessionContract: sessionContractMock,
    sessionView: {
      plan: { hasPlan: false },
      recordingConfiguration: {
        input: {
          activityCategory: activityStatusMock.activityCategory,
          gpsRecordingEnabled: activityStatusMock.gpsRecordingEnabled,
        },
      },
    },
  }),
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useActivityRecorderService: () => ({ service }),
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
  Bike: createHost("Bike"),
  Check: createHost("Check"),
  Dumbbell: createHost("Dumbbell"),
  Footprints: createHost("Footprints"),
  MapPin: createHost("MapPin"),
  Waves: createHost("Waves"),
}));

const ActivitySelectionScreen = require("../activity").default;

describe("record activity screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    service.state = "ready";
    activityStatusMock = { activityCategory: "run", gpsRecordingEnabled: false };
    sessionContractMock = {
      editing: { canEditActivity: true, canEditGps: true },
      guidance: { hasPlan: false },
    };
  });

  it("omits GPS controls and saves category changes as GPS-free", async () => {
    await renderNative(<ActivitySelectionScreen />);

    expect(screen.queryByTestId("record-gps-option-on")).toBeNull();
    expect(screen.queryByTestId("record-gps-option-off")).toBeNull();
    await fireEvent.press(screen.getByTestId("record-activity-option-bike"));
    await fireEvent.press(screen.getByTestId("record-activity-save-button"));

    expect(service.selectActivityFromPayload).toHaveBeenCalledWith({
      activity_category: "bike",
      gpsRecordingEnabled: false,
    });
    expect(backMock).toHaveBeenCalled();
  });

  it("exposes activity choices as a radio group with the selected category announced", async () => {
    await renderNative(<ActivitySelectionScreen />);

    const run = screen.getByTestId("record-activity-option-run");
    const bike = screen.getByTestId("record-activity-option-bike");

    expect(run.props.accessibilityRole).toBe("radio");
    expect(run.props.accessibilityState).toEqual({ disabled: false, selected: true });
    expect(bike.props.accessibilityState).toEqual({ disabled: false, selected: false });
  });

  it("does not offer a save path when a plan locks activity category", async () => {
    sessionContractMock = {
      editing: { canEditActivity: false, canEditGps: true },
      guidance: { hasPlan: true },
    };

    await renderNative(<ActivitySelectionScreen />);

    expect(screen.queryByTestId("record-gps-option-on")).toBeNull();
    expect(screen.getByTestId("record-activity-save-button").props.disabled).toBe(true);
    expect(service.selectActivityFromPayload).not.toHaveBeenCalled();
  });

  it("locks choices when runtime editing becomes unavailable after selection", async () => {
    const view = await renderNative(<ActivitySelectionScreen />);
    await fireEvent.press(screen.getByTestId("record-activity-option-bike"));
    service.state = "recording";
    sessionContractMock.editing.canEditActivity = false;
    await view.rerender(<ActivitySelectionScreen />);
    expect(screen.getByText(/Activity identity is locked after recording starts/)).toBeTruthy();
    expect(screen.getByTestId("record-activity-option-bike").props.accessibilityLabel).toBe("Bike");
    expect(
      screen.getByTestId("record-activity-option-bike").props.accessibilityState.disabled,
    ).toBe(true);
    await fireEvent.press(screen.getByTestId("record-activity-save-button"));
    expect(service.selectActivityFromPayload).not.toHaveBeenCalled();
    expect(backMock).not.toHaveBeenCalled();
  });
});
