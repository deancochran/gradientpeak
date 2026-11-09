import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, useState } from "react";
import { uninstrumentedUserEvent as userEvent } from "storybook/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SegmentedDurationField as DurationField,
  type SegmentedDurationFieldProps,
} from "./index.web";

const SegmentedDurationField = (props: SegmentedDurationFieldProps) => (
  <DurationField maxSeconds={86400} {...props} />
);

import { type DurationSegments, splitDurationSeconds } from "./shared";

afterEach(cleanup);

describe("segmented duration web", () => {
  it("retains zero and over-limit text with all segments visible and directly repairs zero hours", () => {
    const change = vi.fn();
    function Owner() {
      const [seconds, setSeconds] = useState(0);
      return (
        <SegmentedDurationField
          valueSeconds={seconds}
          onInvalidChange={vi.fn()}
          onChangeSeconds={(value) => {
            change(value);
            setSeconds(value);
          }}
        />
      );
    }
    render(<Owner />);
    for (const part of ["hours", "minutes", "seconds"])
      expect(screen.getByLabelText(`Duration ${part}`)).toHaveProperty("value", "0");
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Duration hours"), { target: { value: "24" } });
    expect(change).toHaveBeenLastCalledWith(86400);
    fireEvent.change(screen.getByLabelText("Duration seconds"), { target: { value: "1" } });
    expect(change).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Duration hours")).toHaveProperty("value", "24");
    expect(screen.getByLabelText("Duration seconds")).toHaveProperty("value", "1");
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("notifies initial and restored snapshot validity once per transition with a changing callback", () => {
    const notified = vi.fn();
    const invalidSegments = { hours: "0", minutes: "1", seconds: "" };
    const view = render(
      <SegmentedDurationField
        valueSeconds={61}
        segments={invalidSegments}
        onChangeSeconds={vi.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    expect(notified.mock.calls).toEqual([[true]]);
    view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        segments={splitDurationSeconds(61)}
        onChangeSeconds={vi.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    expect(notified.mock.calls).toEqual([[true], [false]]);
    view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        segments={invalidSegments}
        onChangeSeconds={vi.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    view.rerender(
      <SegmentedDurationField
        valueSeconds={61}
        segments={{ ...invalidSegments }}
        onChangeSeconds={vi.fn()}
        onInvalidChange={(invalid) => notified(invalid)}
      />,
    );
    expect(notified.mock.calls).toEqual([[true], [false], [true]]);
  });
  it("reports changed canonical props and does not loop when the owner rerenders on notification", () => {
    const notified = vi.fn();
    function Owner({ seconds }: { seconds: number }) {
      const [invalid, setInvalid] = useState(false);
      return (
        <div data-invalid={invalid}>
          <SegmentedDurationField
            valueSeconds={seconds}
            onChangeSeconds={vi.fn()}
            onInvalidChange={(next) => {
              notified(next);
              setInvalid(next);
            }}
          />
        </div>
      );
    }
    const view = render(<Owner seconds={61} />);
    view.rerender(<Owner seconds={0} />);
    view.rerender(<Owner seconds={61} />);
    expect(notified.mock.calls).toEqual([[false], [true], [false]]);
  });
  it.each([
    1, 61, 3661, 86400,
  ])("renders exact %i seconds without emitting a normalized value", (seconds) => {
    const change = vi.fn();
    render(
      <SegmentedDurationField
        valueSeconds={seconds}
        onChangeSeconds={change}
        onInvalidChange={vi.fn()}
      />,
    );
    const parts = splitDurationSeconds(seconds);
    expect((screen.getByLabelText("Duration minutes") as HTMLInputElement).value).toBe(
      parts.minutes,
    );
    expect((screen.getByLabelText("Duration seconds") as HTMLInputElement).value).toBe(
      parts.seconds,
    );
    expect((screen.getByLabelText("Duration hours") as HTMLInputElement).value).toBe(parts.hours);
    expect(change).not.toHaveBeenCalled();
  });
  it("supports selection, paste, Tab and bounded arrow adjustments without blocking invalid text", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const invalid = vi.fn();
    function Owner() {
      const [seconds, setSeconds] = useState(180);
      return (
        <SegmentedDurationField
          valueSeconds={seconds}
          onChangeSeconds={(next) => {
            change(next);
            setSeconds(next);
          }}
          onInvalidChange={invalid}
        />
      );
    }
    render(<Owner />);
    const hours = screen.getByLabelText("Duration hours") as HTMLInputElement;
    expect(hours.value).toBe("0");
    await user.click(hours);
    hours.select();
    await user.paste("1");
    expect(change).toHaveBeenLastCalledWith(3780);
    hours.select();
    await user.paste("0");
    expect(change).toHaveBeenLastCalledWith(180);
    const minutes = screen.getByLabelText("Duration minutes") as HTMLInputElement;
    await user.click(minutes);
    minutes.select();
    await user.paste("4");
    expect(change).toHaveBeenLastCalledWith(240);
    await user.keyboard("{ArrowUp}");
    expect(change).toHaveBeenLastCalledWith(300);
    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Duration seconds"));
    await user.clear(screen.getByLabelText("Duration seconds"));
    await user.paste("bad");
    await user.keyboard("{ArrowUp}");
    expect((screen.getByLabelText("Duration seconds") as HTMLInputElement).value).toBe("bad");
    expect(change).toHaveBeenLastCalledWith(300);
    expect(invalid).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("alert")).toBeTruthy();
  });
  it("restores controlled invalid snapshots and focuses the offending segment", () => {
    const ref = createRef<{ focus: () => void }>();
    const props = { ref, valueSeconds: 61, onChangeSeconds: vi.fn(), onInvalidChange: vi.fn() };
    const draft: DurationSegments = { hours: "0", minutes: "1", seconds: "1.5" };
    const view = render(<SegmentedDurationField {...props} segments={draft} />);
    ref.current?.focus();
    expect(document.activeElement).toBe(screen.getByLabelText("Duration seconds"));
    view.rerender(<SegmentedDurationField {...props} segments={splitDurationSeconds(61)} />);
    expect((screen.getByLabelText("Duration seconds") as HTMLInputElement).value).toBe("1");
    view.rerender(<SegmentedDurationField {...props} segments={draft} />);
    expect((screen.getByLabelText("Duration seconds") as HTMLInputElement).value).toBe("1.5");
  });
  it("does not arrow past either total boundary and retains oversized pasted segments", () => {
    const change = vi.fn();
    const view = render(
      <SegmentedDurationField
        valueSeconds={86400}
        onChangeSeconds={change}
        onInvalidChange={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("Duration hours"), { key: "ArrowUp" });
    expect(change).not.toHaveBeenCalled();
    view.rerender(
      <SegmentedDurationField
        valueSeconds={1}
        onChangeSeconds={change}
        onInvalidChange={vi.fn()}
      />,
    );
    fireEvent.keyDown(screen.getByLabelText("Duration seconds"), { key: "ArrowDown" });
    expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Duration minutes"), { target: { value: "999" } });
    expect((screen.getByLabelText("Duration minutes") as HTMLInputElement).value).toBe("999");
    expect(change).not.toHaveBeenCalled();
  });
});
