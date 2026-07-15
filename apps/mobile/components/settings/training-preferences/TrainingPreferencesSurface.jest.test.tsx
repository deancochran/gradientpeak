import { act } from "@testing-library/react-native";
import { createHost } from "../../../test/mock-components";
import { renderNative, screen } from "../../../test/render-native";
import type { CompactTrainingPreferencesValue } from "./compactTrainingPreferences";
import { TrainingPreferencesSurface } from "./TrainingPreferencesSurface";

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  ScrollView: createHost("ScrollView"),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: createHost("Button"),
}));

jest.mock("@repo/ui/components/integer-stepper", () => ({
  __esModule: true,
  IntegerStepper: ({ testId, ...props }: { testId?: string; [key: string]: unknown }) => {
    const React = require("react");
    return React.createElement("IntegerStepper", { ...props, testID: testId });
  },
}));

jest.mock("@repo/ui/components/text", () => ({
  __esModule: true,
  Text: createHost("Text"),
}));

const compactValue: CompactTrainingPreferencesValue = {
  preset: "balanced",
  minSessionsPerWeek: 2,
  maxSessionsPerWeek: 6,
  maxSingleSessionMinutes: 180,
  maxWeeklyMinutes: 420,
};

describe("TrainingPreferencesSurface compact presentation", () => {
  it("renders only compact controls and a concise summary", () => {
    renderNative(
      <TrainingPreferencesSurface
        presentation="compact"
        value={compactValue}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByTestId("training-preferences-compact")).toBeTruthy();
    expect(screen.getByTestId("training-preferences-preset-balanced")).toBeTruthy();
    expect(screen.getByTestId("training-preferences-compact-min-sessions").props.value).toBe(2);
    expect(screen.getByTestId("training-preferences-compact-max-sessions").props.value).toBe(6);
    expect(screen.getByTestId("training-preferences-compact-max-single-session").props.value).toBe(
      180,
    );
    expect(screen.getByTestId("training-preferences-compact-max-weekly").props.value).toBe(420);
    expect(screen.queryByTestId("training-preferences-tab-baseline-fitness")).toBeNull();
  });

  it("emits controlled preset and dose-limit changes", () => {
    const onChange = jest.fn();
    renderNative(
      <TrainingPreferencesSurface
        presentation="compact"
        value={compactValue}
        onChange={onChange}
      />,
    );

    act(() => {
      screen.getByTestId("training-preferences-preset-safer").props.onPress();
    });
    expect(onChange).toHaveBeenLastCalledWith({ preset: "safer" });

    act(() => {
      screen.getByTestId("training-preferences-compact-max-weekly").props.onChange(480);
    });
    expect(onChange).toHaveBeenLastCalledWith({ maxWeeklyMinutes: 480 });
  });

  it("exposes presets as a labeled native radio group", () => {
    renderNative(
      <TrainingPreferencesSurface
        presentation="compact"
        value={compactValue}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByTestId("training-preferences-preset-group").props).toMatchObject({
      accessibilityLabel: "Training approach options",
      accessibilityRole: "radiogroup",
    });
    expect(screen.getByTestId("training-preferences-preset-balanced").props).toMatchObject({
      accessibilityLabel: "Balanced training approach",
      accessibilityRole: "radio",
      accessibilityState: { checked: true },
    });
    expect(screen.getByTestId("training-preferences-preset-safer").props).toMatchObject({
      accessibilityLabel: "Safer training approach",
      accessibilityRole: "radio",
      accessibilityState: { checked: false },
    });
  });
});
