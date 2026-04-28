import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../../test/render-native";

const backMock = jest.fn();

const service = {
  hasPlan: false,
  selectActivityFromPayload: jest.fn(),
};

let activityStatusMock = { activityCategory: "run", gpsRecordingEnabled: true };
let recordingStateMock = "pending";
let sessionContractMock: any = {
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
  useActivityStatus: () => activityStatusMock,
  useRecordingState: () => recordingStateMock,
}));

jest.mock("@/lib/hooks/useRecordingConfig", () => ({
  __esModule: true,
  useRecordingSessionContract: () => sessionContractMock,
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useSharedActivityRecorder: () => service,
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
    activityStatusMock = { activityCategory: "run", gpsRecordingEnabled: true };
    recordingStateMock = "pending";
    sessionContractMock = {
      editing: { canEditActivity: true, canEditGps: true },
      guidance: { hasPlan: false },
    };
  });

  it("saves GPS changes from the activity screen", () => {
    renderNative(<ActivitySelectionScreen />);

    fireEvent.press(screen.getByTestId("record-gps-option-off"));
    fireEvent.press(screen.getByTestId("record-activity-save-button"));

    expect(service.selectActivityFromPayload).toHaveBeenCalledWith({
      category: "run",
      gpsRecordingEnabled: false,
    });
    expect(backMock).toHaveBeenCalled();
  });

  it("allows GPS changes when plan locks activity category", () => {
    sessionContractMock = {
      editing: { canEditActivity: false, canEditGps: true },
      guidance: { hasPlan: true },
    };

    renderNative(<ActivitySelectionScreen />);

    fireEvent.press(screen.getByTestId("record-gps-option-off"));
    fireEvent.press(screen.getByTestId("record-activity-save-button"));

    expect(service.selectActivityFromPayload).toHaveBeenCalledWith({
      category: "run",
      gpsRecordingEnabled: false,
    });
  });
});
