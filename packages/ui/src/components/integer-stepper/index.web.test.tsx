import { cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderWeb, screen } from "../../test/render-web";
import { IntegerStepper } from "./index.web";

describe("IntegerStepper web", () => {
  afterEach(cleanup);

  it("disables boundary actions and exposes spinbutton semantics", () => {
    const onChange = vi.fn();
    renderWeb(
      <IntegerStepper
        id="sessions"
        label="Sessions"
        max={2}
        min={0}
        onChange={onChange}
        value={0}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "Sessions" });
    const decrease = screen.getByRole("button", { name: "-" });
    const increase = screen.getByRole("button", { name: "+" });

    expect(decrease).toBeDisabled();
    expect(increase).toBeEnabled();
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("aria-valuemin", "0");
    expect(input).toHaveAttribute("aria-valuemax", "2");
    expect(input).toHaveAttribute("aria-valuenow", "0");

    fireEvent.click(decrease);
    fireEvent.click(increase);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(1);
  });

  it("uses bounded arrow keys and current valid drafts", () => {
    const onChange = vi.fn();
    renderWeb(
      <IntegerStepper
        id="sessions"
        label="Sessions"
        max={5}
        min={0}
        onChange={onChange}
        value={1}
      />,
    );
    const input = screen.getByRole("spinbutton", { name: "Sessions" });

    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    fireEvent.keyDown(input, { key: "ArrowDown" });

    expect(onChange.mock.calls).toEqual([[4], [5], [4]]);
    expect(input).toHaveValue("4");
  });

  it("rejects malformed integer drafts on blur", () => {
    const onChange = vi.fn();
    renderWeb(<IntegerStepper id="sessions" label="Sessions" onChange={onChange} value={1} />);
    const input = screen.getByRole("spinbutton", { name: "Sessions" });

    fireEvent.change(input, { target: { value: "1abc" } });
    fireEvent.blur(input);

    expect(onChange).not.toHaveBeenCalled();
    expect(input).toHaveValue("1abc");
  });

  it("disables every control when disabled", () => {
    const { getByRole } = renderWeb(
      <IntegerStepper disabled id="sessions" label="Sessions" onChange={vi.fn()} value={1} />,
    );

    const input = getByRole("spinbutton", { name: "Sessions" });
    expect(input).toBeDisabled();
    expect(getByRole("button", { name: "-" })).toBeDisabled();
    expect(getByRole("button", { name: "+" })).toBeDisabled();

    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("1");
  });

  it("connects custom hints, descriptions, and errors", () => {
    renderWeb(
      <IntegerStepper
        accessibilityHint="Weekly target"
        error="Too high"
        helperText="Choose a value"
        id="sessions"
        label="Sessions"
        onChange={vi.fn()}
        value={1}
      />,
    );

    const input = screen.getByRole("spinbutton", { name: "Sessions" });
    expect(input).toHaveAttribute("aria-description", "Weekly target");
    expect(input).toHaveAccessibleDescription("Choose a value Too high");
  });
});
