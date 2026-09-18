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
  it("preserves a decimal draft through the numeric parent round trip", async () => {
    const { getByLabelText } = await renderNative(<WeightForm />);
    const input = getByLabelText("Weight");
    await fireEvent(input, "changeText", "70.");
    expect(input.props.value).toBe("70.");
    await fireEvent(input, "changeText", "70.25");
    expect(input.props.value).toBe("70.25");
    await fireEvent(input, "blur");
    expect(input.props.value).toBe("70.3");
  });

  it("replaces the draft on a unit change and supports clearing", async () => {
    const { getByLabelText, getByText } = await renderNative(<WeightForm />);
    const input = getByLabelText("Weight");
    await fireEvent(input, "changeText", "70.");
    await fireEvent.press(getByText("LBS"));
    expect(input.props.value).toBe("154.3");
    await fireEvent(input, "changeText", "");
    expect(input.props.value).toBe("");
  });
});
