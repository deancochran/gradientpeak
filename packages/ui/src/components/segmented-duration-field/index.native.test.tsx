import { fireEvent, renderNative, screen } from "@repo/ui/test/render-native";
import { useState } from "react";
import { Platform, useColorScheme, View } from "react-native";
import { NATIVE_THEME } from "../../lib/native-theme";
import {
  SegmentedDurationField as DurationField,
  type SegmentedDurationFieldProps,
} from "./index.native";

// These regressions exercise the activity-step policy, not the unbounded goal policy.
const SegmentedDurationField = (props: SegmentedDurationFieldProps) => (
  <DurationField maxSeconds={86400} {...props} />
);

import { formatDurationSeconds, parseDurationSegments, splitDurationSeconds } from "./shared";

describe("exact semantic duration", () => {
  it("normalizes only valid compact rows and preserves default and invalid draft summaries", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <SegmentedDurationField
        presentation="native-overlay"
        triggerVariant="row"
        valueSeconds={3661}
        onChangeSeconds={change}
        onInvalidChange={jest.fn()}
      />,
    );
    expect(view.getByLabelText("Duration").props.accessibilityValue.text).toBe("1:01:01");
    await view.rerender(
      <SegmentedDurationField
        presentation="native-overlay"
        triggerVariant="row"
        layout="ms"
        valueSeconds={65}
        onChangeSeconds={change}
        onInvalidChange={jest.fn()}
      />,
    );
    expect(view.getByLabelText("Duration").props.accessibilityValue.text).toBe("1:05");
    const invalid = { hours: "00", minutes: "60", seconds: "00", invalidText: "00:60:00" };
    await view.rerender(
      <SegmentedDurationField
        presentation="native-overlay"
        triggerVariant="row"
        valueSeconds={null}
        segments={invalid}
        onChangeSeconds={change}
        onInvalidChange={jest.fn()}
      />,
    );
    expect(view.getByLabelText("Duration").props.accessibilityValue.text).toBe("00:60:00");
    await view.rerender(
      <SegmentedDurationField
        presentation="native-overlay"
        valueSeconds={null}
        segments={invalid}
        onChangeSeconds={change}
        onInvalidChange={jest.fn()}
      />,
    );
    expect(view.getByLabelText("Duration").props.accessibilityValue.text).toBe("00:60:00");
    expect(change).not.toHaveBeenCalled();
  });
  it("uses grouped platform picker columns instead of a manual entry mode", async () => {
    Platform.OS = "android";
    try {
      const view = await renderNative(
        <SegmentedDurationField
          presentation="exact"
          valueSeconds={1542}
          onChangeSeconds={jest.fn()}
          onInvalidChange={jest.fn()}
        />,
      );
      for (const part of ["hours", "minutes", "seconds"])
        expect(view.getByLabelText(`Duration ${part}`).type).toBe("NativePicker");
      expect(view.queryByLabelText("Enter exact duration")).toBeNull();
      expect(view.getByLabelText("Duration minutes").props.selectedValue).toBe(25);
      expect(view.getByLabelText("Duration seconds").props.selectedValue).toBe(42);
    } finally {
      Platform.OS = "ios";
    }
  });
  it("shows all zero segments without inventing a dose and repairs through dials up to 24 hours", async () => {
    const change = jest.fn();
    function Owner() {
      const [seconds, setSeconds] = useState(0);
      return (
        <SegmentedDurationField
          presentation="native"
          valueSeconds={seconds}
          onInvalidChange={jest.fn()}
          onChangeSeconds={(value) => {
            change(value);
            setSeconds(value);
          }}
        />
      );
    }
    await renderNative(<Owner />);
    for (const part of ["hours", "minutes", "seconds"])
      expect(screen.getByLabelText(`Duration ${part}`).props.selectedValue).toBe(0);
    expect(change).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Duration hours"), "valueChange", 24);
    expect(change).toHaveBeenLastCalledWith(86400);
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 1);
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Duration hours").props.selectedValue).toBe(24);
    expect(screen.getByLabelText("Duration seconds").props.selectedValue).toBe(1);
  });
  it("shows unset overlay wheels at zero, commits a single selection, and preserves an existing duration", async () => {
    const change = jest.fn();
    function Owner({ initial }: { initial: number | undefined }) {
      const [seconds, setSeconds] = useState(initial);
      return (
        <SegmentedDurationField
          presentation="native-overlay"
          required={false}
          valueSeconds={seconds}
          onInvalidChange={jest.fn()}
          onChangeSeconds={(value) => {
            change(value);
            setSeconds(value);
          }}
        />
      );
    }
    const view = await renderNative(<Owner initial={undefined} />);
    expect(screen.getByLabelText("Duration").props.accessibilityValue.text).toBe("Not set");
    await fireEvent.press(screen.getByLabelText("Duration"));
    expect(screen.getByTestId("Duration-duration-overlay").props.className).toContain(
      "justify-end",
    );
    expect(screen.getByLabelText("Duration seconds").props.style).toMatchObject({
      color: NATIVE_THEME.light.foreground,
      backgroundColor: NATIVE_THEME.light.card,
    });
    expect(screen.getByTestId("Duration-duration-surface").props.style).toMatchObject({
      flexShrink: 1,
      maxHeight: "80%",
      minHeight: 0,
    });
    for (const part of ["hours", "minutes", "seconds"])
      expect(screen.getByLabelText(`Duration ${part}`).props.selectedValue).toBe(0);
    expect(change).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 1);
    expect(change).toHaveBeenLastCalledWith(1);
    expect(screen.getByLabelText("Duration hours").props.selectedValue).toBe(0);
    expect(screen.getByLabelText("Duration minutes").props.selectedValue).toBe(0);
    expect(screen.getByLabelText("Duration seconds").props.selectedValue).toBe(1);

    await view.unmount();
    change.mockClear();
    await renderNative(<Owner initial={3661} />);
    await fireEvent.press(screen.getByLabelText("Duration"));
    expect(screen.getByLabelText("Duration hours").props.selectedValue).toBe(1);
    expect(screen.getByLabelText("Duration minutes").props.selectedValue).toBe(1);
    expect(screen.getByLabelText("Duration seconds").props.selectedValue).toBe(1);
    expect(change).not.toHaveBeenCalled();
  });
  it("uses the active dark scheme for duration picker labels and values", async () => {
    const scheme = useColorScheme as jest.Mock;
    scheme.mockReturnValue("dark");
    try {
      await renderNative(
        <SegmentedDurationField
          presentation="native-overlay"
          valueSeconds={60}
          onChangeSeconds={jest.fn()}
          onInvalidChange={jest.fn()}
        />,
      );
      await fireEvent.press(screen.getByLabelText("Duration"));
      expect(screen.getByLabelText("Duration seconds").props.style).toMatchObject({
        color: NATIVE_THEME.dark.foreground,
        backgroundColor: NATIVE_THEME.dark.card,
      });
    } finally {
      scheme.mockReset();
      scheme.mockReturnValue("light");
    }
  });
  it("ignores an invalid Done callback from an overlay canceled before it was reopened", async () => {
    const view = await renderNative(
      <SegmentedDurationField
        presentation="native-overlay"
        required
        valueSeconds={undefined}
        onChangeSeconds={jest.fn()}
        onInvalidChange={jest.fn()}
      />,
    );
    await fireEvent.press(view.getByLabelText("Duration"));
    const staleDone = view.getByLabelText("Done Duration").props.onPress as () => void;
    await fireEvent.press(view.getByLabelText("Cancel Duration"));
    await fireEvent.press(view.getByLabelText("Duration"));

    staleDone();
    expect(view.queryByRole("alert")).toBeNull();
    expect(view.getByLabelText("Duration seconds")).toBeTruthy();
  });
  it("passes exact seconds to native pickers and bounds the day limit", async () => {
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
    expect(screen.getByLabelText("Duration hours").props.selectedValue).toBe(0);
    expect(screen.getByLabelText("Duration minutes").props.selectedValue).toBe(0);
    expect(change).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 0);
    expect(change).not.toHaveBeenCalled();
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 2);
    expect(change).toHaveBeenLastCalledWith(2);
    await fireEvent(screen.getByLabelText("Duration hours"), "valueChange", 1);
    expect(change).toHaveBeenLastCalledWith(3602);
    await fireEvent(screen.getByLabelText("Duration hours"), "valueChange", 0);
    expect(change).toHaveBeenLastCalledWith(2);
    await view.unmount();
    await renderNative(<Owner initial={86400} />);
    await fireEvent(screen.getByLabelText("Duration minutes"), "valueChange", 1);
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 1);
    expect(change).toHaveBeenLastCalledWith(2);
    await fireEvent(screen.getByLabelText("Duration hours"), "valueChange", 23);
    expect(change).toHaveBeenLastCalledWith(82861);
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
    expect(screen.getByLabelText("Recovery duration hours").props.selectedValue).toBe(1);
    expect(screen.getByLabelText("Recovery duration seconds").props.selectedValue).toBe("bad");
    expect(screen.getByLabelText("Recovery duration seconds").props.enabled).toBe(false);
    await view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        label="Recovery duration"
        segments={splitDurationSeconds(61)}
        onChangeSeconds={change}
        onInvalidChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Recovery duration seconds").props.selectedValue).toBe(1);
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
    expect(
      parseDurationSegments({ hours: "24", minutes: "0", seconds: "1" }, { maxSeconds: 86400 }),
    ).toBeNull();
    expect(
      parseDurationSegments({ hours: "9007199254740992", minutes: "0", seconds: "0" }),
    ).toBeNull();
    expect(splitDurationSeconds(1.5)).toEqual({ hours: "0", minutes: "0", seconds: "1.5" });
    expect(formatDurationSeconds(0)).toContain("needs correction");
  });
  it("does not emit through hiding and emits only a deliberate dial correction", async () => {
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
    expect(screen.getByLabelText("Duration minutes").props.selectedValue).toBe(3);
    expect(screen.getByLabelText("Duration hours").props.selectedValue).toBe(0);
    expect(screen.getByLabelText("Duration seconds").props.selectedValue).toBe(0);
    await view.rerender(<Owner hidden />);
    await view.rerender(<Owner />);
    expect(screen.getByLabelText("Duration minutes").props.selectedValue).toBe(3);
    expect(change).not.toHaveBeenCalled();
    expect(invalid).toHaveBeenLastCalledWith(false);
    await fireEvent(screen.getByLabelText("Duration minutes"), "valueChange", 4);
    expect(change).toHaveBeenLastCalledWith(240);
    await fireEvent(screen.getByLabelText("Duration hours"), "valueChange", 1);
    await fireEvent(screen.getByLabelText("Duration seconds"), "valueChange", 1);
    expect(change).toHaveBeenLastCalledWith(3841);
  });
});
