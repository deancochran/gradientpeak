import { act } from "react";
import { Controller } from "react-hook-form";
import { Pressable, Text } from "react-native";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { fireEvent, renderNative, screen } from "../../test/render-native";
import { PaceSecondsField } from "./index.native";

async function openPace() {
  await fireEvent.press(screen.getByLabelText("Pace"));
}

function FormHarness({ onSubmit }: { onSubmit: (value: { pace: number }) => void }) {
  const form = useZodForm({
    schema: z.object({ pace: z.number({ message: "Pace is required" }) }),
    defaultValues: { pace: 330 },
  });
  const submit = useZodFormSubmit({ form, onSubmit });

  return (
    <>
      <Controller
        control={form.control}
        name="pace"
        render={({ field, fieldState }) => (
          <PaceSecondsField
            error={fieldState.error?.message}
            formControl={form.control}
            id="pace"
            label="Pace"
            onBlur={field.onBlur}
            onChangeSeconds={field.onChange}
            testId="pace-input"
            valueSeconds={field.value}
          />
        )}
      />
      <Pressable accessibilityRole="button" onPress={submit.handleSubmit}>
        <Text>Save</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => form.reset({ pace: 330 })}>
        <Text>Reset</Text>
      </Pressable>
    </>
  );
}

describe("PaceSecondsField native", () => {
  it.each([195, 195.125])("retains canonical pace %s when untouched", async (valueSeconds) => {
    const onChangeSeconds = jest.fn();
    const view = await renderNative(
      <PaceSecondsField
        label="Pace"
        valueSeconds={valueSeconds}
        onChangeSeconds={onChangeSeconds}
      />,
    );
    await openPace();
    expect(view.getByLabelText("Pace minutes").props.selectedValue).toBe(3);
    expect(view.getByLabelText("Pace seconds").props.selectedValue).toBe(15);
    await fireEvent.press(view.getByLabelText("Done Pace"));
    expect(onChangeSeconds).not.toHaveBeenCalled();
  });
  it("adjusts canonical pace by five seconds", async () => {
    const onChangeSeconds = jest.fn();
    const { getByLabelText } = await renderNative(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        valueSeconds={270}
      />,
    );
    await fireEvent.press(getByLabelText("Increase Pace"));
    await fireEvent.press(getByLabelText("Decrease Pace"));
    expect(onChangeSeconds).toHaveBeenNthCalledWith(1, 275);
    expect(onChangeSeconds).toHaveBeenNthCalledWith(2, 270);
  });
  it("emits a corrected native-wheel value before close", async () => {
    const onBlur = jest.fn();
    const onChangeSeconds = jest.fn();
    const { getByTestId } = await renderNative(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onBlur={onBlur}
        onChangeSeconds={onChangeSeconds}
        testId="pace-input"
        valueSeconds={270}
      />,
    );
    await openPace();
    await fireEvent(getByTestId("pace-seconds"), "valueChange", 35);
    expect(onChangeSeconds).toHaveBeenCalledWith(275);
    expect(onBlur).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByLabelText("Done Pace"));

    expect(onChangeSeconds).toHaveBeenCalledWith(275);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("treats empty text as an intentional clear", async () => {
    const onChangeSeconds = jest.fn();
    const { getByLabelText } = await renderNative(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        testId="pace-input"
        valueSeconds={270}
      />,
    );

    await openPace();
    await fireEvent.press(getByLabelText("Clear Pace"));

    expect(onChangeSeconds).toHaveBeenCalledWith(null);
  });

  it("flushes a valid focused draft before submit", async () => {
    const onSubmit = jest.fn();
    const { findByText, getByTestId } = await renderNative(<FormHarness onSubmit={onSubmit} />);

    await openPace();
    await fireEvent(getByTestId("pace-seconds"), "valueChange", 45);
    await fireEvent.press(screen.getByLabelText("Done Pace"));
    await act(async () => {
      await fireEvent.press(await findByText("Save"));
    });

    expect(onSubmit).toHaveBeenCalledWith({ pace: 345 });
  });

  it("blocks an invalid zero pace, announces the error, and submits only after correction", async () => {
    const onSubmit = jest.fn();
    const { findByText, getByTestId } = await renderNative(<FormHarness onSubmit={onSubmit} />);

    await openPace();
    await fireEvent(getByTestId("pace-minutes"), "valueChange", 0);
    await fireEvent(getByTestId("pace-seconds"), "valueChange", 0);
    await act(async () => {
      await fireEvent.press(await findByText("Save"));
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(getByTestId("pace-minutes").props.selectedValue).toBe(0);
    expect(getByTestId("pace-seconds").props.selectedValue).toBe(0);
    await fireEvent(getByTestId("pace-minutes"), "valueChange", 5);
    await fireEvent(getByTestId("pace-seconds"), "valueChange", 35);
    await act(async () => {
      await fireEvent.press(await findByText("Save"));
    });

    expect(onSubmit).toHaveBeenCalledWith({ pace: 335 });
  });

  it("discards a same-value pending draft on reset", async () => {
    const { findByText, getByTestId } = await renderNative(<FormHarness onSubmit={jest.fn()} />);
    await openPace();
    await fireEvent(getByTestId("pace-seconds"), "valueChange", 35);

    await fireEvent.press(await findByText("Reset"));

    await openPace();
    expect(getByTestId("pace-minutes").props.selectedValue).toBe(5);
    expect(getByTestId("pace-seconds").props.selectedValue).toBe(30);
  });

  it("resynchronizes when the external value changes", async () => {
    const onChangeSeconds = jest.fn();
    const { getByTestId, rerender } = await renderNative(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        testId="pace-input"
        valueSeconds={330}
      />,
    );
    await openPace();
    await fireEvent(getByTestId("pace-seconds"), "valueChange", 35);

    await rerender(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        testId="pace-input"
        valueSeconds={360}
      />,
    );

    expect(getByTestId("pace-minutes").props.selectedValue).toBe(6);
    expect(getByTestId("pace-seconds").props.selectedValue).toBe(0);
  });
});
