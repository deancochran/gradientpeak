import { Button } from "@repo/ui/components/button";
import { DialogFooter } from "@repo/ui/components/dialog";
import {
  Form,
  FormBoundedNumberField,
  FormDateTimeField,
  FormIntegerStepperField,
  FormSegmentedSelectField,
  FormTextField,
} from "@repo/ui/components/form";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";

import {
  type ActivityEffortFormInput,
  type ActivityEffortFormValues,
  activityEffortFormSchema,
  activityTypeOptions,
} from "../../lib/activity-route-form-schemas";

type ActivityEffortFormProps = {
  actionLayout?: "default" | "dialog";
  cancelLabel?: string;
  defaultValues?: ActivityEffortFormInput;
  onCancel: () => void;
  onSubmit: (values: ActivityEffortFormValues) => Promise<unknown> | unknown;
  onSubmitError?: (error: unknown) => Promise<void> | void;
  pending?: boolean;
  submitLabel: string;
  submittingLabel?: string;
  values?: ActivityEffortFormInput;
};

export function toDateTimeLocalValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function getActivityEffortDefaultValues(): ActivityEffortFormInput {
  return {
    activity_category: "run",
    duration_seconds: 60,
    effort_type: "power",
    recorded_at: toDateTimeLocalValue(new Date()),
    unit: "W",
    value: 0,
  };
}

export function ActivityEffortForm({
  actionLayout = "default",
  cancelLabel = "Cancel",
  defaultValues = getActivityEffortDefaultValues(),
  onCancel,
  onSubmit,
  onSubmitError,
  pending = false,
  submitLabel,
  submittingLabel = submitLabel,
  values,
}: ActivityEffortFormProps) {
  const form = useZodForm<ActivityEffortFormInput, undefined, ActivityEffortFormValues>({
    defaultValues,
    schema: activityEffortFormSchema,
    values,
  });
  const submit = useZodFormSubmit<ActivityEffortFormValues>({
    form,
    onError: onSubmitError,
    onSubmit: async (values) => {
      await onSubmit(values);
    },
    shouldRethrow: false,
  });
  const isPending = pending || submit.isSubmitting;
  const rootError = form.formState.errors.root?.message ?? submit.submitError?.message;
  const actions = (
    <>
      <Button onClick={onCancel} type="button" variant="outline">
        {cancelLabel}
      </Button>
      <Button disabled={isPending} type="submit">
        {isPending ? submittingLabel : submitLabel}
      </Button>
    </>
  );

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={submit.handleSubmit}>
        <FormSegmentedSelectField
          control={form.control}
          label="Activity category"
          name="activity_category"
          options={activityTypeOptions.map((option) => ({ ...option }))}
        />
        <FormSegmentedSelectField
          control={form.control}
          label="Effort type"
          name="effort_type"
          options={[
            { label: "Power", value: "power" },
            { label: "Speed", value: "speed" },
          ]}
        />
        <FormIntegerStepperField
          control={form.control}
          label="Duration (seconds)"
          max={7200}
          min={1}
          name="duration_seconds"
          step={5}
        />
        <FormBoundedNumberField
          control={form.control}
          decimals={1}
          label="Value"
          min={0}
          name="value"
        />
        <FormTextField control={form.control} label="Unit" name="unit" />
        <FormDateTimeField control={form.control} label="Recorded at" name="recorded_at" />
        {rootError ? <p className="text-sm text-destructive">{rootError}</p> : null}
        {actionLayout === "dialog" ? (
          <DialogFooter>{actions}</DialogFooter>
        ) : (
          <div className="flex flex-wrap justify-end gap-3">{actions}</div>
        )}
      </form>
    </Form>
  );
}
