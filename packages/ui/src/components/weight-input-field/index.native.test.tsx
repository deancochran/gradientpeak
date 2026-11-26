import { useState } from "react";
import { fireEvent, renderNative } from "../../test/render-native";
import { WeightInputField } from "./index.native";

function WeightForm() {
  const [weight, setWeight] = useState<number | null>(null);
  const [unit, setUnit] = useState<"kg" | "lbs">("kg");
  return (
    <WeightInputField
      id="weight"
      label="Weight"
      valueKg={weight}
      unit={unit}
      onChangeKg={setWeight}
      onUnitChange={setUnit}
    />
  );
}

describe("WeightInputField native editing", () => {
  it("selects an exact decimal weight with the native dial", async () => {
    const { getByLabelText } = await renderNative(<WeightForm />);
    const input = getByLabelText("Weight");
    await fireEvent.press(input);
    await fireEvent(getByLabelText("Weight kg"), "valueChange", 70);
    await fireEvent(getByLabelText("Weight Fractional kg"), "valueChange", "25");
    expect(getByLabelText("Weight").props.accessibilityValue).toEqual({ text: "70.25" });
  });

  it("keeps its configured unit static and supports clearing", async () => {
    const { getByLabelText, queryByText } = await renderNative(<WeightForm />);
    const input = getByLabelText("Weight");
    await fireEvent.press(input);
    expect(queryByText("LBS")).toBeNull();
    await fireEvent(getByLabelText("Weight kg"), "valueChange", 70);
    await fireEvent.press(getByLabelText("Clear Weight"));
    expect(getByLabelText("Weight").props.accessibilityValue).toEqual({ text: "Not set" });
  });
});
