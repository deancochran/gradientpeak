import { useState } from "react";
import { fireEvent, renderNative } from "../../test/render-native";
import { PaceInput } from "./index.native";
import type { PaceInputProps } from "./shared";

describe("PaceInput native picker overlay", () => {
  it("uses one labelled row with an accessible pace unit", async () => {
    const view = await renderNative(
      <PaceInput
        label="Target pace"
        triggerVariant="row"
        value="6:00"
        unitLabel="/km"
        onChange={jest.fn()}
      />,
    );
    const trigger = view.getByLabelText("Target pace");
    expect(trigger.props.accessibilityValue.text).toBe("6:00 /km");
    expect(view.getAllByText("Target pace")).toHaveLength(1);
    expect(view.getByText("6:00 /km")).toBeTruthy();
  });

  it("renders pace segments in an owner-provided surface without opening its own overlay", async () => {
    const view = await renderNative(
      <PaceInput label="Pace" value="4:05" presentation="native" onChange={jest.fn()} />,
    );

    expect(view.getByLabelText("Pace minutes").props.selectedValue).toBe(4);
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe(5);
    expect(view.queryByLabelText("Done Pace")).toBeNull();
  });

  it("round-trips controlled HMS/MS changes without reinterpreting canonical minutes as hours", async () => {
    const change = jest.fn();
    function Owner({ layout }: { layout: NonNullable<PaceInputProps["layout"]> }) {
      const [value, setValue] = useState("90:00");
      return (
        <PaceInput
          label="Pace"
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
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.getByLabelText("Pace hours").props.selectedValue).toBe(1);
    await fireEvent(view.getByLabelText("Pace minutes"), "valueChange", 31);
    expect(change).toHaveBeenLastCalledWith("91:00");
    expect(view.getByLabelText("Pace hours").props.selectedValue).toBe(1);
    expect(view.getByLabelText("Pace minutes").props.selectedValue).toBe(31);
    await view.rerender(<Owner layout="ms" />);
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.queryByLabelText("Pace hours")).toBeNull();
    expect(view.getByLabelText("Pace minutes").props.selectedValue).toBe(91);
    await fireEvent(view.getByLabelText("Pace seconds"), "valueChange", 30);
    await view.rerender(<Owner layout="hms" />);
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.getByLabelText("Pace hours").props.selectedValue).toBe(1);
    expect(view.getByLabelText("Pace minutes").props.selectedValue).toBe(31);
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe(30);
    await fireEvent.press(view.getByLabelText("Done Pace"));
    expect(change.mock.calls).toEqual([["91:00"], ["91:30"]]);
  });
  it("rejects an unsupported layout arriving from JavaScript without emitting a value", async () => {
    const change = jest.fn();
    const props: PaceInputProps = { label: "Pace", value: "91:00", layout: "ms", onChange: change };
    // Runtime configuration can bypass TypeScript; no cast should legitimize HM.
    Object.defineProperty(props, "layout", { value: "hm", enumerable: true });
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(renderNative(<PaceInput {...props} />)).rejects.toThrow(/pace layout.*ms.*hms/i);
    } finally {
      error.mockRestore();
    }
    expect(change).not.toHaveBeenCalled();
  });
  it("blocks invalid Done and retains malformed repair text when canceled", async () => {
    const change = jest.fn();
    const blur = jest.fn();
    const view = await renderNative(
      <PaceInput
        label="Pace"
        value="4:bad"
        disabled
        error="Invalid pace"
        onChange={change}
        onBlur={blur}
      />,
    );
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.queryByLabelText("Pace seconds")).toBeNull();
    await view.rerender(
      <PaceInput label="Pace" value="4:bad" error="Invalid pace" onChange={change} onBlur={blur} />,
    );
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe("bad");
    expect(view.getAllByText("Invalid pace")).toHaveLength(2);
    await fireEvent.press(view.getByLabelText("Done Pace"));
    expect(change).not.toHaveBeenCalled();
    expect(blur).not.toHaveBeenCalled();
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe("bad");
    expect(view.getAllByText("Invalid pace")).toHaveLength(2);
    await fireEvent.press(view.getByLabelText("Cancel Pace"));
    expect(blur).toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe("bad");
  });
  it("opens MS wheels with /km immediately and keeps the string API", async () => {
    const change = jest.fn();
    const view = await renderNative(<PaceInput label="Pace" value="3:15" onChange={change} />);
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.queryByLabelText("Pace hours")).toBeNull();
    expect(view.getByLabelText("Pace minutes").props.selectedValue).toBe(3);
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe(15);
    expect(view.getAllByText("/km").length).toBeGreaterThan(0);
    expect(change).not.toHaveBeenCalled();
    await fireEvent(view.getByLabelText("Pace minutes"), "valueChange", 4);
    await fireEvent(view.getByLabelText("Pace seconds"), "valueChange", 5);
    expect(change).toHaveBeenLastCalledWith("4:05");
    await fireEvent.press(view.getByLabelText("Done Pace"));
  });
  it("includes long current minutes in a bounded native window without a manual fallback", async () => {
    const view = await renderNative(
      <PaceInput label="Pace" value="360000:30" onChange={jest.fn()} />,
    );
    await fireEvent.press(view.getByLabelText("Pace"));
    const minutes = view.getByLabelText("Pace minutes");
    expect(minutes.props.selectedValue).toBe(360000);
    expect(minutes.props.children.length).toBeLessThan(260);
    expect(view.queryByLabelText("Enter exact pace")).toBeNull();
  });
  it("supports explicit HMS without changing canonical pace", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <PaceInput label="Pace" layout="hms" value="90:30" onChange={change} />,
    );
    await fireEvent.press(view.getByLabelText("Pace"));
    expect(view.getByLabelText("Pace hours").props.selectedValue).toBe(1);
    expect(view.getByLabelText("Pace minutes").props.selectedValue).toBe(30);
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe(30);
    await fireEvent.press(view.getByLabelText("Done Pace"));
    expect(change).not.toHaveBeenCalled();
  });
});
