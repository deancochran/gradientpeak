import { act } from "react";
import { Controller } from "react-hook-form";
import { Pressable, Text } from "react-native";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { useZodFormSubmit } from "../../hooks/use-zod-form-submit";
import { fireEvent, renderNative } from "../../test/render-native";
import { PaceSecondsField } from "./index.native";

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
  it("retains an incomplete draft and emits a corrected valid value before blur", async () => {
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
    const input = getByTestId("pace-input");

    await fireEvent(input, "changeText", "4:3");
    expect(getByTestId("pace-input").props.value).toBe("4:3");
    expect(onChangeSeconds).not.toHaveBeenCalled();

    await fireEvent(getByTestId("pace-input"), "changeText", "4:35");
    expect(onChangeSeconds).toHaveBeenCalledWith(275);
    expect(onBlur).not.toHaveBeenCalled();
    await fireEvent(getByTestId("pace-input"), "blur");

    expect(onChangeSeconds).toHaveBeenCalledWith(275);
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("treats empty text as an intentional clear", async () => {
    const onChangeSeconds = jest.fn();
    const { getByTestId } = await renderNative(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        testId="pace-input"
        valueSeconds={270}
      />,
    );

    await fireEvent(getByTestId("pace-input"), "changeText", "");

    expect(onChangeSeconds).toHaveBeenCalledWith(null);
  });

  it("flushes a valid focused draft before submit", async () => {
    const onSubmit = jest.fn();
    const { findByText, getByTestId } = await renderNative(<FormHarness onSubmit={onSubmit} />);

    await fireEvent(getByTestId("pace-input"), "changeText", "5:45");
    await act(async () => {
      await fireEvent.press(await findByText("Save"));
    });

    expect(onSubmit).toHaveBeenCalledWith({ pace: 345 });
  });

  it("retains an incomplete submitted draft and exposes the error to accessibility", async () => {
    const onSubmit = jest.fn();
    const { findByText, getByTestId } = await renderNative(<FormHarness onSubmit={onSubmit} />);

    await fireEvent(getByTestId("pace-input"), "changeText", "4:3");
    await act(async () => {
      await fireEvent.press(await findByText("Save"));
    });

    const input = getByTestId("pace-input");
    expect(input.props.value).toBe("4:3");
    expect(input.props["aria-invalid"]).toBe(true);
    expect(input.props.accessibilityHint).toContain("Error: Pace is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("discards a same-value pending draft on reset", async () => {
    const { findByText, getByTestId } = await renderNative(<FormHarness onSubmit={jest.fn()} />);
    await fireEvent(getByTestId("pace-input"), "changeText", "4:3");

    await fireEvent.press(await findByText("Reset"));

    expect(getByTestId("pace-input").props.value).toBe("5:30");
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
    await fireEvent(getByTestId("pace-input"), "changeText", "4:3");

    await rerender(
      <PaceSecondsField
        id="pace"
        label="Pace"
        onChangeSeconds={onChangeSeconds}
        testId="pace-input"
        valueSeconds={360}
      />,
    );

    expect(getByTestId("pace-input").props.value).toBe("6:00");
  });
});
