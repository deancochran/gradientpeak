import React from "react";
import { createButtonComponent, createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

const navigateToMock = jest.fn();
const sharedService = { setManualControlMode: jest.fn() };

const ButtonHost = createButtonComponent();

let bleState = "PoweredOn";
let sensors: Array<any> = [];
let sessionView: any = null;
let plan = { hasPlan: false };

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@/lib/navigation/useAppNavigate", () => ({
  __esModule: true,
  useAppNavigate: () => navigateToMock,
}));

jest.mock("@/lib/providers/ActivityRecorderProvider", () => ({
  __esModule: true,
  useSharedActivityRecorder: () => sharedService,
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useBleState: () => bleState,
  usePlan: () => plan,
  useSensors: () => ({ sensors }),
  useSessionView: () => sessionView,
}));

jest.mock("@/components/recording/ftms/BikeControlUI", () => ({
  __esModule: true,
  BikeControlUI: createHost("BikeControlUI"),
}));

jest.mock("@/components/recording/ftms/EllipticalControlUI", () => ({
  __esModule: true,
  EllipticalControlUI: createHost("EllipticalControlUI"),
}));

jest.mock("@/components/recording/ftms/RowerControlUI", () => ({
  __esModule: true,
  RowerControlUI: createHost("RowerControlUI"),
}));

jest.mock("@/components/recording/ftms/TreadmillControlUI", () => ({
  __esModule: true,
  TreadmillControlUI: createHost("TreadmillControlUI"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ButtonHost,
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

const FTMSControlPage = require("../ftms").default;

describe("FTMS control screen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bleState = "PoweredOn";
    sensors = [];
    plan = { hasPlan: false };
    sessionView = {
      overrideState: { trainerMode: "auto" },
      trainer: {
        machineType: null,
        recoveryState: "idle",
        lastCommandStatus: null,
      },
    };
  });

  it("shows a blocked state when trainer control is not ready", () => {
    sensors = [
      {
        id: "trainer-1",
        name: "Trainer 1",
        isControllable: false,
        ftmsFeatures: { powerTargetSettingSupported: true },
      },
    ];
    sessionView.trainer.machineType = "bike";

    renderNative(<FTMSControlPage />);

    expect(screen.getByText("Trainer controls are blocked")).toBeTruthy();
    expect(screen.getByText("Reconnect trainer")).toBeTruthy();
  });

  it("shows the control surface when the trainer is control-ready", () => {
    sensors = [
      {
        id: "trainer-1",
        name: "Trainer 1",
        isControllable: true,
        ftmsFeatures: { powerTargetSettingSupported: true },
      },
    ];
    sessionView.trainer.machineType = "bike";

    renderNative(<FTMSControlPage />);

    expect(screen.getByText("bike control")).toBeTruthy();
    expect(screen.getByText("Trainer 1 is connected and ready for FTMS control.")).toBeTruthy();
    expect(screen.getByText("Switch to Manual")).toBeTruthy();
  });
});
