import { fireEvent, renderNative, screen } from "@repo/ui/test/render-native";
import { act } from "@testing-library/react-native/pure";
import { nativePickerFixtures } from "./fixtures";
import { NativePicker } from "./index.native";

it("passes the selected value and all half-points to the native library without JS selection geometry", async () => {
  const change = jest.fn();
  await renderNative(<NativePicker {...nativePickerFixtures.rpe} onChange={change} />);
  const picker = screen.getByLabelText("RPE");
  expect(picker.type).toBe("NativePicker");
  expect(picker.props).toMatchObject({ selectedValue: 5, mode: "dialog" });
  expect(picker.props.itemStyle).toBeUndefined();
  expect(picker.props.selectionColor).toBeUndefined();
  expect(
    picker.children.map((child) => (typeof child === "string" ? child : child.props.value)),
  ).toEqual(Array.from({ length: 19 }, (_, index) => 1 + index / 2));
  await fireEvent(picker, "valueChange", 7.5, 13);
  expect(change).toHaveBeenCalledWith(7.5);
  await fireEvent(picker, "valueChange", 7.25, 13);
  expect(change).toHaveBeenCalledTimes(1);
});

it("invalidates queued selections across disable and re-enable on the same mounted control", async () => {
  const change = jest.fn();
  const view = await renderNative(<NativePicker {...nativePickerFixtures.rpe} onChange={change} />);
  const beforeDisable = screen.getByLabelText("RPE").props.onValueChange;
  await view.rerender(<NativePicker {...nativePickerFixtures.rpe} disabled onChange={change} />);
  const whileDisabled = screen.getByLabelText("RPE").props.onValueChange;
  await act(() => beforeDisable(6, 10));
  expect(change).not.toHaveBeenCalled();
  await view.rerender(<NativePicker {...nativePickerFixtures.rpe} onChange={change} />);
  await act(() => {
    beforeDisable(7, 12);
    whileDisabled(8, 14);
  });
  expect(change).not.toHaveBeenCalled();
  await fireEvent(screen.getByLabelText("RPE"), "valueChange", 9, 16);
  expect(change.mock.calls).toEqual([[9]]);
});

it("rejects a retained callback from an older session and after unmount", async () => {
  let generation = 1;
  const change = jest.fn();
  const view = await renderNative(
    <NativePicker
      {...nativePickerFixtures.rpe}
      isCurrent={() => generation === 1}
      onChange={change}
    />,
  );
  const stale = screen.getByLabelText("RPE").props.onValueChange;
  generation = 2;
  await view.rerender(
    <NativePicker
      {...nativePickerFixtures.rpe}
      isCurrent={() => generation === 2}
      onChange={change}
    />,
  );
  await act(() => stale(7));
  expect(change).not.toHaveBeenCalled();
  const current = screen.getByLabelText("RPE").props.onValueChange;
  await fireEvent(screen.getByLabelText("RPE"), "valueChange", 6);
  expect(change).toHaveBeenLastCalledWith(6);
  await view.unmount();
  await act(() => current(8));
  expect(change).toHaveBeenCalledTimes(1);
});

it("retains invalid legacy selection and disabled values without coercion", async () => {
  const change = jest.fn();
  await renderNative(
    <NativePicker {...nativePickerFixtures.rpe} value={5.25} disabled onChange={change} />,
  );
  expect(screen.getByLabelText("RPE").props.selectedValue).toBe(5.25);
  await fireEvent(screen.getByLabelText("RPE"), "valueChange", 6);
  expect(change).not.toHaveBeenCalled();
});
