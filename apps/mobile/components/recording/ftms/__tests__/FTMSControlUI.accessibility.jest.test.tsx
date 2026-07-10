import { createHost } from "../../../../test/mock-components";
import { renderNative, screen } from "../../../../test/render-native";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

jest.mock("@/lib/hooks/useActivityRecorder", () => ({
  __esModule: true,
  useCurrentReadings: () => ({ power: null }),
  usePlan: () => ({ currentStep: null, hasPlan: false }),
}));

const { TreadmillControlUI } = require("../TreadmillControlUI");
const { RowerControlUI } = require("../RowerControlUI");
const { EllipticalControlUI } = require("../EllipticalControlUI");

const manualService = {
  applyManualTrainerCadence: jest.fn(),
  applyManualTrainerIncline: jest.fn(),
  applyManualTrainerResistance: jest.fn(),
  applyManualTrainerSpeed: jest.fn(),
  getTrainerFeatures: () => ({
    inclinationTargetSettingSupported: true,
    resistanceTargetSettingSupported: true,
    speedTargetSettingSupported: true,
    targetedCadenceSupported: true,
  }),
};

describe("FTMS control accessibility", () => {
  it("labels treadmill controls with their adjustment and unit", () => {
    renderNative(
      <TreadmillControlUI service={manualService} controlMode="manual" hasPlan={false} />,
    );

    const decreaseSpeed = screen.getByLabelText("Decrease speed by 0.5 kilometers per hour");
    expect(decreaseSpeed.props.accessibilityRole).toBe("button");
    expect(decreaseSpeed.props.accessibilityState).toEqual({ disabled: false });
    expect(decreaseSpeed.props.style({ pressed: true })).toEqual({ opacity: 0.7 });
    expect(screen.getByLabelText("Apply incline in percent").props.className).toContain("h-12");
  });

  it("labels rower controls with their adjustment units", () => {
    renderNative(<RowerControlUI service={manualService} controlMode="manual" hasPlan={false} />);

    expect(screen.getByLabelText("Decrease damper by one level").props.accessibilityRole).toBe(
      "button",
    );
    expect(
      screen.getByLabelText("Increase target stroke rate by one stroke per minute"),
    ).toBeTruthy();
    expect(screen.getByLabelText("Apply resistance level").props.className).toContain("h-12");
  });

  it("marks elliptical controls disabled in auto mode", () => {
    renderNative(
      <EllipticalControlUI service={manualService} controlMode="auto" hasPlan={false} />,
    );

    const decreaseCadence = screen.getByLabelText("Decrease target cadence by 5 steps per minute");
    expect(decreaseCadence.props.accessibilityState).toEqual({ disabled: true });
    expect(decreaseCadence.props.disabled).toBe(true);
    expect(
      screen.getByLabelText("Apply target cadence in steps per minute").props.className,
    ).toContain("h-12");
  });
});
