import { useState } from "react";
import { fireEvent, renderNative } from "../../test/render-native";
import { NativeDistanceInput } from "./index.native";

const props = {
  label: "Distance",
  maxMeters: 1_000_000,
  minMeters: 1,
  onUnitChange: jest.fn(),
  unit: "km" as const,
};

describe("NativeDistanceInput", () => {
  it("uses one bounded wheel, does not choose on open, and exposes separate unit and precision groups", async () => {
    const onChangeMeters = jest.fn();
    const view = await renderNative(
      <NativeDistanceInput {...props} onChangeMeters={onChangeMeters} valueMeters={undefined} />,
    );

    const picker = view.getByLabelText("Distance value");
    expect(view.getByText("Not set")).toBeTruthy();
    expect(picker.props.children).toHaveLength(101);
    expect(
      picker.props.children.some((item: { props: { value: number } }) => item.props.value === 0),
    ).toBe(true);
    expect(view.getByLabelText("Distance unit")).toBeTruthy();
    expect(view.getByLabelText("Distance precision")).toBeTruthy();
    expect(view.getByText("Coarse (100 m)")).toBeTruthy();
    expect(view.getByText("Fine (1 m)")).toBeTruthy();
    expect(onChangeMeters).not.toHaveBeenCalled();

    await fireEvent.press(view.getByText("400 m"));
    expect(onChangeMeters).toHaveBeenLastCalledWith(400);
  });

  it("preserves exact canonical metres across m/km display", async () => {
    const onChangeMeters = jest.fn();
    const view = await renderNative(
      <NativeDistanceInput {...props} onChangeMeters={onChangeMeters} valueMeters={42_195} />,
    );

    expect(view.getByText("42.195 km")).toBeTruthy();
    await view.rerender(
      <NativeDistanceInput
        {...props}
        onChangeMeters={onChangeMeters}
        unit="meters"
        valueMeters={42_195}
      />,
    );
    expect(view.getByText("42195 m")).toBeTruthy();
  });

  it("keeps the neutral zero only for an unset value, not a valid distance above its minimum", async () => {
    const view = await renderNative(
      <NativeDistanceInput {...props} onChangeMeters={jest.fn()} valueMeters={1000} />,
    );
    const values = view
      .getByLabelText("Distance value")
      .props.children.map((item: { props: { value: number } }) => item.props.value);

    expect(values).not.toContain(0);
    expect(values.every((value: number) => value >= 1)).toBe(true);
  });

  it("recentres deliberate values so Fine can choose an adjacent exact metre", async () => {
    const changes: number[] = [];
    function Owner() {
      const [valueMeters, setValueMeters] = useState<number | undefined>();
      return (
        <NativeDistanceInput
          {...props}
          onChangeMeters={(next) => {
            changes.push(next);
            setValueMeters(next);
          }}
          valueMeters={valueMeters}
        />
      );
    }
    const view = await renderNative(<Owner />);

    await fireEvent.press(view.getByText("5 km"));
    await fireEvent.press(view.getByText("Fine (1 m)"));
    const picker = view.getByLabelText("Distance value");
    const values = picker.props.children.map(
      (item: { props: { value: number } }) => item.props.value,
    );
    expect(values).toContain(5_001);
    await fireEvent(picker, "valueChange", 5_001);
    expect(changes).toEqual([5_000, 5_001]);
  });

  it("does not silently repair invalid historic values and keeps a safe option window", async () => {
    const onChangeMeters = jest.fn();
    const view = await renderNative(
      <NativeDistanceInput
        {...props}
        maxMeters={5_000}
        onChangeMeters={onChangeMeters}
        valueMeters={Number.NaN}
      />,
    );

    expect(view.getByText("NaN m needs correction")).toBeTruthy();
    expect(view.getByRole("alert")).toBeTruthy();
    const options = view
      .getByLabelText("Distance value")
      .props.children.filter((item: { props: { value: number } }) =>
        Number.isFinite(item.props.value),
      );
    expect(options).toHaveLength(50);
    expect(options.every((item: { props: { value: number } }) => item.props.value >= 1)).toBe(true);
    expect(onChangeMeters).not.toHaveBeenCalled();
  });

  it("rejects invalid and stale callbacks after configuration changes or unmount", async () => {
    const onChangeMeters = jest.fn();
    let ownerCurrent = true;
    const isCurrent = () => ownerCurrent;
    const view = await renderNative(
      <NativeDistanceInput
        {...props}
        isCurrent={isCurrent}
        onChangeMeters={onChangeMeters}
        valueMeters={100}
      />,
    );
    const stale = view.getByLabelText("Distance value").props.onValueChange;

    await fireEvent.press(view.getByText("Fine (1 m)"));
    stale(100);
    expect(onChangeMeters).not.toHaveBeenCalled();

    await view.rerender(
      <NativeDistanceInput
        {...props}
        isCurrent={isCurrent}
        minMeters={200}
        onChangeMeters={onChangeMeters}
        valueMeters={200}
      />,
    );
    stale(100);
    expect(onChangeMeters).not.toHaveBeenCalled();

    await view.rerender(
      <NativeDistanceInput
        {...props}
        isCurrent={isCurrent}
        maxMeters={500}
        onChangeMeters={onChangeMeters}
        unit="meters"
        valueMeters={200}
      />,
    );
    stale(100);
    expect(onChangeMeters).not.toHaveBeenCalled();

    ownerCurrent = false;
    await view.rerender(
      <NativeDistanceInput
        {...props}
        isCurrent={isCurrent}
        onChangeMeters={onChangeMeters}
        valueMeters={100}
      />,
    );
    ownerCurrent = true;
    await view.rerender(
      <NativeDistanceInput
        {...props}
        isCurrent={isCurrent}
        onChangeMeters={onChangeMeters}
        valueMeters={100}
      />,
    );
    stale(100);
    expect(onChangeMeters).not.toHaveBeenCalled();

    const current = view.getByLabelText("Distance value").props.onValueChange;
    current(Number.NaN);
    current(200.5);
    expect(onChangeMeters).not.toHaveBeenCalled();

    await view.unmount();
    current(300);
    expect(onChangeMeters).not.toHaveBeenCalled();
  });

  it("rejects a removed preset's queued callback while current presets remain usable", async () => {
    const onChangeMeters = jest.fn();
    const view = await renderNative(
      <NativeDistanceInput
        {...props}
        onChangeMeters={onChangeMeters}
        presetsMeters={[200]}
        valueMeters={100}
      />,
    );
    const stalePreset = view.getByText("200 m").parent?.props.onPress as () => void;

    await view.rerender(
      <NativeDistanceInput
        {...props}
        onChangeMeters={onChangeMeters}
        presetsMeters={[400]}
        valueMeters={100}
      />,
    );
    stalePreset();
    expect(onChangeMeters).not.toHaveBeenCalled();

    await fireEvent.press(view.getByText("400 m"));
    expect(onChangeMeters).toHaveBeenLastCalledWith(400);
  });
});
