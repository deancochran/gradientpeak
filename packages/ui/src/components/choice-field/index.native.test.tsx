import { createRef } from "react";
import { AccessibilityInfo, findNodeHandle } from "react-native";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { fireEvent, renderNative } from "../../test/render-native";
import { Button } from "../button/index.native";
import { FormChoiceField } from "../form-fields/choice-field.native";
import { Text } from "../text/index.native";
import { ChoiceField } from "./index.native";

const options = [
  { value: "easy", label: "Easy" },
  { value: "hard", label: "Hard" },
];
describe("ChoiceField native ownership", () => {
  it("remounts the native control after a zero-width ancestor without authorizing its old callback", async () => {
    const change = jest.fn();
    const view = await renderNative(
      <ChoiceField
        label="Effort"
        testId="effort"
        value="easy"
        options={options}
        onChange={change}
      />,
    );
    const expired = view.getByTestId("effort-picker").props.onValueChange;
    const owner = view.container.queryAll(
      (node) => node.type === "View" && typeof node.props.onLayout === "function",
    )[0];
    if (!owner) throw new Error("Missing choice layout owner.");
    await fireEvent(owner, "layout", { nativeEvent: { layout: { width: 0 } } });
    expect(view.queryByTestId("effort-picker")).toBeNull();
    await fireEvent(owner, "layout", { nativeEvent: { layout: { width: 320 } } });
    expect(view.getByTestId("effort-picker")).toBeTruthy();
    expired("hard");
    expect(change).not.toHaveBeenCalled();
  });
  it("blocks and focuses an unavailable RHF value, clears explicitly, and closes on same-value reset", async () => {
    const submit = jest.fn();
    function Harness() {
      const form = useZodForm({
        schema: z.object({ effort: z.string().optional() }),
        defaultValues: { effort: "legacy" },
      });
      const action = useZodFormSubmit({ form, onSubmit: submit });
      return (
        <>
          <FormChoiceField
            control={form.control}
            name="effort"
            label="Effort"
            options={options}
            clearable
            nativePresentation="searchable"
            testId="bound-effort"
          />
          <Button onPress={() => void action.handleSubmit()}>
            <Text>Save</Text>
          </Button>
          <Button onPress={() => form.reset({ effort: "easy" })}>
            <Text>Reset</Text>
          </Button>
        </>
      );
    }
    const view = await renderNative(<Harness />);
    jest.mocked(findNodeHandle).mockReturnValueOnce(42);
    await fireEvent.press(view.getByText("Save"));
    expect(submit).not.toHaveBeenCalled();
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledWith(42);
    await fireEvent.press(view.getByLabelText("Clear Effort"));
    await fireEvent.press(view.getByText("Save"));
    expect(submit).toHaveBeenCalledWith({ effort: undefined });
    await fireEvent.press(view.getByText("Reset"));
    await fireEvent.press(view.getByTestId("bound-effort"));
    const expired = view.getByTestId("bound-effort-picker").props.onValueChange;
    await fireEvent.press(view.getByText("Reset"));
    expect(view.queryByTestId("bound-effort-picker")).toBeNull();
    expired("hard");
    await fireEvent.press(view.getByText("Save"));
    expect(submit).toHaveBeenLastCalledWith({ effort: "easy" });
  });
  it("uses a searchable overlay only when requested and preserves closed-callback guards", async () => {
    const change = jest.fn();
    const clear = jest.fn();
    const view = await renderNative(
      <ChoiceField
        label="Effort"
        testId="effort"
        value="legacy"
        options={options}
        onChange={change}
        onClear={clear}
        nativePresentation="searchable"
      />,
    );
    expect(view.queryByTestId("effort-picker")).toBeNull();
    expect(view.getByText("legacy (unavailable)")).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId("effort"));
    expect(view.getByLabelText("Search Effort")).toBeTruthy();
    const picker = view.getByTestId("effort-picker");
    const queued = picker.props.onValueChange;
    expect(
      view.container.queryAll((node) => node.type === "Modal")[0]?.props.presentationStyle,
    ).toBe("fullScreen");
    await fireEvent.press(view.getByLabelText("Close Effort"));
    queued("hard");
    expect(change).not.toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText("Clear Effort"));
    expect(clear).toHaveBeenCalledTimes(1);
  });
  it("registers real RN accessibility focus and disables the actual trigger", async () => {
    const ref = createRef<{ focus: () => void }>();
    const view = await renderNative(
      <ChoiceField
        ref={ref}
        label="Effort"
        value={undefined}
        options={options}
        onChange={jest.fn()}
        disabled
        testId="effort"
      />,
    );
    jest.mocked(findNodeHandle).mockReturnValueOnce(42);
    ref.current?.focus();
    expect(AccessibilityInfo.setAccessibilityFocus).toHaveBeenCalledWith(42);
    const picker = view.getByTestId("effort-picker");
    expect(picker.props.enabled).toBe(false);
    expect(view.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
  });
  it("exposes short-pair and panel choices immediately without another modal", async () => {
    const change = jest.fn();
    const props = { label: "Effort", testId: "effort", value: "easy", options, onChange: change };
    const view = await renderNative(<ChoiceField {...props} />);
    expect(view.getByTestId("effort-picker")).toBeTruthy();
    expect(view.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
    await view.rerender(<ChoiceField {...props} presentation="panel" />);
    await fireEvent(view.getByTestId("effort-picker"), "valueChange", "hard");
    expect(change).toHaveBeenCalledWith("hard");
    expect(view.container.queryAll((node) => node.type === "Modal")).toHaveLength(0);
  });
  it("filters large sets without replacing an unavailable value or auto-selecting a result", async () => {
    const change = jest.fn();
    const many = Array.from({ length: 9 }, (_, index) => ({
      value: String(index),
      label: `Option ${index}`,
    }));
    const view = await renderNative(
      <ChoiceField
        label="Catalog"
        testId="catalog"
        value="retired"
        options={many}
        onChange={change}
      />,
    );
    await fireEvent.press(view.getByTestId("catalog"));
    await fireEvent(view.getByLabelText("Search Catalog"), "changeText", "Option 7");
    expect(change).not.toHaveBeenCalled();
    await fireEvent(view.getByTestId("catalog-picker"), "valueChange", "7");
    expect(change).toHaveBeenCalledWith("7");
    expect(view.container.queryAll((node) => node.type === "Modal")[0]?.props.visible).toBe(false);
  });
});
