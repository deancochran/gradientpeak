import { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { act } from "@testing-library/react-native/pure";
import { AccessibilityInfo, findNodeHandle, Platform } from "react-native";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { fireEvent, renderNative } from "../../test/render-native";
import { Button } from "../button/index.native";
import { Form, FormDateInputField, FormDurationField, FormPaceField } from "../form/index.native";
import { Text } from "../text/index.native";

const defaults = { elapsed: "1:30:00", pace: "3:15", date: "2026-03-08" };
function Owner() {
  const form = useZodForm({
    schema: z.object({ elapsed: z.string(), pace: z.string(), date: z.string() }),
    defaultValues: defaults,
  });
  const values = form.watch();
  return (
    <Form {...form}>
      <FormDurationField control={form.control} name="elapsed" label="Elapsed" layout="ms" />
      <FormPaceField control={form.control} name="pace" label="Pace" />
      <FormDateInputField control={form.control} name="date" label="Date" testId="date" />
      <Button onPress={() => form.reset(defaults)}>
        <Text>Reset form</Text>
      </Button>
      <Text testId="values">{JSON.stringify(values)}</Text>
    </Form>
  );
}

describe("native form presentation ownership", () => {
  it("dismisses the owned Android date dialog before presenting a time overlay", async () => {
    Platform.OS = "android";
    try {
      const view = await renderNative(<Owner />);
      await fireEvent.press(view.getByTestId("date"));
      expect(DateTimePickerAndroid.open).toHaveBeenCalled();
      await fireEvent.press(view.getByLabelText("Elapsed"));
      expect(DateTimePickerAndroid.dismiss).toHaveBeenCalledWith("date");
      expect(
        view.container.queryAll((node) => node.type === "Modal" && node.props.visible),
      ).toHaveLength(1);
      expect(view.getByLabelText("Elapsed minutes")).toBeTruthy();
    } finally {
      Platform.OS = "ios";
    }
  });
  it("has one active input overlay and rejects callbacks/focus after full form reset", async () => {
    const view = await renderNative(<Owner />);
    const queuedPaceOpen = view.getByLabelText("Pace").props.onPress;
    await fireEvent.press(view.getByLabelText("Elapsed"));
    const oldElapsed = view.getByLabelText("Elapsed minutes").props.onValueChange;
    await act(async () => queuedPaceOpen());
    expect(
      view.container.queryAll((node) => node.type === "Modal" && node.props.visible),
    ).toHaveLength(1);
    expect(view.queryByLabelText("Elapsed minutes")).toBeNull();
    const oldPace = view.getByLabelText("Pace seconds").props.onValueChange;
    const dismiss = view.container.queryAll(
      (node) => node.type === "Modal" && node.props.visible,
    )[0]?.props.onDismiss;
    await fireEvent.press(view.getByText("Reset form"));
    await act(async () => {
      oldElapsed(100);
      oldPace(45);
      dismiss();
    });
    expect(
      view.container.queryAll((node) => node.type === "Modal" && node.props.visible),
    ).toHaveLength(0);
    expect(view.getByTestId("values").props.children).toBe(JSON.stringify(defaults));
    expect(findNodeHandle).not.toHaveBeenCalled();
    expect(AccessibilityInfo.setAccessibilityFocus).not.toHaveBeenCalled();
  });
  it("shares ownership with DateInput without retaining two active modals", async () => {
    const view = await renderNative(<Owner />);
    const queuedDateOpen = view.getByTestId("date").props.onPress;
    await fireEvent.press(view.getByLabelText("Elapsed"));
    await act(async () => queuedDateOpen());
    expect(
      view.container.queryAll((node) => node.type === "Modal" && node.props.visible),
    ).toHaveLength(1);
    expect(view.queryByLabelText("Elapsed minutes")).toBeNull();
    expect(view.getByText("Done")).toBeTruthy();
  });
});
