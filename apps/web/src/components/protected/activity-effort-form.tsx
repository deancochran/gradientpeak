import {
  type ActivityEffortCategory,
  type ActivityEffortType,
  activityEffortDefinitions,
  getActivityEffortDefinition,
  getActivityEffortDefinitionsForCategory,
  getDefaultActivityEffortDefinition,
} from "@repo/core/athlete-inputs";
import { Button } from "@repo/ui/components/button";
import { DialogFooter } from "@repo/ui/components/dialog";
import {
  Form,
  FormBoundedNumberField,
  FormControl,
  FormDateTimeField,
  FormField,
  FormIntegerStepperField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useEffect } from "react";

import {
  type ActivityEffortFormInput,
  type ActivityEffortFormValues,
  activityEffortFormSchema,
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

export const SWIM_THRESHOLD_DURATION_SECONDS = 20 * 60;

export function toDateTimeLocalValue(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offsetDate.toISOString().slice(0, 16);
}

export function getActivityEffortDefaultValues(): ActivityEffortFormInput {
  const definition = activityEffortDefinitions[0];

  return {
    activity_category: definition.activityCategory,
    duration_seconds: definition.defaultDurationSeconds,
    effort_type: definition.effortType,
    recorded_at: toDateTimeLocalValue(new Date()),
    unit: definition.unit,
    value: definition.defaultValue,
  };
}

const activityEffortCategoryOptions = Array.from(
  new Map(
    activityEffortDefinitions.map((definition) => [
      definition.activityCategory,
      definition.label.split(" ")[0] ?? definition.activityCategory,
    ]),
  ),
).map(([value, label]) => ({ label, value }));

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
  const selectedCategory = form.watch("activity_category") as ActivityEffortCategory;
  const selectedEffortType = form.watch("effort_type") as ActivityEffortType;
  const effortDefinitions = getActivityEffortDefinitionsForCategory(selectedCategory);
  const selectedDefinition = getActivityEffortDefinition({
    activityCategory: selectedCategory,
    effortType: selectedEffortType,
  });
  const activeDefinition =
    selectedDefinition ?? effortDefinitions[0] ?? getDefaultActivityEffortDefinition();
  const durationPresets = Array.from(
    new Set([
      ...activeDefinition.durationPresets,
      ...(selectedCategory === "swim" ? [SWIM_THRESHOLD_DURATION_SECONDS] : []),
    ]),
  ).sort((left, right) => left - right);
  const applyDefinitionDefaults = (definition: typeof activeDefinition) => {
    form.setValue("effort_type", definition.effortType, { shouldValidate: true });
    form.setValue("duration_seconds", definition.defaultDurationSeconds, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("value", definition.defaultValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
    form.setValue("unit", definition.unit, { shouldValidate: true });
  };

  useEffect(() => {
    if (!selectedDefinition) {
      form.setValue("effort_type", activeDefinition.effortType, { shouldValidate: true });
    }
    if (!selectedDefinition) {
      form.setValue("duration_seconds", activeDefinition.defaultDurationSeconds, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("value", activeDefinition.defaultValue, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    form.setValue("unit", activeDefinition.unit, { shouldValidate: true });
  }, [activeDefinition, form, selectedDefinition]);

  const submit = useZodFormSubmit<ActivityEffortFormValues>({
    form,
    onError: onSubmitError,
    onSubmit: async (values) => {
      const definition = getActivityEffortDefinition({
        activityCategory: values.activity_category,
        effortType: values.effort_type,
      });
      if (!definition) {
        form.setError("root", { message: "Choose a supported activity and effort type." });
        return;
      }

      await onSubmit({ ...values, unit: definition.unit });
    },
    shouldRethrow: false,
    submittingLabel,
  });
  const isPending = pending || submit.isSubmitting;
  const submitButtonState = submit.getSubmitButtonState({
    disabled: pending,
    label: submitLabel,
    submittingLabel,
  });
  const rootError = form.formState.errors.root?.message ?? submit.submitError?.message;
  const actions = (
    <>
      <Button onClick={onCancel} type="button" variant="outline">
        {cancelLabel}
      </Button>
      <LoadingButton
        disabled={submitButtonState.disabled}
        loading={isPending}
        loadingLabel={submitButtonState.loadingLabel}
        type="submit"
      >
        {submitButtonState.label}
      </LoadingButton>
    </>
  );

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={submit.handleSubmit}>
        <FormField
          control={form.control}
          name="activity_category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Activity category</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-2">
                  {activityEffortCategoryOptions.map((option) => {
                    const selected = option.value === selectedCategory;

                    return (
                      <Button
                        aria-pressed={selected}
                        className="flex-1"
                        key={option.value}
                        onClick={() => {
                          const nextDefinitions = getActivityEffortDefinitionsForCategory(
                            option.value,
                          );
                          const nextDefinition =
                            getActivityEffortDefinition({
                              activityCategory: option.value,
                              effortType: selectedEffortType,
                            }) ??
                            nextDefinitions[0] ??
                            getDefaultActivityEffortDefinition();

                          field.onChange(option.value);
                          if (nextDefinition.id !== activeDefinition.id) {
                            applyDefinitionDefaults(nextDefinition);
                          }
                        }}
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        {option.label}
                      </Button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="effort_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Effort type</FormLabel>
              <FormControl>
                <div className="flex flex-wrap gap-2">
                  {effortDefinitions.map((definition) => {
                    const selected = definition.effortType === selectedEffortType;

                    return (
                      <Button
                        aria-pressed={selected}
                        className="flex-1"
                        key={definition.id}
                        onClick={() => {
                          field.onChange(definition.effortType);
                          if (definition.id !== activeDefinition.id) {
                            applyDefinitionDefaults(definition);
                          }
                        }}
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        {definition.valueLabel}
                      </Button>
                    );
                  })}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormIntegerStepperField
          control={form.control}
          label="Duration (seconds)"
          max={7200}
          min={1}
          name="duration_seconds"
          step={5}
        />
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Duration options</legend>
          {durationPresets.map((duration) => (
            <Button
              key={duration}
              onClick={() =>
                form.setValue("duration_seconds", duration, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
              size="sm"
              type="button"
              variant={form.watch("duration_seconds") === duration ? "default" : "outline"}
            >
              {duration < 60 ? `${duration}s` : `${duration / 60} min`}
            </Button>
          ))}
        </fieldset>
        {selectedCategory === "swim" ? (
          <FormField
            control={form.control}
            name="value"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormControl>
                  <PaceSecondsField
                    error={fieldState.error?.message}
                    formControl={form.control}
                    helperText="Use a sustained best effort; 20 minutes is threshold-relevant when the segment is continuous and observed."
                    id="swim-effort-pace"
                    label="Swim pace"
                    onBlur={field.onBlur}
                    onChangeSeconds={(seconds) => field.onChange(seconds ? 100 / seconds : null)}
                    unitLabel="/100m"
                    valueSeconds={
                      typeof field.value === "number" && field.value > 0 ? 100 / field.value : null
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormBoundedNumberField
            control={form.control}
            decimals={activeDefinition.decimals}
            label={activeDefinition.valueLabel}
            max={activeDefinition.max}
            min={activeDefinition.min}
            name="value"
          />
        )}
        <div className="space-y-1">
          <p className="text-sm font-medium">Unit</p>
          <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            {selectedCategory === "swim" ? "/100m display · m/s stored" : activeDefinition.unit}
          </p>
        </div>
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
