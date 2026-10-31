import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BoundedNumberInput } from "./index.web";

afterEach(cleanup);

function NumericParent() {
  const [value, setValue] = useState<number | undefined>();
  return (
    <>
      <BoundedNumberInput
        id="quantity"
        label="Quantity"
        min={10}
        max={100}
        decimals={2}
        value={value === undefined ? "" : String(value)}
        onChange={() => undefined}
        onNumberChange={setValue}
      />
      <button type="button" onClick={() => setValue(42)}>
        Reset quantity
      </button>
    </>
  );
}

describe("BoundedNumberInput web editing", () => {
  it("preserves exact precision in non-clamping mode and keeps blank distinct from zero", () => {
    const onNumberChange = vi.fn();
    render(
      <BoundedNumberInput
        id="exact"
        label="Exact"
        value=""
        min={0}
        max={100}
        decimals={2}
        clampProjection={false}
        onChange={vi.fn()}
        onNumberChange={onNumberChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Exact" });
    fireEvent.change(input, { target: { value: "14.444" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("14.444");
    expect(onNumberChange).toHaveBeenLastCalledWith(14.444);
    fireEvent.change(input, { target: { value: "" } });
    expect(onNumberChange).toHaveBeenLastCalledWith(undefined);
    fireEvent.change(input, { target: { value: "0" } });
    expect(onNumberChange).toHaveBeenLastCalledWith(0);
  });
  it("preserves a partial decimal through a numeric parent echo and normalizes on blur", () => {
    render(<NumericParent />);
    const input = screen.getByRole("textbox", { name: "Quantity" });
    fireEvent.change(input, { target: { value: "1." } });
    expect(input).toHaveValue("1.");
    fireEvent.change(input, { target: { value: "12.50" } });
    expect(input).toHaveValue("12.50");
    fireEvent.blur(input);
    expect(input).toHaveValue("12.5");
  });

  it("accepts external replacement and clearing after a partial draft", () => {
    render(<NumericParent />);
    const input = screen.getByRole("textbox", { name: "Quantity" });
    fireEvent.change(input, { target: { value: "1." } });
    fireEvent.click(screen.getByRole("button", { name: "Reset quantity" }));
    expect(input).toHaveValue("42");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
  });

  it("retains out-of-range text without publishing a clamped value", () => {
    const onNumberChange = vi.fn();
    render(
      <BoundedNumberInput
        id="quantity"
        label="Quantity"
        value=""
        min={10}
        max={100}
        onChange={() => undefined}
        onNumberChange={onNumberChange}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Quantity" });
    fireEvent.change(input, { target: { value: "1" } });
    expect(onNumberChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("1");
    fireEvent.blur(input);
    expect(onNumberChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("1");
    expect(input).toHaveAttribute("inputmode", "decimal");
  });

  it("nudges an off-grid value to adjacent anchored adjustments without rewriting typed precision", () => {
    const onNumberChange = vi.fn();
    render(
      <BoundedNumberInput
        adjustmentStep={5}
        id="power"
        label="Power"
        max={500}
        min={0}
        onChange={() => undefined}
        onNumberChange={onNumberChange}
        showAdjustmentButtons
        value="153"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Increase Power" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease Power" }));

    expect(onNumberChange).toHaveBeenNthCalledWith(1, 155);
    expect(onNumberChange).toHaveBeenNthCalledWith(2, 150);
  });

  it("can reject out-of-range drafts instead of projecting a clamped value", () => {
    const onNumberChange = vi.fn();
    const onInvalidChange = vi.fn();
    render(
      <BoundedNumberInput
        clampProjection={false}
        id="watts"
        label="Watts"
        max={2000}
        min={1}
        onChange={() => undefined}
        onInvalidChange={onInvalidChange}
        onNumberChange={onNumberChange}
        value=""
      />,
    );
    const input = screen.getByRole("textbox", { name: "Watts" });
    fireEvent.change(input, { target: { value: "-1" } });
    expect(input).toHaveValue("-1");
    expect(onNumberChange).not.toHaveBeenCalled();
    expect(onInvalidChange).toHaveBeenLastCalledWith(true);
  });
});
