import {
  type CssTestObservationInput,
  calculateCssFrom400m200mTest,
  cssTestTimesSchema,
} from "@repo/core";
import { formatProfileMetricValue } from "@repo/core/athlete-inputs";
import { Button } from "@repo/ui/components/button";
import { Form } from "@repo/ui/components/form";
import { PaceSecondsField } from "@repo/ui/components/pace-seconds-field";
import { Text } from "@repo/ui/components/text";
import { useZodForm, useZodFormSubmit } from "@repo/ui/hooks";
import { randomUUID } from "expo-crypto";
import React from "react";
import { Controller } from "react-hook-form";
import { View } from "react-native";
import type { z } from "zod";

type CssTestFormFields = z.infer<typeof cssTestTimesSchema>;
type CssTestResult = { css_seconds_per_100m: number };

type CssTestFormProps = {
  onSubmit: (values: CssTestObservationInput) => Promise<CssTestResult>;
};

export function CssTestForm({ onSubmit }: CssTestFormProps) {
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);
  const pendingSubmission = React.useRef<{
    fingerprint: string;
    operationId: string;
    recordedAt: Date;
  } | null>(null);
  const form = useZodForm<CssTestFormFields>({
    schema: cssTestTimesSchema,
    values: { time400Seconds: 360, time200Seconds: 168 },
  });
  const values = form.watch();
  const parsed = cssTestTimesSchema.safeParse(values);
  const preview = parsed.success
    ? formatProfileMetricValue({
        metric_type: "css_seconds_per_100m",
        value: calculateCssFrom400m200mTest(parsed.data).cssSecondsPer100m,
      })
    : null;
  const submit = useZodFormSubmit<CssTestFormFields>({
    form,
    shouldRethrow: false,
    submittingLabel: "Recording test...",
    onSubmit: async (formValues) => {
      setSuccessMessage(null);
      const fingerprint = `${formValues.time400Seconds}:${formValues.time200Seconds}`;
      if (pendingSubmission.current?.fingerprint !== fingerprint) {
        pendingSubmission.current = {
          fingerprint,
          operationId: randomUUID(),
          recordedAt: new Date(),
        };
      }
      const submission = pendingSubmission.current;
      const result = await onSubmit({
        ...formValues,
        operationId: submission.operationId,
        recordedAt: submission.recordedAt,
      });
      pendingSubmission.current = null;
      setSuccessMessage(
        `CSS recorded: ${formatProfileMetricValue({
          metric_type: "css_seconds_per_100m",
          value: result.css_seconds_per_100m,
        })}`,
      );
    },
  });
  const buttonState = submit.getSubmitButtonState({
    disabled: submit.isSubmitting,
    label: "Record CSS test",
    submittingLabel: "Recording test...",
  });

  return (
    <Form {...form}>
      <View className="gap-5">
        {(
          [
            ["time400Seconds", "400m time"],
            ["time200Seconds", "200m time"],
          ] as const
        ).map(([name, label]) => (
          <Controller
            control={form.control}
            key={name}
            name={name}
            render={({ field, fieldState }) => (
              <PaceSecondsField
                error={fieldState.error?.message}
                formControl={form.control}
                helperText={`Enter your total ${label.toLowerCase()} in minutes and seconds.`}
                id={`css-test-${name}`}
                label={label}
                onBlur={field.onBlur}
                onChangeSeconds={(seconds) => {
                  setSuccessMessage(null);
                  field.onChange(seconds);
                }}
                required
                testId={`css-test-${name}`}
                unitLabel="min:sec"
                valueSeconds={typeof field.value === "number" ? field.value : null}
              />
            )}
          />
        ))}

        <View
          accessibilityLiveRegion="polite"
          className="gap-1 rounded-2xl border border-border bg-muted/20 p-4"
          testID="css-test-preview"
        >
          <Text className="text-sm font-medium text-foreground">Calculated CSS preview</Text>
          <Text className="text-2xl font-semibold text-foreground">
            {preview ?? "Enter valid test times"}
          </Text>
          <Text className="text-sm text-muted-foreground">
            Both efforts and the validated CSS are recorded together as one test.
          </Text>
        </View>

        {submit.submitError?.message ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            CSS test was not recorded: {submit.submitError.message}
          </Text>
        ) : null}
        {successMessage ? (
          <Text accessibilityRole="alert" className="text-sm font-medium text-primary">
            {successMessage}
          </Text>
        ) : null}

        <Button
          disabled={buttonState.disabled}
          onPress={submit.handleSubmit}
          testId="css-test-submit"
        >
          <Text>{buttonState.label}</Text>
        </Button>
      </View>
    </Form>
  );
}
