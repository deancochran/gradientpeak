import {
  getCanonicalProfileMetricValueFromDisplay,
  getProfileMetricDisplayUnit,
  getProfileMetricDisplayValue,
  isProfileMetricValueWithinRange,
} from "@repo/core/athlete-inputs";
import {
  type ProfileMetricType,
  profileMetricDefinitions,
} from "@repo/core/schemas/profile-metrics";
import type { PreferredUnitSystem } from "@repo/core/units";
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
  value: z.coerce.number().nonnegative("Enter zero or a positive value."),
});

export type ProfileMetricFormInput = z.input<typeof profileMetricFormSchema>;
export type ProfileMetricFormValues = z.infer<typeof profileMetricFormSchema>;

type ProfileMetricFormProps = {
  metricType: ProfileMetricType;
  onCancel: () => void;
  onSubmit: (values: ProfileMetricFormValues) => Promise<unknown> | unknown;
  pending?: boolean;
  unitSystem?: PreferredUnitSystem;
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
    value: metric?.value ?? profileMetricDefinitions[metricType].defaultValue,
  };
}

export function ProfileMetricForm({
  metricType,
  onCancel,
  onSubmit,
  pending = false,
  unitSystem = "metric",
  values,
}: ProfileMetricFormProps) {
  const definition = profileMetricDefinitions[metricType];
  const decimals = definition.decimals;
  const precision = 10 ** decimals;
  const canonicalValues = values ?? getProfileMetricFormValues(metricType);
  const canonicalInitialValue = Number(canonicalValues.value);
  const roundDisplayValue = (value: number) => Number(value.toFixed(decimals));
  const initialDisplayValue = roundDisplayValue(
    getProfileMetricDisplayValue(metricType, canonicalInitialValue, unitSystem),
  );
  const displayValues = {
    ...canonicalValues,
    value: initialDisplayValue,
  };
  const displayUnit = getProfileMetricDisplayUnit(metricType, unitSystem);
  const displayMin = roundDisplayValue(
    Math.round(getProfileMetricDisplayValue(metricType, definition.min, unitSystem) * precision) /
      precision,
  );
  const displayMax = roundDisplayValue(
    Math.round(getProfileMetricDisplayValue(metricType, definition.max, unitSystem) * precision) /
      precision,
  );
  const form = useZodForm<ProfileMetricFormInput, undefined, ProfileMetricFormValues>({
    schema: profileMetricFormSchema,
    values: displayValues,
  });
  const submit = useZodFormSubmit<ProfileMetricFormValues>({
    form,
    onSubmit: async (formValues) => {
      const canonicalValue =
        formValues.value === initialDisplayValue
          ? canonicalInitialValue
          : formValues.value === displayMin
            ? definition.min
            : formValues.value === displayMax
              ? definition.max
              : getCanonicalProfileMetricValueFromDisplay(metricType, formValues.value, unitSystem);
      if (canonicalValue == null || !isProfileMetricValueWithinRange(metricType, canonicalValue)) {
        throw new Error(`Enter a value between ${displayMin} and ${displayMax} ${displayUnit}.`);
      }
      await onSubmit({ ...formValues, value: canonicalValue });
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
          decimals={decimals}
          label={`Value (${displayUnit})`}
          max={displayMax}
          min={displayMin}
          name="value"
          unitLabel={displayUnit}
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
