import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NumberSliderInput } from "./index.web";

describe("NumberSliderInput exact-only presentation", () => {
  it("hides the optional slider and retains invalid exact input until corrected", () => {
    const change = vi.fn();
    const invalid = vi.fn();
    render(
      <NumberSliderInput
        compactHeader
        inlineValueEditor
        showSlider={false}
        label="Effort"
        min={1}
        max={10}
        value={5.1234}
        onChange={change}
        onExactValueInvalidChange={invalid}
      />,
    );
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /Increase|Decrease/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Effort: 5.1234" }));
    const input = screen.getByLabelText("Effort exact value");
    fireEvent.change(input, { target: { value: "bad" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("bad");
    expect(change).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenLastCalledWith(true);
    fireEvent.change(input, { target: { value: "5.5" } });
    expect(change).toHaveBeenCalledWith(5.5);
  });
});
