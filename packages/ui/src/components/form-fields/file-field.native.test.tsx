import { act } from "react-test-renderer";
import { z } from "zod";
import { useZodForm } from "../../hooks/use-zod-form";
import { fireEvent, renderNative } from "../../test/render-native";
import { Button } from "../button/index.native";
import type { SelectedFile } from "../file-input/shared";
import { Form } from "../form/index.native";
import { Text } from "../text/index.native";
import { FormFileField } from "./index.native";

const fileSchema = z.object({
  files: z.array(z.custom<SelectedFile>()).min(1, "Choose at least one file"),
});

function FileFieldHarness({ disabled = false }: { disabled?: boolean }) {
  const methods = useZodForm({ schema: fileSchema, defaultValues: { files: [] } });

  return (
    <Form {...methods}>
      <FormFileField
        accept=".fit,.gpx"
        control={methods.control}
        description="FIT or GPX"
        disabled={disabled}
        label="Activity files"
        name="files"
        nativeMimeTypes="application/octet-stream"
        required
        testId="form-files"
      />
      <Button onPress={() => void methods.trigger("files")} testId="validate-files">
        <Text>Validate</Text>
      </Button>
      <Button onPress={() => methods.reset({ files: [] })} testId="reset-files">
        <Text>Reset</Text>
      </Button>
    </Form>
  );
}

describe("FormFileField native", () => {
  it("uses [] by default, validates, updates, and resets the controlled files", async () => {
    const rendered = renderNative(<FileFieldHarness />);

    await act(async () => {
      fireEvent.press(rendered.getByTestId("validate-files"));
    });
    expect(rendered.getByText("Choose at least one file")).toBeTruthy();
    expect(rendered.getByTestId("form-files").props["aria-invalid"]).toBe(true);
    expect(rendered.getByTestId("form-files").props.accessibilityHint).toContain(
      "Choose at least one file",
    );

    await act(async () => {
      fireEvent.press(rendered.getByTestId("form-files"));
    });
    expect(rendered.getByText("mock-file.fit (2.0 KB)")).toBeTruthy();

    act(() => fireEvent.press(rendered.getByTestId("reset-files")));
    expect(rendered.queryByText(/mock-file\.fit/)).toBeNull();
    expect(rendered.getByText("Choose file")).toBeTruthy();
  });

  it("prevents wrapper interactions when disabled", async () => {
    const rendered = renderNative(<FileFieldHarness disabled />);
    const picker = rendered.getByTestId("form-files");

    expect(picker.props.disabled).toBe(true);
    await fireEvent.press(picker);
    expect(rendered.queryByText(/mock-file\.fit/)).toBeNull();
  });
});
