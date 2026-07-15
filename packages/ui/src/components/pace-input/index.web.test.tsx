import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaceInput } from "./index.web";

describe("PaceInput web", () => {
  afterEach(cleanup);

  it("forwards form, test, accessibility, disabled, and blur semantics", () => {
    const onBlur = vi.fn();
    const onChange = vi.fn();
    render(
      <PaceInput
        disabled
        error="Invalid pace"
        helperText="Pace help"
        id="pace"
        label="Pace"
        name="pace"
        onBlur={onBlur}
        onChange={onChange}
        required
        testId="pace-input"
        value="4:30"
      />,
    );
    const input = screen.getByTestId("pace-input");

    fireEvent.change(input, { target: { value: "5:00" } });
    fireEvent.blur(input);

    expect(input).toHaveAttribute("name", "pace");
    expect(input).toBeDisabled();
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Pace help Adjust this field: Invalid pace");
    expect(onChange).not.toHaveBeenCalled();
    expect(onBlur).toHaveBeenCalled();
  });
});
