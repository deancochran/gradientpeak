import { act, fireEvent, renderNative, screen } from "../../../test/render-native";
import { BuilderFieldList } from "./BuilderFieldList";

describe("BuilderFieldList numeric entry", () => {
  it("does not infer integer precision from the adjustment step and fences expired validity callbacks", async () => {
    const onChangeField = jest.fn();
    const onInvalidChange = jest.fn();
    const onRawDraftChange = jest.fn();
    const view = await renderNative(
      <BuilderFieldList
        addLabel="Add"
        emptyMessage="None"
        fields={[
          {
            key: "vo2",
            label: "VO2 max",
            inputKind: "number",
            value: { value: 42.25, source: "manual", unit: "ml/kg/min" },
            step: 1,
            visible: true,
            required: false,
            reason: null,
            canRemove: false,
          },
        ]}
        onAddField={jest.fn()}
        onRemoveField={jest.fn()}
        onChangeField={onChangeField}
        onInvalidChange={onInvalidChange}
        onRawDraftChange={onRawDraftChange}
      />,
    );
    await fireEvent.changeText(screen.getByLabelText("VO2 max"), "43.75");
    await fireEvent(screen.getByLabelText("VO2 max"), "blur");
    expect(onChangeField).toHaveBeenLastCalledWith("vo2", 43.75);
    expect(screen.getByLabelText("VO2 max").props.value).toBe("43.75");
    await fireEvent.changeText(screen.getByLabelText("VO2 max"), "-");
    expect(onInvalidChange).toHaveBeenLastCalledWith("vo2", "Correct VO2 max or clear it.");
    expect(onRawDraftChange).toHaveBeenLastCalledWith("vo2", "-");
    const expiredBlur = screen.getByLabelText("VO2 max").props.onBlur;
    await view.unmount();
    onInvalidChange.mockClear();
    onChangeField.mockClear();
    await act(() => expiredBlur());
    expect(onInvalidChange).not.toHaveBeenCalled();
    expect(onChangeField).not.toHaveBeenCalled();
  });
  it("keeps an exact decimal draft visible while projecting its numeric value", async () => {
    const onChangeField = jest.fn();
    await renderNative(
      <BuilderFieldList
        addLabel="Add"
        emptyMessage="None"
        fields={[
          {
            key: "weight",
            label: "Weight",
            inputKind: "number",
            value: { value: 70, source: "manual", unit: "kg" },
            visible: true,
            required: false,
            reason: null,
            canRemove: false,
          },
        ]}
        onAddField={jest.fn()}
        onChangeField={onChangeField}
        onRemoveField={jest.fn()}
      />,
    );

    const input = screen.getByLabelText("Weight");
    await fireEvent.changeText(input, "70.23");

    expect(input.props.value).toBe("70.23");
    expect(onChangeField).toHaveBeenLastCalledWith("weight", 70.23);
  });
});
