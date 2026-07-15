import React from "react";
import { Pressable } from "react-native";
import { createHost } from "../../../test/mock-components";
import { fireEvent, renderNative, screen } from "../../../test/render-native";
import {
  type AthleteBaselineChange,
  type AthleteBaselineFieldSources,
  AthleteBaselineFields,
  type AthleteBaselineValue,
} from "../AthleteBaselineFields";

type MockHostProps = Record<string, unknown> & {
  children?: React.ReactNode;
  id?: string;
  onChange?: (value: string | undefined) => void;
  onChangeSeconds?: (value: number | null) => void;
  onNumberChange?: (value: number | undefined) => void;
  onPress?: () => void;
  testId?: string;
  value?: string | number | null;
  valueSeconds?: number | null;
};

jest.mock("react-native", () => ({
  __esModule: true,
  ...jest.requireActual("@repo/ui/test/react-native"),
  TouchableOpacity: ({ children, onPress, ...props }: MockHostProps) =>
    React.createElement("Pressable", { ...props, onPress }, children),
  View: createHost("View"),
}));

jest.mock("@repo/ui/components/bounded-number-input", () => ({
  __esModule: true,
  BoundedNumberInput: ({ id, onChange, onNumberChange, value, ...props }: MockHostProps) =>
    React.createElement("TextInput", {
      ...props,
      testID: id,
      value,
      onChangeText: (text: string) => {
        onChange?.(text);
        onNumberChange?.(text.trim() ? Number(text) : undefined);
      },
    }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, onPress, testId, ...props }: MockHostProps) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    return ReactActual.createElement("Pressable", { ...props, onPress, testID: testId }, children);
  },
}));
jest.mock("@repo/ui/components/date-input", () => ({
  __esModule: true,
  DateInput: ({ id, onChange, value, ...props }: MockHostProps) =>
    React.createElement("TextInput", {
      ...props,
      testID: id,
      value,
      onChangeText: (text: string) => onChange?.(text || undefined),
    }),
}));
jest.mock("@repo/ui/components/icon", () => ({ __esModule: true, Icon: createHost("Icon") }));
jest.mock("@repo/ui/components/text", () => ({ __esModule: true, Text: createHost("Text") }));
jest.mock("lucide-react-native", () => ({ __esModule: true, Check: createHost("Check") }));

const baseValue: AthleteBaselineValue = {
  experience: null,
  dob: null,
  gender: null,
  weightKg: null,
  weightDisplayUnit: "kg",
  maxHr: null,
  restingHr: null,
  ftp: null,
  thresholdPaceSecondsPerKm: null,
  cssSecondsPer100m: null,
};

function ControlledHarness({
  initialSources = {},
  initialValue = {},
  onNext,
}: {
  initialSources?: AthleteBaselineFieldSources;
  initialValue?: Partial<AthleteBaselineValue>;
  onNext?: (value: AthleteBaselineValue) => void;
}) {
  const [value, setValue] = React.useState({ ...baseValue, ...initialValue });
  const [sources, setSources] = React.useState(initialSources);
  const handleChange = (change: AthleteBaselineChange) => {
    setValue((current) => ({ ...current, [change.field]: change.value }));
    setSources((current) => ({ ...current, [change.field]: { kind: change.source } }));
  };

  return (
    <>
      <AthleteBaselineFields
        value={value}
        onChange={handleChange}
        visibleSports={["cycling", "running", "swimming"]}
        sources={sources}
        estimates={{ maxHr: 185, ftp: 210 }}
      />
      {onNext ? (
        <Pressable testID="athlete-baseline-next" onPress={() => onNext(value)}>
          Next
        </Pressable>
      ) : null}
    </>
  );
}

describe("AthleteBaselineFields", () => {
  it("progressively discloses sport-specific semantic fields", () => {
    const { rerender } = renderNative(
      <AthleteBaselineFields value={baseValue} onChange={jest.fn()} visibleSports={["running"]} />,
    );

    expect(screen.getByLabelText("Running threshold pace (Optional)")).toBeTruthy();
    expect(screen.queryByTestId("athlete-baseline-ftp")).toBeNull();
    expect(screen.queryByLabelText("Swim CSS (Optional)")).toBeNull();

    rerender(
      <AthleteBaselineFields
        value={baseValue}
        onChange={jest.fn()}
        visibleSports={["cycling", "swimming"]}
      />,
    );
    expect(screen.getByTestId("athlete-baseline-ftp")).toBeTruthy();
    expect(screen.getByLabelText("Swim CSS (Optional)")).toBeTruthy();
    expect(screen.queryByLabelText("Running threshold pace (Optional)")).toBeNull();
  });

  it("reports optional clears with an explicit cleared source", () => {
    const onChange = jest.fn();
    renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, restingHr: 52 }}
        onChange={onChange}
        visibleSports={[]}
      />,
    );

    fireEvent.changeText(screen.getByTestId("athlete-baseline-resting-hr"), "");
    expect(onChange).toHaveBeenCalledWith({ field: "restingHr", value: null, source: "cleared" });
  });

  it("describes excluded metric evidence without claiming it was cleared", () => {
    renderNative(
      <AthleteBaselineFields
        value={baseValue}
        onChange={jest.fn()}
        visibleSports={[]}
        sources={{ restingHr: { kind: "cleared" } }}
      />,
    );

    expect(screen.getByText("Not used for this setup")).toBeTruthy();
    expect(screen.queryByText("Cleared")).toBeNull();
  });

  it("offers an honest setup-scoped exclusion action for metrics", () => {
    const onChange = jest.fn();
    renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, restingHr: 52 }}
        onChange={onChange}
        visibleSports={[]}
      />,
    );

    expect(screen.getByText("Exclude from setup")).toBeTruthy();
    fireEvent.press(screen.getByTestId("athlete-baseline-restingHr-exclude"));
    expect(onChange).toHaveBeenCalledWith({
      field: "restingHr",
      value: null,
      source: "cleared",
    });
  });

  it("exposes experience and gender as labeled radio groups with checked state", () => {
    renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, experience: "intermediate", gender: "female" }}
        onChange={jest.fn()}
        visibleSports={[]}
      />,
    );

    expect(screen.getByTestId("athlete-baseline-experience-group").props).toMatchObject({
      accessibilityLabel: "Experience (Optional) options",
      accessibilityRole: "radiogroup",
    });
    expect(screen.getByTestId("athlete-baseline-experience-intermediate").props).toMatchObject({
      accessibilityLabel: "Experience (Optional): intermediate",
      accessibilityRole: "radio",
      accessibilityState: { checked: true },
    });
    expect(screen.getByTestId("athlete-baseline-experience-beginner").props).toMatchObject({
      accessibilityRole: "radio",
      accessibilityState: { checked: false },
    });
    expect(screen.getByTestId("athlete-baseline-gender-female").props).toMatchObject({
      accessibilityLabel: "Gender (Optional): female",
      accessibilityRole: "radio",
      accessibilityState: { checked: true },
    });
    expect(screen.getByTestId("athlete-baseline-gender-male").props).toMatchObject({
      accessibilityRole: "radio",
      accessibilityState: { checked: false },
    });
  });

  it("uses a separate clear action instead of deselecting a checked radio", () => {
    const onChange = jest.fn();
    renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, gender: "female" }}
        onChange={onChange}
        visibleSports={[]}
      />,
    );

    fireEvent.press(screen.getByTestId("athlete-baseline-gender-female"));
    expect(onChange).toHaveBeenLastCalledWith({
      field: "gender",
      value: "female",
      source: "manual",
    });

    fireEvent.press(screen.getByTestId("athlete-baseline-gender-clear"));
    expect(onChange).toHaveBeenLastCalledWith({ field: "gender", value: null, source: "cleared" });
  });

  it("replaces an imported label with explicit manual provenance after an edit", () => {
    renderNative(
      <ControlledHarness
        initialValue={{ ftp: 245 }}
        initialSources={{ ftp: { kind: "imported", label: "Wahoo" } }}
      />,
    );
    expect(screen.getByText("Imported from Wahoo")).toBeTruthy();

    fireEvent.changeText(screen.getByTestId("athlete-baseline-ftp"), "260");
    expect(screen.getByText("Manual")).toBeTruthy();
    expect(screen.queryByText("Imported from Wahoo")).toBeNull();
  });

  it("marks reset-to-estimate as estimated rather than manual", () => {
    const onChange = jest.fn();
    renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, maxHr: 190 }}
        onChange={onChange}
        visibleSports={[]}
        sources={{ maxHr: { kind: "manual" } }}
        estimates={{ maxHr: 185 }}
      />,
    );

    fireEvent.press(screen.getByTestId("athlete-baseline-maxHr-reset-estimate"));
    expect(onChange).toHaveBeenCalledWith({ field: "maxHr", value: 185, source: "estimated" });
  });

  it("keeps kilograms canonical while editing in pounds", () => {
    const onChange = jest.fn();
    renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, weightDisplayUnit: "lbs" }}
        onChange={onChange}
        visibleSports={[]}
      />,
    );

    fireEvent.changeText(screen.getByTestId("athlete-baseline-weight"), "154.3");
    expect(onChange).toHaveBeenCalledWith({ field: "weightKg", value: 70, source: "manual" });
  });

  it("shows canonical kilogram feedback for out-of-range weight", () => {
    renderNative(<ControlledHarness />);

    fireEvent.changeText(screen.getByTestId("athlete-baseline-weight"), "29.9");
    expect(screen.getByTestId("athlete-baseline-weight").props.error).toBe(
      "Enter a weight from 30 to 300 kg.",
    );

    fireEvent.changeText(screen.getByTestId("athlete-baseline-weight"), "30");
    expect(screen.getByTestId("athlete-baseline-weight").props.error).toBeUndefined();
  });

  it("captures valid running and swimming pace edits before Next without blur", () => {
    const onNext = jest.fn();
    renderNative(<ControlledHarness onNext={onNext} />);

    fireEvent.changeText(screen.getByLabelText("Running threshold pace (Optional)"), "4:30");
    fireEvent.changeText(screen.getByLabelText("Swim CSS (Optional)"), "1:45");
    fireEvent.press(screen.getByTestId("athlete-baseline-next"));

    expect(onNext).toHaveBeenCalledWith(
      expect.objectContaining({
        thresholdPaceSecondsPerKm: 270,
        cssSecondsPer100m: 105,
      }),
    );
  });
});
