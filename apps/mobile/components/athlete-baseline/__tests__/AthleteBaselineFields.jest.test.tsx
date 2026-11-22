import type { NumericInputResult } from "@repo/core/utils/numeric-ux-policy";
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
  onInputResult?: (result: NumericInputResult) => void;
  min?: number;
  max?: number;
  decimals?: number;
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
  BoundedNumberInput: ({
    id,
    onChange,
    onNumberChange,
    onInputResult,
    value,
    ...props
  }: MockHostProps) =>
    React.createElement("TextInput", {
      ...props,
      testID: id,
      value,
      onChangeText: (text: string) => {
        const { parseNumericInput } = jest.requireActual<
          typeof import("@repo/core/utils/numeric-ux-policy")
        >("@repo/core/utils/numeric-ux-policy");
        const result = parseNumericInput(text, {
          min: props.min,
          max: props.max,
          precision: props.decimals === 0 ? "integer" : "decimal",
        });
        onChange?.(text);
        onInputResult?.(result);
        if (result.status === "valid") onNumberChange?.(result.value);
        else if (result.status === "empty") onNumberChange?.(undefined);
      },
    }),
}));

jest.mock("@repo/ui/components/button", () => ({
  __esModule: true,
  Button: ({ children, onPress, testId, ...props }: MockHostProps) => {
    const ReactActual = jest.requireActual<typeof import("react")>("react");
    return ReactActual.createElement(
      "Pressable",
      { ...props, onPress, testID: testId },
      ReactActual.Children.map(children, (child) =>
        typeof child === "string" || typeof child === "number"
          ? ReactActual.createElement("Text", null, String(child))
          : child,
      ),
    );
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
        sources={sources}
        estimates={{ maxHr: 185 }}
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
  it("propagates malformed optional numeric input without reverting to an earlier value", async () => {
    const onChange = jest.fn();
    await renderNative(
      <AthleteBaselineFields value={{ ...baseValue, restingHr: 52 }} onChange={onChange} />,
    );
    await fireEvent.changeText(screen.getByTestId("athlete-baseline-resting-hr"), "52bpm");
    expect(onChange).toHaveBeenLastCalledWith({
      field: "restingHr",
      value: Number.NaN,
      source: "manual",
    });
    await fireEvent.changeText(screen.getByTestId("athlete-baseline-resting-hr"), "");
    expect(onChange).toHaveBeenLastCalledWith({
      field: "restingHr",
      value: null,
      source: "cleared",
    });
  });
  it("does not expose performance-threshold controls", async () => {
    await renderNative(<AthleteBaselineFields value={baseValue} onChange={jest.fn()} />);

    expect(screen.queryByLabelText("Running threshold pace (Optional)")).toBeNull();
    expect(screen.queryByTestId("athlete-baseline-ftp")).toBeNull();
    expect(screen.queryByLabelText("Swimming threshold pace (Optional)")).toBeNull();
  });

  it("reports optional clears with an explicit cleared source", async () => {
    const onChange = jest.fn();
    await renderNative(
      <AthleteBaselineFields value={{ ...baseValue, restingHr: 52 }} onChange={onChange} />,
    );

    await fireEvent.changeText(screen.getByTestId("athlete-baseline-resting-hr"), "");
    expect(onChange).toHaveBeenCalledWith({ field: "restingHr", value: null, source: "cleared" });
  });

  it("describes excluded metric evidence without claiming it was cleared", async () => {
    await renderNative(
      <AthleteBaselineFields
        value={baseValue}
        onChange={jest.fn()}
        sources={{ restingHr: { kind: "cleared" } }}
      />,
    );

    expect(screen.getByText("Not used for this setup")).toBeTruthy();
    expect(screen.queryByText("Cleared")).toBeNull();
  });

  it("offers an honest setup-scoped exclusion action for metrics", async () => {
    const onChange = jest.fn();
    await renderNative(
      <AthleteBaselineFields value={{ ...baseValue, restingHr: 52 }} onChange={onChange} />,
    );

    expect(screen.getByText("Exclude from setup")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("athlete-baseline-restingHr-exclude"));
    expect(onChange).toHaveBeenCalledWith({
      field: "restingHr",
      value: null,
      source: "cleared",
    });
  });

  it("exposes experience and gender as labeled radio groups with checked state", async () => {
    await renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, experience: "intermediate", gender: "female" }}
        onChange={jest.fn()}
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

  it("uses a separate clear action instead of deselecting a checked radio", async () => {
    const onChange = jest.fn();
    await renderNative(
      <AthleteBaselineFields value={{ ...baseValue, gender: "female" }} onChange={onChange} />,
    );

    await fireEvent.press(screen.getByTestId("athlete-baseline-gender-female"));
    expect(onChange).toHaveBeenLastCalledWith({
      field: "gender",
      value: "female",
      source: "manual",
    });

    await fireEvent.press(screen.getByTestId("athlete-baseline-gender-clear"));
    expect(onChange).toHaveBeenLastCalledWith({ field: "gender", value: null, source: "cleared" });
  });

  it("marks reset-to-estimate as estimated rather than manual", async () => {
    const onChange = jest.fn();
    await renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, maxHr: 190 }}
        onChange={onChange}
        sources={{ maxHr: { kind: "manual" } }}
        estimates={{ maxHr: 185 }}
      />,
    );

    await fireEvent.press(screen.getByTestId("athlete-baseline-maxHr-reset-estimate"));
    expect(onChange).toHaveBeenCalledWith({ field: "maxHr", value: 185, source: "estimated" });
  });

  it("keeps kilograms canonical while editing in pounds", async () => {
    const onChange = jest.fn();
    await renderNative(
      <AthleteBaselineFields
        value={{ ...baseValue, weightDisplayUnit: "lbs" }}
        onChange={onChange}
      />,
    );

    await fireEvent.changeText(screen.getByTestId("athlete-baseline-weight"), "154.3");
    expect(onChange).toHaveBeenCalledWith({
      field: "weightKg",
      value: 154.3 / 2.20462,
      source: "manual",
    });
  });

  it("shows canonical kilogram feedback for out-of-range weight", async () => {
    await renderNative(<ControlledHarness />);

    await fireEvent.changeText(screen.getByTestId("athlete-baseline-weight"), "29.9");
    expect(screen.getByTestId("athlete-baseline-weight").props.error).toBe(
      "Enter a weight from 30 to 300 kg.",
    );

    await fireEvent.changeText(screen.getByTestId("athlete-baseline-weight"), "30");
    expect(screen.getByTestId("athlete-baseline-weight").props.error).toBeUndefined();
  });

  it("submits only the current non-threshold baseline contract", async () => {
    const onNext = jest.fn();
    await renderNative(<ControlledHarness onNext={onNext} />);

    await fireEvent.press(screen.getByTestId("athlete-baseline-next"));

    const submitted = onNext.mock.calls[0]?.[0];
    expect(submitted).not.toHaveProperty("ftp");
    expect(submitted).not.toHaveProperty("thresholdPaceSecondsPerKm");
    expect(submitted).not.toHaveProperty("cssSecondsPer100m");
  });
});
