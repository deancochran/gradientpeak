import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { fireEvent, renderNative } from "../../test/render-native";
import { Button } from "../button/index.native";
import { Form } from "../form/index.native";
import { Text } from "../text/index.native";
import { FormBoundedNumberField, FormPaceField, FormWeightInputField } from "./index.native";

const schema = z.object({ amount: z.any(), pace: z.any(), weight: z.any() });
const defaults = { amount: 3, pace: "4:30", weight: 70.123456789 };
function Harness({ onSubmit }: { onSubmit: (value: z.infer<typeof schema>) => void }) {
  const form = useZodForm({ schema, defaultValues: defaults });
  const submit = useZodFormSubmit({ form, onSubmit });
  return (
    <Form {...form}>
      <FormBoundedNumberField
        control={form.control}
        name="amount"
        label="Amount"
        decimals={0}
        emptyValue={null}
        testId="amount"
      />
      <FormPaceField control={form.control} name="pace" label="Pace" testId="pace" />
      <FormWeightInputField
        control={form.control}
        name="weight"
        label="Weight"
        unit="kg"
        onUnitChange={() => undefined}
        testId="weight"
      />
      <Button onPress={() => void submit.handleSubmit()}>
        <Text>Save</Text>
      </Button>
      <Button onPress={() => form.reset(defaults)}>
        <Text>Reset</Text>
      </Button>
    </Form>
  );
}

describe("native semantic form contracts", () => {
  it.each([
    "amount",
  ])("blocks optional invalid %s and clears it on same-value reset", async (name) => {
    const submit = jest.fn();
    const view = await renderNative(<Harness onSubmit={submit} />);
    const inputId = name;
    await fireEvent(view.getByTestId(inputId), "changeText", "3oops");
    await fireEvent(view.getByTestId(inputId), "blur");
    await fireEvent.press(view.getByText("Save"));
    expect(submit).not.toHaveBeenCalled();
    expect(view.getByTestId(inputId).props.value).toBe("3oops");
    await fireEvent.press(view.getByText("Reset"));
    await fireEvent.press(view.getByText("Save"));
    expect(submit).toHaveBeenCalledWith(defaults);
  });
  it("rejects fractional counts and flushes a corrected last keystroke", async () => {
    const submit = jest.fn();
    const view = await renderNative(<Harness onSubmit={submit} />);
    await fireEvent(view.getByTestId("amount"), "changeText", "2.5");
    await fireEvent.press(view.getByText("Save"));
    expect(submit).not.toHaveBeenCalled();
    await fireEvent(view.getByTestId("amount"), "changeText", "7");
    await fireEvent.press(view.getByText("Save"));
    expect(submit).toHaveBeenCalledWith({ ...defaults, amount: 7 });
  });
});
