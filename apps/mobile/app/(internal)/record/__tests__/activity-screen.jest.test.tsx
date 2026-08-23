import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const backMock = jest.fn();

const service = {
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
});
