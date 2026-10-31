import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaceInput } from "./index.web";
import type { PaceInputProps } from "./shared";

describe("PaceInput web", () => {
  afterEach(cleanup);
  it("keeps the MS string API and canonical seconds through controlled MS/HMS rerenders", () => {
    const change = vi.fn();
    const seconds = vi.fn();
    function Owner({ layout }: { layout: NonNullable<PaceInputProps["layout"]> }) {
      const [value, setValue] = useState("90:00");
      return (
        <PaceInput
          id="pace"
          label="Pace"
          layout={layout}
          value={value}
          onPaceSecondsChange={seconds}
          onChange={(next) => {
            setValue(next);
            change(next);
          }}
        />
      );
    }
    const view = render(<Owner layout="hms" />);
    fireEvent.change(screen.getByLabelText("Pace"), { target: { value: "91:00" } });
    fireEvent.blur(screen.getByLabelText("Pace"));
    expect(seconds).toHaveBeenLastCalledWith(5460);
    view.rerender(<Owner layout="ms" />);
    expect(screen.getByLabelText("Pace")).toHaveValue("91:00");
    fireEvent.change(screen.getByLabelText("Pace"), { target: { value: "91:30" } });
    view.rerender(<Owner layout="hms" />);
    fireEvent.blur(screen.getByLabelText("Pace"));
    expect(screen.getByLabelText("Pace")).toHaveValue("91:30");
    expect(seconds).toHaveBeenLastCalledWith(5490);
    expect(change.mock.calls).toEqual([["91:00"], ["91:30"]]);
  });
  it("rejects runtime HM configuration before producing any controlled output", () => {
    const change = vi.fn();
    const props: PaceInputProps = {
      id: "pace",
      label: "Pace",
      value: "91:00",
      layout: "ms",
      onChange: change,
    };
    Object.defineProperty(props, "layout", { value: "hm" });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() => render(<PaceInput {...props} />)).toThrow(/pace layout.*ms.*hms/i);
    } finally {
      error.mockRestore();
    }
    expect(change).not.toHaveBeenCalled();
  });

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
    expect(onBlur).not.toHaveBeenCalled();
  });
});
