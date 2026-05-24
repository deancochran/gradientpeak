import { useCallback, useState } from "react";
import type { FieldErrors, FieldValues, UseFormReturn } from "react-hook-form";

type UseZodFormSubmitParams<TFieldValues extends FieldValues> = {
  form: UseFormReturn<any>;
  onSubmit: (values: TFieldValues) => Promise<void> | void;
  onError?: (error: unknown) => Promise<void> | void;
  onValidationError?: (errors: FieldErrors) => void;
  shouldRethrow?: boolean;
  submittingLabel?: string;
};

type SubmitButtonStateOptions = {
  disabled?: boolean;
  label: string;
  submittingLabel?: string;
};

export function useZodFormSubmit<TFieldValues extends FieldValues>(
  params: UseZodFormSubmitParams<TFieldValues>,
) {
  const {
    form,
    onError,
    onSubmit,
    onValidationError,
    shouldRethrow = true,
    submittingLabel,
  } = params;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const defaultSubmittingLabel = submittingLabel ?? "Saving...";

  const handleSubmit = useMemoizedHandle({
    form,
    onError,
    onSubmit,
    onValidationError,
    setIsSubmitting,
    setSubmitError,
    shouldRethrow,
  });

  const resetSubmitState = useCallback(() => {
    setIsSubmitting(false);
    setSubmitError(null);
  }, []);

  const getSubmitButtonState = useCallback(
    (options: SubmitButtonStateOptions) => ({
      disabled: Boolean(options.disabled || isSubmitting),
      label: isSubmitting ? (options.submittingLabel ?? defaultSubmittingLabel) : options.label,
      loading: isSubmitting,
      loadingLabel: options.submittingLabel ?? defaultSubmittingLabel,
    }),
    [defaultSubmittingLabel, isSubmitting],
  );

  return {
    getSubmitButtonState,
    handleSubmit,
    isSubmitting,
    resetSubmitState,
    submitButtonState: {
      disabled: isSubmitting,
      label: defaultSubmittingLabel,
      loading: isSubmitting,
      loadingLabel: defaultSubmittingLabel,
    },
    submitError,
    submittingLabel: defaultSubmittingLabel,
  };
}

function useMemoizedHandle<TFieldValues extends FieldValues>({
  form,
  onError,
  onSubmit,
  onValidationError,
  setIsSubmitting,
  setSubmitError,
  shouldRethrow,
}: UseZodFormSubmitParams<TFieldValues> & {
  setIsSubmitting: (value: boolean) => void;
  setSubmitError: (value: Error | null) => void;
}) {
  return useCallback(
    form.handleSubmit(
      async (values) => {
        setSubmitError(null);
        setIsSubmitting(true);
        try {
          await onSubmit(values);
        } catch (error) {
          setSubmitError(error instanceof Error ? error : new Error("Form submission failed"));
          await onError?.(error);
          if (shouldRethrow) {
            throw error;
          }
        } finally {
          setIsSubmitting(false);
        }
      },
      (errors) => {
        setSubmitError(null);
        onValidationError?.(errors);
      },
    ),
    [],
  );
}
