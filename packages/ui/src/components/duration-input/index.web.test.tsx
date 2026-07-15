import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurationInput } from "./index.web";

describe("DurationInput web", () => {
  afterEach(cleanup);

  it("forwards form, test, accessibility, and blur semantics", () => {
    const onBlur = vi.fn();
    render(
      <DurationInput
        error="Invalid duration"
        helperText="Duration help"
        id="duration"
        label="Duration"
        name="duration"
        onBlur={onBlur}
        onChange={vi.fn()}
        required
        testId="duration-input"
        value="0:20:00"
      />,
    );
    const input = screen.getByTestId("duration-input");

    fireEvent.blur(input);

    expect(input).toHaveAttribute("name", "duration");
    expect(input).toBeRequired();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Duration help Adjust this field: Invalid duration");
    expect(onBlur).toHaveBeenCalled();
  });
});
