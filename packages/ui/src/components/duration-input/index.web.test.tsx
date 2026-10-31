import type { DurationSegmentLayout } from "@repo/core/utils/fitness-inputs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DurationInput } from "./index.web";

describe("DurationInput web", () => {
  afterEach(cleanup);
  it("retains the original HMS string through an incompatible HM configuration until explicit correction", () => {
    const change = vi.fn();
    const seconds = vi.fn();
    function Owner({ layout }: { layout: DurationSegmentLayout }) {
      const [value, setValue] = useState("1:30:45");
      return (
        <DurationInput
          id="duration"
          label="Duration"
          layout={layout}
          value={value}
          onDurationSecondsChange={seconds}
          onChange={(next) => {
            change(next);
            setValue(next);
          }}
        />
      );
    }
    const view = render(<Owner layout="hms" />);
    view.rerender(<Owner layout="hm" />);
    const input = screen.getByLabelText("Duration");
    expect(input).toHaveValue("1:30:45");
    expect(input).toHaveAccessibleDescription(expect.stringContaining("whole-minute"));
    expect(input).toHaveAccessibleDescription(expect.stringContaining("1:30:45"));
    fireEvent.blur(input);
    expect(change).not.toHaveBeenCalled();
    expect(seconds).not.toHaveBeenCalled();
    view.rerender(<Owner layout="hms" />);
    expect(input).toHaveValue("1:30:45");
    expect(input).toHaveAttribute("aria-invalid", "false");
    view.rerender(<Owner layout="hm" />);
    fireEvent.change(input, { target: { value: "1:31" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("1:31:00");
    expect(input).toHaveAttribute("aria-invalid", "false");
    expect(seconds).toHaveBeenLastCalledWith(5460);
    view.rerender(<Owner layout="hms" />);
    fireEvent.blur(input);
    expect(input).toHaveValue("1:31:00");
  });

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
