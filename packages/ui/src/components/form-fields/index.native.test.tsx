import type { ReactTestInstance } from "react-test-renderer";
import { z } from "zod";

import { useZodForm } from "../../hooks/use-zod-form";
import { fireEvent, renderNative } from "../../test/render-native";
import { Form, FormItem, FormLabel } from "../form/index.native";
import { Text } from "../text/index.native";
import {
  FormBoundedNumberField,
  FormDateTimeField,
  FormDurationField,
  FormIntegerStepperField,
  FormPaceField,
  FormPercentSliderField,
  FormSegmentedSelectField,
  FormTextareaField,
  FormTextField,
  FormTimeInputField,
  FormWeightInputField,
} from "./index.native";

const profileSchema = z.object({
  activity_type: z.string(),
  bio: z.string().nullable(),
  duration: z.string(),
  ftp: z.number().optional(),
  max_sessions: z.number(),
  pace: z.string(),
  recorded_at: z.string(),
  recovery_priority: z.number(),
  wake_time: z.string().nullable(),
  weight_kg: z.number().nullable(),
  username: z.string(),
});

function getPickerByMode(nodes: ReactTestInstance[], mode: "date" | "time"): ReactTestInstance {
  const node = nodes.find((candidate) => candidate.props.mode === mode);

  if (!node) {
    throw new Error(`Expected ${mode} picker to be rendered`);
  }

  return node;
}

function getLastNode(nodes: ReactTestInstance[], label: string): ReactTestInstance {
  const node = nodes.at(-1);

  if (!node) {
    throw new Error(`Expected ${label} to be rendered`);
  }

  return node;
}

function FormFieldsHarness() {
  const methods = useZodForm({
    schema: profileSchema,
    defaultValues: {
      activity_type: "run",
      bio: null,
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      pace: "4:30",
      recorded_at: "2026-03-23T06:30",
      recovery_priority: 0.5,
      wake_time: "06:30",
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
      <FormDateTimeField
        control={methods.control}
        dateLabel="Recorded date"
        label="Recorded At"
        name="recorded_at"
        timeLabel="Recorded time"
        testId="recorded-at-field"
      />
      <FormSegmentedSelectField
        control={methods.control}
        label="Activity Type"
        name="activity_type"
        options={[
          { label: "Run", value: "run" },
          { label: "Ride", value: "bike" },
        ]}
        testId="activity-type-field"
      />
      <FormTimeInputField
        control={methods.control}
        label="Wake Time"
        name="wake_time"
        pickerPresentation="modal"
        testId="wake-time-field"
      />
      <FormBoundedNumberField control={methods.control} decimals={0} label="FTP" name="ftp" />
      <FormPaceField control={methods.control} label="Pace" name="pace" />
      <FormPercentSliderField
        control={methods.control}
        decimals={0}
        label="Recovery Priority"
        max={100}
        min={0}
        name="recovery_priority"
        step={1}
        valueMode="fraction"
      />
      <FormWeightInputField control={methods.control} label="Weight" name="weight_kg" unit="kg" />
      <Text>{JSON.stringify(methods.watch())}</Text>
    </Form>
  );
}

function DetachedFormLabelHarness() {
  const methods = useZodForm({
    schema: profileSchema,
    defaultValues: {
      activity_type: "run",
      bio: null,
      duration: "0:20:00",
      ftp: 250,
      max_sessions: 3,
      pace: "4:30",
      recorded_at: "2026-03-23T06:30",
      recovery_priority: 0.5,
      wake_time: "06:30",
      weight_kg: 70,
      username: "Avery",
    },
  });

  return (
    <Form {...methods}>
      <FormItem>
        <FormLabel>Detached label</FormLabel>
      </FormItem>
    </Form>
  );
}

describe("Form fields native", () => {
  it("binds shared controlled wrappers to react-hook-form", () => {
    const { getAllByText, getByLabelText, getByTestId, getByText, UNSAFE_getAllByType } =
      renderNative(<FormFieldsHarness />);
    const getAllByTypeName = UNSAFE_getAllByType as unknown as (
      type: string,
    ) => ReactTestInstance[];

    fireEvent(getByLabelText("Username"), "changeText", "Taylor");
    fireEvent(getByLabelText("Bio"), "changeText", "Coach");
    fireEvent.press(getByTestId("wake-time-field"));
    const timePicker = getLastNode(
      getAllByTypeName("DateTimePicker").filter((node) => node.props.mode === "time"),
      "time picker",
    );
    fireEvent(timePicker, "change", {}, new Date(2026, 2, 23, 3, 45));
    fireEvent.press(getLastNode(getAllByText("Done"), "Done button"));
    fireEvent(getByLabelText("Duration"), "changeText", "45:00");
    fireEvent(getByLabelText("Duration"), "blur");
    fireEvent.press(getByText("+"));
    fireEvent.press(getByTestId("recorded-at-field-date"));
    const datePicker = getPickerByMode(getAllByTypeName("DateTimePicker"), "date");
    fireEvent(datePicker, "change", {}, new Date(2026, 2, 24, 0, 0));
    fireEvent.press(getLastNode(getAllByText("Done"), "Done button"));
    fireEvent.press(getByTestId("recorded-at-field-time"));
    const recordedTimePicker = getPickerByMode(getAllByTypeName("DateTimePicker"), "time");
    fireEvent(recordedTimePicker, "change", {}, new Date(2026, 2, 24, 4, 15));
    fireEvent.press(getLastNode(getAllByText("Done"), "Done button"));
    fireEvent.press(getByTestId("activity-type-field-bike"));
    fireEvent(getByLabelText("FTP"), "changeText", "300");
    fireEvent(getByLabelText("FTP"), "blur");
    fireEvent(getByLabelText("Pace"), "changeText", "04:05");
    fireEvent(getByLabelText("Pace"), "blur");
    fireEvent(getByLabelText("Recovery Priority"), "changeText", "75");
    fireEvent(getByLabelText("Recovery Priority"), "blur");
    fireEvent(getByLabelText("Weight"), "changeText", "72.5");
    fireEvent(getByLabelText("Weight"), "blur");

    expect(getByText(/"username":"Taylor"/)).toBeTruthy();
    expect(getByText(/"bio":"Coach"/)).toBeTruthy();
    expect(getByText(/"wake_time":"03:45"/)).toBeTruthy();
    expect(getByText(/"duration":"0:45:00"/)).toBeTruthy();
    expect(getByText(/"max_sessions":4/)).toBeTruthy();
    expect(getByText(/"recorded_at":"2026-03-24T04:15"/)).toBeTruthy();
    expect(getByText(/"activity_type":"bike"/)).toBeTruthy();
    expect(getByText(/"ftp":300/)).toBeTruthy();
    expect(getByText(/"pace":"4:05"/)).toBeTruthy();
    expect(getByText(/"recovery_priority":0.75/)).toBeTruthy();
    expect(getByText(/"weight_kg":72.5/)).toBeTruthy();
  });

  it("throws a clear error when form subcomponents render outside FormField", () => {
    expect(() => renderNative(<DetachedFormLabelHarness />)).toThrow(
      "useFormField should be used within <FormField>",
    );
  });
});
