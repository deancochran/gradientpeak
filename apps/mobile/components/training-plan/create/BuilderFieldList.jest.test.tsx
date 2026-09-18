import { fireEvent, renderNative, screen } from "../../../test/render-native";
import { BuilderFieldList } from "./BuilderFieldList";

describe("BuilderFieldList numeric entry", () => {
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
