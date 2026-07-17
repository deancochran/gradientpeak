import {
  type CssTestObservationInput,
  calculateCssFrom400m200mTest,
  cssTestTimesSchema,
} from "@repo/core";
import { formatProfileMetricValue } from "@repo/core/athlete-inputs";
import { Button } from "@repo/ui/components/button";
import { DialogFooter } from "@repo/ui/components/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@repo/ui/components/form";
import { LoadingButton } from "@repo/ui/components/loading";
import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { useRef } from "react";
import type { z } from "zod";

type CssTestFormFields = z.infer<typeof cssTestTimesSchema>;
type CssTestFormProps = {
  onCancel: () => void;
  onSubmit: (values: CssTestObservationInput) => Promise<void> | void;
  pending?: boolean;
};

const defaultValues: CssTestFormFields = {
  time400Seconds: 360,
  time200Seconds: 168,
};

export function CssTestForm({ onCancel, onSubmit, pending = false }: CssTestFormProps) {
  const pendingSubmission = useRef<{
    fingerprint: string;
    operationId: string;
    recordedAt: Date;
  } | null>(null);
  const form = useZodForm<CssTestFormFields>({
    schema: cssTestTimesSchema,
    values: defaultValues,
  });
  const submit = useZodFormSubmit<CssTestFormFields>({
    form,
    onSubmit: async (formValues) => {
      const fingerprint = `${formValues.time400Seconds}:${formValues.time200Seconds}`;
      if (pendingSubmission.current?.fingerprint !== fingerprint) {
        pendingSubmission.current = {
          fingerprint,
          operationId: crypto.randomUUID(),
          recordedAt: new Date(),
        };
      }
      const submission = pendingSubmission.current;
      await onSubmit({
        ...formValues,
        operationId: submission.operationId,
        recordedAt: submission.recordedAt,
      });
      pendingSubmission.current = null;
    },
    shouldRethrow: false,
    submittingLabel: "Recording test...",
  });
  const values = form.watch();
  const parsed = cssTestTimesSchema.safeParse(values);
  const preview = parsed.success
    ? formatProfileMetricValue({
        metric_type: "css_seconds_per_100m",
        value: calculateCssFrom400m200mTest(parsed.data).cssSecondsPer100m,
      })
    : null;
  const buttonState = submit.getSubmitButtonState({
    disabled: pending,
    label: "Record CSS test",
    submittingLabel: "Recording test...",
  });

  return (
    <Form {...form}>
      <form className="space-y-5" onSubmit={submit.handleSubmit}>
        {(
          [
            ["time400Seconds", "400m time"],
            ["time200Seconds", "200m time"],
          ] as const
        ).map(([name, label]) => (
          <FormField
            control={form.control}
            key={name}
            name={name}
            render={({ field, fieldState }) => (
              <FormItem>
                <FormControl>
                  <PaceSecondsField
                    error={fieldState.error?.message}
                    formControl={form.control}
                    helperText={`Enter your total ${label.toLowerCase()} in minutes and seconds.`}
                    id={`css-test-${name}`}
                    label={label}
                    onBlur={field.onBlur}
                    onChangeSeconds={field.onChange}
                    required
                    testId={`css-test-${name}`}
                    unitLabel="min:sec"
                    valueSeconds={typeof field.value === "number" ? field.value : null}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}

        <div aria-live="polite" className="rounded-xl border bg-muted/30 p-4">
          <p className="text-sm font-medium">Calculated CSS preview</p>
          <p className="mt-1 text-2xl font-semibold">{preview ?? "Enter valid test times"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This records one validated CSS test and its paired efforts atomically.
          </p>
        </div>

        {submit.submitError?.message ? (
          <p className="text-sm text-destructive" role="alert">
            CSS test was not recorded: {submit.submitError.message}
          </p>
        ) : null}

        <DialogFooter>
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <LoadingButton
            disabled={buttonState.disabled}
            loading={pending || submit.isSubmitting}
            loadingLabel={buttonState.loadingLabel}
            type="submit"
          >
            {buttonState.label}
          </LoadingButton>
        </DialogFooter>
      </form>
    </Form>
  );
}
