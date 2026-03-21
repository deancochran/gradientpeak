import { z } from "zod";

import { useZodForm } from "../../hooks/use-zod-form";
import { fireEvent, renderNative } from "../../test/render-native";
import { Form } from "../form/index.native";
import { Text } from "../text/index.native";
import {
  FormBoundedNumberField,
  FormDurationField,
  FormIntegerStepperField,
  FormPaceField,
  FormTextareaField,
  FormTextField,
  FormWeightInputField,
} from "./index.native";

const profileSchema = z.object({
  bio: z.string().nullable(),
  duration: z.string(),
  ftp: z.number().optional(),
  max_sessions: z.number(),
  pace: z.string(),
  weight_kg: z.number().nullable(),
  username: z.string(),
});

function FormFieldsHarness() {
  const methods = useZodForm({
    schema: profileSchema,
    defaultValues: {
      bio: null,
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      pace: "4:30",
      weight_kg: 70,
      username: "Avery",
    },
  });

  return (
    <Form {...methods}>
      <FormTextField control={methods.control} label="Username" name="username" />
      <FormTextareaField
        control={methods.control}
        formatValue={(value) => value ?? ""}
        label="Bio"
        name="bio"
        parseValue={(value) => value || null}
      />
      <FormDurationField control={methods.control} label="Duration" name="duration" />
      <FormIntegerStepperField
        control={methods.control}
        label="Max Sessions"
        max={14}
        min={0}
        name="max_sessions"
      />
      <FormBoundedNumberField control={methods.control} decimals={0} label="FTP" name="ftp" />
      <FormPaceField control={methods.control} label="Pace" name="pace" />
      <FormWeightInputField control={methods.control} label="Weight" name="weight_kg" unit="kg" />
      <Text>{JSON.stringify(methods.watch())}</Text>
    </Form>
  );
}

describe("Form fields native", () => {
  it("binds shared controlled wrappers to react-hook-form", () => {
    const { getByLabelText, getByText } = renderNative(<FormFieldsHarness />);

    fireEvent(getByLabelText("Username"), "changeText", "Taylor");
    fireEvent(getByLabelText("Bio"), "changeText", "Coach");
    fireEvent(getByLabelText("Duration"), "changeText", "45:00");
    fireEvent(getByLabelText("Duration"), "blur");
    fireEvent.press(getByText("+"));
    fireEvent(getByLabelText("FTP"), "changeText", "300");
    fireEvent(getByLabelText("FTP"), "blur");
    fireEvent(getByLabelText("Pace"), "changeText", "04:05");
    fireEvent(getByLabelText("Pace"), "blur");
    fireEvent(getByLabelText("Weight"), "changeText", "72.5");
    fireEvent(getByLabelText("Weight"), "blur");

    expect(getByText(/"username":"Taylor"/)).toBeTruthy();
    expect(getByText(/"bio":"Coach"/)).toBeTruthy();
    expect(getByText(/"duration":"0:45:00"/)).toBeTruthy();
    expect(getByText(/"max_sessions":4/)).toBeTruthy();
    expect(getByText(/"ftp":300/)).toBeTruthy();
    expect(getByText(/"pace":"4:05"/)).toBeTruthy();
    expect(getByText(/"weight_kg":72.5/)).toBeTruthy();
  });
});
