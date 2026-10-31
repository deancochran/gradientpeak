import type { DurationSegmentLayout } from "@repo/core/utils/fitness-inputs";
import { useState } from "react";
import { Keyboard, Platform } from "react-native";
import { fireEvent, renderNative } from "../../test/render-native";
import { DurationInput } from "./index.native";

describe("DurationInput native picker overlay", () => {
  it("keeps incompatible source precision until a deliberate HM dial repair", async () => {
    const change = jest.fn();
    function Owner({ layout }: { layout: DurationSegmentLayout }) {
      const [value, setValue] = useState("1:30:45");
      return (
        <DurationInput
          label="Duration"
          layout={layout}
          value={value}
          onChange={(next) => {
            change(next);
            setValue(next);
          }}
        />
      );
    }
    const view = await renderNative(<Owner layout="hm" />);
    await fireEvent.press(view.getByLabelText("Duration"));
    expect(view.getByLabelText("Duration hours").props.selectedValue).toBe(1);
    await fireEvent.press(view.getByLabelText("Done Duration"));
    expect(view.getByLabelText("Duration").props.accessibilityValue.text).toBe("1:30:45");
    expect(change).not.toHaveBeenCalled();
    await view.rerender(<Owner layout="hms" />);
    await fireEvent.press(view.getByLabelText("Duration"));
    expect(view.getByLabelText("Duration seconds").props.selectedValue).toBe(45);
  });
  it("preserves incompatible HMS through HM close/reopen, restores HMS, and changes only on explicit correction", async () => {
    const change = jest.fn();
    function Owner({ layout }: { layout: DurationSegmentLayout }) {
      const [value, setValue] = useState("1:30:45");
      return (
        <DurationInput
          label="Duration"
          layout={layout}
          value={value}
          onChange={(next) => {
            change(next);
            setValue(next);
          }}
        />
      );
    }
    const view = await renderNative(<Owner layout="hms" />);
    await view.rerender(<Owner layout="hm" />);
    expect(view.getByLabelText("Duration").props.accessibilityValue.text).toBe("1:30:45");
    await fireEvent.press(view.getByLabelText("Duration"));
    expect(view.getByLabelText("Duration hours").props.selectedValue).toBe(1);
    expect(view.getByLabelText("Duration minutes").props.selectedValue).toBe(30);
    expect(view.queryAllByText(/Use whole-minute values/)).toHaveLength(0);
    expect(view.queryByLabelText("Duration seconds")).toBeNull();
    await fireEvent.press(view.getByLabelText("Done Duration"));
    expect(change).not.toHaveBeenCalled();
    expect(view.getByLabelText("Duration").props.accessibilityValue.text).toBe("1:30:45");
    await view.rerender(<Owner layout="hms" />);
    await fireEvent.press(view.getByLabelText("Duration"));
    expect(view.getByLabelText("Duration hours").props.selectedValue).toBe(1);
    expect(view.getByLabelText("Duration minutes").props.selectedValue).toBe(30);
    expect(view.getByLabelText("Duration seconds").props.selectedValue).toBe(45);
    expect(change).not.toHaveBeenCalled();
    await view.rerender(<Owner layout="hm" />);
    await fireEvent.press(view.getByLabelText("Duration"));
    await fireEvent(view.getByLabelText("Duration minutes"), "valueChange", 31);
    expect(change).toHaveBeenLastCalledWith("1:31:00");
    expect(view.queryAllByText(/Use whole-minute values/)).toHaveLength(0);
    await fireEvent.press(view.getByLabelText("Done Duration"));
    await view.rerender(<Owner layout="hms" />);
    await fireEvent.press(view.getByLabelText("Duration"));
    expect(view.getByLabelText("Duration seconds").props.selectedValue).toBe(0);
    expect(change).toHaveBeenCalledTimes(1);
  });
  it.each([
    "0:03:15",
    "0:25:42",
    "25:00:01",
  ])("opens configured wheels together without rewriting %s", async (value) => {
    const change = jest.fn();
    const view = await renderNative(
      <DurationInput label="Duration" value={value} onChange={change} />,
    );
    expect(view.queryByLabelText("Duration hours")).toBeNull();
    await fireEvent.press(view.getByLabelText("Duration"));
    for (const part of ["hours", "minutes", "seconds"])
      expect(view.getByLabelText(`Duration ${part}`).type).toBe("NativePicker");
    expect(Keyboard.dismiss).toHaveBeenCalled();
    expect(view.container.queryAll((node) => node.type === "TextInput")).toHaveLength(0);
    await fireEvent.press(view.getByLabelText("Done Duration"));
    expect(change).not.toHaveBeenCalled();
  });
  it("does not commit optional zeroes on open/close and retains a real 25m42s edit", async () => {
    const change = jest.fn();
    function Owner() {
      const [value, setValue] = useState("");
      return (
        <DurationInput
          label="Duration"
          value={value}
          onChange={(next) => {
            setValue(next);
            change(next);
          }}
        />
      );
    }
    const view = await renderNative(<Owner />);
    await fireEvent.press(view.getByLabelText("Duration"));
    // Empty optional durations begin at the native wheel's zero position, but
    // opening or closing it does not publish that invalid zero value.
    expect(view.getByLabelText("Duration seconds").props.selectedValue).toBe(0);
    expect(change).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Done Duration"));
    expect(change).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Duration"));
    await fireEvent(view.getByLabelText("Duration seconds"), "valueChange", 0);
    // The zero-positioned wheel is not an authored value until a segment
    // actually changes, so this must not save an invalid required-zero state.
    expect(change).not.toHaveBeenCalled();
    expect(view.queryAllByRole("alert")).toHaveLength(0);
    await fireEvent(view.getByLabelText("Duration minutes"), "valueChange", 25);
    await fireEvent(view.getByLabelText("Duration seconds"), "valueChange", 42);
    await fireEvent.press(view.getByLabelText("Done Duration"));
    expect(change).toHaveBeenLastCalledWith("0:25:42");
    await fireEvent.press(view.getByLabelText("Duration"));
    await fireEvent.press(view.getByLabelText("Clear Duration"));
    expect(change).toHaveBeenLastCalledWith("");
  });
  it("shows zero as invalid without forcing one or trapping sibling correction", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <DurationInput label="Duration" value="0:00:00" required onChange={change} />,
    );
    await fireEvent.press(view.getByLabelText("Duration"));
    expect(view.getByLabelText("Duration seconds").type).toBe("NativePicker");
    expect(change).not.toHaveBeenCalled();
    await fireEvent(view.getByLabelText("Duration seconds"), "valueChange", 1);
    expect(change).toHaveBeenCalledWith("0:00:01");
  });
  it("keeps a required zero editor open on Done and restores an edited overlay on Cancel", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <DurationInput label="Duration" value="0:00:00" required onChange={change} />,
    );
    await fireEvent.press(view.getByLabelText("Duration"));
    await fireEvent.press(view.getByLabelText("Done Duration"));
    expect(view.getByLabelText("Duration seconds")).toBeTruthy();
    expect(view.getAllByRole("alert")).not.toHaveLength(0);
    await fireEvent(view.getByLabelText("Duration seconds"), "valueChange", 5);
    await fireEvent.press(view.getByLabelText("Cancel Duration"));
    expect(change).toHaveBeenLastCalledWith("0:00:00");
  });
  it("preserves 1:30:00 as 90:00 with MS and reconfigures without losing time", async () => {
    const change = jest.fn();
    const props = { label: "Test time", value: "1:30:00", onChange: change };
    const view = await renderNative(<DurationInput {...props} layout="ms" />);
    await fireEvent.press(view.getByLabelText("Test time"));
    expect(view.queryByLabelText("Test time hours")).toBeNull();
    expect(view.getByLabelText("Test time minutes").props.selectedValue).toBe(90);
    await view.rerender(<DurationInput {...props} layout="hms" />);
    await fireEvent.press(view.getByLabelText("Test time"));
    expect(view.getByLabelText("Test time hours").props.selectedValue).toBe(1);
    expect(view.getByLabelText("Test time minutes").props.selectedValue).toBe(30);
    expect(change).not.toHaveBeenCalled();
  });
  it("retains malformed values in repair fields and does not open while disabled", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <DurationInput
        id="duration"
        testId="field"
        label="Duration"
        value="1:bad"
        onChange={change}
        disabled
      />,
    );
    await fireEvent.press(view.getByTestId("field"));
    expect(view.queryByLabelText("Duration seconds")).toBeNull();
    await view.rerender(
      <DurationInput
        id="duration"
        testId="field"
        label="Duration"
        value="1:bad"
        onChange={change}
      />,
    );
    await fireEvent.press(view.getByTestId("field"));
    expect(view.getByLabelText("Duration seconds").props.selectedValue).toBe("1:bad");
    expect(view.queryAllByText(/Enter a valid duration/)).toHaveLength(0);
    await fireEvent(view.getByLabelText("Duration seconds"), "valueChange", 1);
    expect(change).toHaveBeenLastCalledWith("0:00:01");
    await fireEvent.press(view.getByLabelText("Done Duration"));
    expect(change).toHaveBeenCalledWith("0:00:01");
  });
  it("uses supported grouped Android Spinner dropdowns rather than claiming iOS wheels", async () => {
    Platform.OS = "android";
    try {
      const view = await renderNative(
        <DurationInput label="Duration" value="0:25:42" onChange={jest.fn()} />,
      );
      await fireEvent.press(view.getByLabelText("Duration"));
      for (const part of ["hours", "minutes", "seconds"])
        expect(view.getByLabelText(`Duration ${part}`).props.mode).toBe("dropdown");
    } finally {
      Platform.OS = "ios";
    }
  });
});
