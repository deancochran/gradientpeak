import { cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWeb, screen } from "../../test/render-web";
import { WeightInputField } from "./index.web";

afterEach(cleanup);

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

describe("WeightInputField web editing", () => {
  it("preserves raw text through storage rounding and normalizes only on blur", () => {
    renderWeb(<WeightForm />);
    const input = screen.getByRole("textbox", { name: "Weight" });
    fireEvent.change(input, { target: { value: "70." } });
    expect(input).toHaveValue("70.");
    fireEvent.change(input, { target: { value: "70.25" } });
    expect(input).toHaveValue("70.25");
    fireEvent.blur(input);
    expect(input).toHaveValue("70.25");
  });

  it("replaces the draft when units change without emitting a new canonical value", () => {
    const onChangeKg = vi.fn();
    function Form() {
      const [weight, setWeight] = useState<number | null>(70);
      const [unit, setUnit] = useState<"kg" | "lbs">("kg");
      return (
        <WeightInputField
          label="Weight"
          valueKg={weight}
          unit={unit}
          onChangeKg={(value) => {
            onChangeKg(value);
            setWeight(value);
          }}
          onUnitChange={setUnit}
        />
      );
    }
    renderWeb(<Form />);
    const input = screen.getByRole("textbox", { name: "Weight" });
    fireEvent.change(input, { target: { value: "70." } });
    expect(onChangeKg).toHaveBeenLastCalledWith(70);
    onChangeKg.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "LBS" }));
    expect(input).toHaveValue("154.32");
    expect(onChangeKg).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(onChangeKg).toHaveBeenLastCalledWith(null);
  });
});
