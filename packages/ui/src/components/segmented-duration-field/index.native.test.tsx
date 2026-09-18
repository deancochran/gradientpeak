import { fireEvent, renderNative, screen } from "@repo/ui/test/render-native";
import { useState } from "react";
import { View } from "react-native";
import { SegmentedDurationField } from "./index.native";
import { formatDurationSeconds, parseDurationSegments, splitDurationSeconds } from "./shared";

describe("exact semantic duration", () => {
  it("passes exact seconds to native pickers, bounds the day limit, and retains invalid exact drafts", async () => {
    const change = jest.fn();
    function Owner({ initial }: { initial: number }) {
      const [seconds, setSeconds] = useState(initial);
      return (
        <SegmentedDurationField
          presentation="native"
          valueSeconds={seconds}
          onInvalidChange={jest.fn()}
          onChangeSeconds={(next) => {
            setSeconds(next);
            change(next);
          }}
        />
      );
    }
    const view = await renderNative(<Owner initial={1} />);
    expect(screen.getByLabelText("Duration seconds").type).toBe("NativePicker");
    expect(change).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 0);
    expect(change).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 2);
    expect(change).toHaveBeenLastCalledWith(2);
    await fireEvent.press(screen.getByLabelText("Enter exact duration"));
    await fireEvent(screen.getByLabelText("Duration seconds"), "changeText", "bad");
    await fireEvent.press(screen.getByLabelText("Use native duration picker"));
    expect(screen.getByLabelText("Duration seconds").props.value).toBe("bad");
    await view.unmount();
    await renderNative(<Owner initial={86400} />);
    await fireEvent(screen.getByLabelText("Duration minutes"), "valueChange", 1);
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 1);
    expect(change).toHaveBeenLastCalledWith(2);
    await fireEvent(screen.getByLabelText("Duration hours"), "valueChange", 23);
    expect(change).toHaveBeenLastCalledWith(82800);
  });
  it("notifies initial and restored snapshot validity once per transition with a changing callback", async () => {
    const notified = jest.fn();
    const invalidSegments = { hours: "0", minutes: "1", seconds: "" };
    const view = await renderNative(
      <SegmentedDurationField
        valueSeconds={61}
        segments={invalidSegments}
        onChangeSeconds={jest.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    expect(notified.mock.calls).toEqual([[true]]);
    await view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        segments={splitDurationSeconds(61)}
        onChangeSeconds={jest.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    await view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        segments={invalidSegments}
        onChangeSeconds={jest.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    await view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        segments={{ ...invalidSegments }}
        onChangeSeconds={jest.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    expect(notified.mock.calls).toEqual([[true], [false], [true]]);
  });
  it("reports changed canonical props without looping on owner validity state", async () => {
    const notified = jest.fn();
    function Owner({ seconds }: { seconds: number }) {
      const [invalid, setInvalid] = useState(false);
      return (
        <View accessibilityLabel={String(invalid)}>
          <SegmentedDurationField
            valueSeconds={seconds}
            onChangeSeconds={jest.fn()}
            onInvalidChange={(next) => {
              notified(next);
              setInvalid(next);
            }}
          />
        </View>
      );
    }
    const view = await renderNative(<Owner seconds={61} />);
    await view.rerender(<Owner seconds={0} />);
    await view.rerender(<Owner seconds={61} />);
    expect(notified.mock.calls).toEqual([[false], [true], [false]]);
  });
  it("supports controlled segments, contextual labels and disabled state without changing the canonical dose", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <SegmentedDurationField
        valueSeconds={61}
        label="Recovery duration"
        disabled
        segments={{ hours: "1", minutes: "0", seconds: "bad" }}
        onChangeSeconds={change}
        onInvalidChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Recovery duration hours").props.value).toBe("1");
    expect(screen.getByLabelText("Recovery duration seconds").props.value).toBe("bad");
    expect(screen.getByLabelText("Recovery duration seconds").props.editable).toBe(false);
    await view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        label="Recovery duration"
        segments={splitDurationSeconds(61)}
        onChangeSeconds={change}
        onInvalidChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Recovery duration seconds").props.value).toBe("1");
    expect(change).not.toHaveBeenCalled();
  });
  it("round trips every permitted integer second without rounding", () => {
    for (let seconds = 1; seconds <= 86400; seconds++) {
      if (parseDurationSegments(splitDurationSeconds(seconds)) !== seconds)
        throw new Error(`Lost exact duration ${seconds}`);
    }
    expect(formatDurationSeconds(180)).toBe("3 min");
    expect(formatDurationSeconds(61)).toBe("1 min 1 sec");
    expect(formatDurationSeconds(3661)).toBe("1 hr 1 min 1 sec");
    expect(formatDurationSeconds(86400)).toBe("24 hr");
  });
  it.each([
    "",
    "bad",
    "1.5",
    "-1",
    "60",
    "1e1",
  ])("retains invalid seconds %s as invalid", (seconds) => {
    expect(parseDurationSegments({ hours: "0", minutes: "1", seconds })).toBeNull();
  });
  it("rejects zero and over-limit totals, and exposes malformed history without coercing", () => {
    expect(parseDurationSegments({ hours: "0", minutes: "0", seconds: "0" })).toBeNull();
    expect(parseDurationSegments({ hours: "24", minutes: "0", seconds: "1" })).toBeNull();
    expect(
      parseDurationSegments({ hours: "9007199254740992", minutes: "0", seconds: "0" }),
    ).toBeNull();
    expect(splitDurationSeconds(1.5)).toEqual({ hours: "0", minutes: "0", seconds: "1.5" });
    expect(formatDurationSeconds(0)).toContain("needs correction");
  });
  it("keeps incomplete segments through hiding and parent renders, then emits only an exact corrected dose", async () => {
    const change = jest.fn();
    const invalid = jest.fn();
    function Owner({ hidden = false }: { hidden?: boolean }) {
      const [seconds, setSeconds] = useState(180);
      return (
        <View style={hidden ? { display: "none" } : undefined}>
          <SegmentedDurationField
            valueSeconds={seconds}
            onInvalidChange={invalid}
            onChangeSeconds={(next) => {
              change(next);
              setSeconds(next);
            }}
          />
        </View>
      );
    }
    const view = await renderNative(<Owner />);
    expect(screen.getByLabelText("Duration minutes").props.value).toBe("3");
    expect(screen.queryByLabelText("Duration hours")).toBeNull();
    await fireEvent(screen.getByLabelText("Duration minutes"), "changeText", "");
    await view.rerender(<Owner hidden />);
    await view.rerender(<Owner />);
    expect(screen.getByLabelText("Duration minutes").props.value).toBe("");
    expect(change).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenLastCalledWith(true);
    await fireEvent(screen.getByLabelText("Duration minutes"), "changeText", "4");
    expect(change).toHaveBeenLastCalledWith(240);
    await fireEvent.press(screen.getByText("Add hours"));
    await fireEvent(screen.getByLabelText("Duration hours"), "changeText", "1");
    await fireEvent(screen.getByLabelText("Duration seconds"), "changeText", "1");
    expect(change).toHaveBeenLastCalledWith(3841);
  });
});
