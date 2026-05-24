import {
  PROFILE_METRIC_RANGES,
  PROFILE_METRIC_UNITS,
  type ProfileMetricType,
} from "@repo/core/schemas/profile-metrics";
import { Button } from "@repo/ui/components/button";
import { DialogFooter } from "@repo/ui/components/dialog";
import {
  Form,
  FormBoundedNumberField,
  FormDateTimeField,
  FormTextareaField,
} from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { z } from "zod";

const profileMetricFormSchema = z.object({
  notes: z.string().max(1000).optional(),
  recorded_at: z.string().min(1, "Choose when this metric was recorded."),
  value: z.coerce.number().positive("Enter a positive value."),
});

export type ProfileMetricFormInput = z.input<typeof profileMetricFormSchema>;
export type ProfileMetricFormValues = z.infer<typeof profileMetricFormSchema>;

type ProfileMetricFormProps = {
  metricType: ProfileMetricType;
  onCancel: () => void;
  onSubmit: (values: ProfileMetricFormValues) => Promise<unknown> | unknown;
  pending?: boolean;
  values?: ProfileMetricFormInput;
};

export function toDateTimeLocalValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function getProfileMetricFormValues(
  metricType: ProfileMetricType,
  metric?: { notes?: string | null; recorded_at?: Date | string; value?: number } | null,
): ProfileMetricFormInput {
  return {
    notes: metric?.notes ?? "",
    recorded_at: toDateTimeLocalValue(metric?.recorded_at ?? new Date()),
    value: metric?.value ?? PROFILE_METRIC_RANGES[metricType].min,
  };
}

export function ProfileMetricForm({
  metricType,
  onCancel,
  onSubmit,
  pending = false,
  values,
}: ProfileMetricFormProps) {
  const form = useZodForm<ProfileMetricFormInput, undefined, ProfileMetricFormValues>({
    schema: profileMetricFormSchema,
    values: values ?? getProfileMetricFormValues(metricType),
  });
  const submit = useZodFormSubmit<ProfileMetricFormValues>({
    form,
    onSubmit: async (formValues) => {
      await onSubmit(formValues);
    },
    shouldRethrow: false,
    submittingLabel: "Saving...",
  });
  const isPending = pending || submit.isSubmitting;
  const submitButtonState = submit.getSubmitButtonState({
    disabled: pending,
    label: "Save",
    submittingLabel: "Saving...",
  });

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={submit.handleSubmit}>
        <FormBoundedNumberField
          control={form.control}
          decimals={2}
          label={`Value (${PROFILE_METRIC_UNITS[metricType]})`}
          max={PROFILE_METRIC_RANGES[metricType].max}
          min={PROFILE_METRIC_RANGES[metricType].min}
          name="value"
          unitLabel={PROFILE_METRIC_UNITS[metricType]}
        />
        <FormDateTimeField control={form.control} label="Recorded at" name="recorded_at" />
        <FormTextareaField
          control={form.control}
          label="Notes"
          name="notes"
          placeholder="Optional context"
        />
        {submit.submitError?.message ? (
          <p className="text-sm text-destructive">{submit.submitError.message}</p>
        ) : null}
        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <LoadingButton
            disabled={submitButtonState.disabled}
            loading={isPending}
            loadingLabel={submitButtonState.loadingLabel}
            type="submit"
          >
            {submitButtonState.label}
          </LoadingButton>
        </DialogFooter>
      </form>
    </Form>
  );
}
